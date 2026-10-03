import { createHash } from "node:crypto";
import { and, eq, desc, sql } from "drizzle-orm";
import { parseThreadUrl, seedSource, type Source } from "@schengen/core";
import { getDatabase } from "./client";
import { sources, sourceRevisions } from "./schema";

export class SourceError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function present(row: typeof sources.$inferSelect): Source {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    reason: row.reason,
    body: row.currentBody,
    capturedAt: row.capturedAt?.toISOString() ?? null,
    version: row.version,
  };
}

export async function seedInitialSource() {
  await getDatabase()
    .insert(sources)
    .values({
      id: seedSource.id,
      url: seedSource.url,
      title: seedSource.title,
      reason: seedSource.reason,
    })
    .onConflictDoNothing();
}

export async function listSources(query = "") {
  const db = getDatabase();
  const selection = {
    source: sources,
    reviewedCount: sql<number>`(SELECT count(*) FROM observations o WHERE o.source_id = "sources"."id" AND o.source_version = "sources"."version" AND o.status = 'approved')`,
  };
  const vector = sql`to_tsvector('english', ${sources.title} || ' ' || ${sources.reason} || ' ' || ${sources.currentBody})`;
  const tsquery = sql`websearch_to_tsquery('english', ${query})`;
  const rows = query.trim()
    ? await db
        .select(selection)
        .from(sources)
        .where(
          sql`${vector} @@ ${tsquery} OR ${sources.id} = ${query
            .toLowerCase()
            .trim()}`
        )
        .orderBy(
          sql`ts_rank(${vector}, ${tsquery}) DESC`,
          desc(sources.createdAt)
        )
    : await db.select(selection).from(sources).orderBy(desc(sources.createdAt));
  return rows.map((row) => ({
    ...present(row.source),
    reviewedCount: Number(row.reviewedCount),
  }));
}

export async function getSource(id: string) {
  const [row] = await getDatabase()
    .select()
    .from(sources)
    .where(eq(sources.id, id));
  if (!row) throw new SourceError("Source not found.", 404);
  return present(row);
}

export async function registerSource(input: {
  url: string;
  title: string;
  reason: string;
}) {
  let parsed: ReturnType<typeof parseThreadUrl>;
  try {
    parsed = parseThreadUrl(input.url);
  } catch {
    throw new SourceError("Use a valid HTTPS r/SchengenVisa post link.", 400);
  }
  const [row] = await getDatabase()
    .insert(sources)
    .values({
      ...parsed,
      title: input.title.trim() || `Reddit thread · ${parsed.id}`,
      reason: input.reason.trim(),
    })
    .onConflictDoNothing()
    .returning();
  if (!row)
    throw new SourceError("This thread is already in your library.", 409);
  return present(row);
}

export async function captureSource(
  id: string,
  body: string,
  expectedVersion: number
) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, id))
      .for("update");
    if (!current) throw new SourceError("Source not found.", 404);
    // An identical retry is safe, even if its acknowledgement was lost.
    if (current.currentBody === body) return present(current);
    if (current.version !== expectedVersion)
      throw new SourceError(
        "This source changed since you opened it. Reload before saving; your editor text has been kept.",
        409
      );
    const hash = createHash("sha256").update(body, "utf8").digest("hex");
    await tx
      .insert(sourceRevisions)
      .values({ sourceId: id, body, contentHash: hash })
      .onConflictDoNothing();
    const [revision] = await tx
      .select()
      .from(sourceRevisions)
      .where(
        and(
          eq(sourceRevisions.sourceId, id),
          eq(sourceRevisions.contentHash, hash)
        )
      );
    const [saved] = await tx
      .update(sources)
      .set({
        currentBody: body,
        currentRevisionId: revision.id,
        version: current.version + 1,
        capturedAt: body.trim() ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, id))
      .returning();
    return present(saved);
  });
}

export async function listRevisions(id: string) {
  await getSource(id);
  const rows = await getDatabase()
    .select()
    .from(sourceRevisions)
    .where(eq(sourceRevisions.sourceId, id))
    .orderBy(desc(sourceRevisions.observedAt));
  return rows.map((row) => ({
    ...row,
    observedAt: row.observedAt.toISOString(),
  }));
}
