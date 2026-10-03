import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { getDatabase } from "../src/client";
import { sourceSnapshots } from "../src/schema";
import { parseThreadUrl } from "@schengen/core";
import {
  getSource,
  registerSource,
  captureSource,
  captureComment,
  evidenceWorkspace,
  getPool,
  SourceError,
} from "../src/index";

config({ path: "../../.env", quiet: true });
// Explicit files only: no crawler, arbitrary URL fetch, or background collection.
const filename = process.argv[2];
if (!filename)
  throw new Error("Usage: pnpm source:import /absolute/path/capture.json");
try {
  const raw = await readFile(resolve(filename), "utf8");
  if (Buffer.byteLength(raw) > 1_000_000)
    throw new Error("Capture file is too large.");
  const input = JSON.parse(raw);
  if (
    input.schemaVersion !== 1 ||
    typeof input.url !== "string" ||
    typeof input.title !== "string" ||
    input.title.length > 160 ||
    typeof input.body !== "string" ||
    !input.body.trim() ||
    input.body.length > 500_000 ||
    !Array.isArray(input.comments) ||
    input.comments.length > 100
  )
    throw new Error("Invalid capture file. See README for schema.");
  const parsed = parseThreadUrl(input.url);
  for (const comment of input.comments) {
    if (
      typeof comment.url !== "string" ||
      comment.url.length > 2000 ||
      typeof comment.body !== "string" ||
      !comment.body.trim() ||
      comment.body.length > 50_000 ||
      (comment.parentId !== null && typeof comment.parentId !== "string") ||
      !["unknown", "other", "original_poster"].includes(comment.attribution)
    )
      throw new Error("Invalid comment record.");
    const url = new URL(comment.url);
    const match = url.pathname.match(
      /^\/r\/SchengenVisa\/comments\/([a-z0-9]+)\/[^/]+\/([a-z0-9]+)\/?$/i
    );
    if (
      url.protocol !== "https:" ||
      !["reddit.com", "www.reddit.com", "old.reddit.com"].includes(
        url.hostname
      ) ||
      url.username ||
      url.password ||
      url.port ||
      !match ||
      match[1].toLowerCase() !== parsed.id
    )
      throw new Error("A comment permalink does not belong to this thread.");
  }
  let source;
  try {
    source = await getSource(parsed.id);
  } catch (error) {
    if (!(error instanceof SourceError) || error.status !== 404) throw error;
    source = await registerSource({
      url: input.url,
      title: input.title,
      reason: "Selected public thread capture; partial coverage.",
    });
  }
  if (source.body && source.body !== input.body)
    throw new Error(
      "Existing post text differs. Review and update in the UI instead of overwriting it during import."
    );
  const hash = createHash("sha256").update(raw).digest("hex");
  await mkdir("../../.local/snapshots", { recursive: true });
  const path = `../../.local/snapshots/${parsed.id}-${hash}.json`;
  try {
    await writeFile(path, raw, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await getDatabase()
    .insert(sourceSnapshots)
    .values({
      contentHash: hash,
      sourceId: parsed.id,
      relativePath: `.local/snapshots/${parsed.id}-${hash}.json`,
    })
    .onConflictDoNothing();
  console.log(
    `Preserved input snapshot: .local/snapshots/${parsed.id}-${hash}.json`
  );
  source = await captureSource(parsed.id, input.body, source.version ?? 0);
  for (const comment of input.comments) {
    const workspace = await evidenceWorkspace(parsed.id);
    await captureComment(parsed.id, {
      ...comment,
      expectedVersion: workspace.sourceVersion,
    });
  }
  console.log(
    `Imported selected capture for ${parsed.id}; ${input.comments.length} comments supplied. Nothing was approved. Re-running identical captures is safe.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Import failed.");
  console.error(
    "Import stopped. Earlier successful captures remain saved; inspect the thread and resume with the same file after correcting the problem."
  );
  process.exitCode = 1;
} finally {
  await getPool().end();
}
