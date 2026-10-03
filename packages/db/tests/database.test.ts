import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  captureSource,
  captureComment,
  evidenceWorkspace,
  proposeObservation,
  reviewObservation,
  retrieveEvidence,
  evidenceStillCurrent,
  hybridEvidenceStillCurrent,
  reviewReadiness,
  registerSource,
  listSources,
  listRevisions,
  getSource,
  getDatabase,
  getPool,
  SourceError,
} from "../src/index";

config({ path: "../../.env", quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("_test"))
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated database ending in _test."
  );
process.env.DATABASE_URL = testUrl;
before(async () => {
  await migrate(getDatabase(), { migrationsFolder: "./migrations" });
});
beforeEach(async () => {
  await getPool().query(
    "TRUNCATE passages, source_snapshots, observations, comments, sources, source_revisions"
  );
});
after(async () => {
  await getPool().end();
});

const input = {
  url: "https://www.reddit.com/r/SchengenVisa/comments/abc123/test/",
  title: "Synthetic test source",
  reason: "Integration test only",
};

test("canonical URLs cannot create duplicate sources", async () => {
  await registerSource(input);
  await assert.rejects(
    registerSource({
      ...input,
      url: "https://old.reddit.com/r/SchengenVisa/comments/abc123/",
    }),
    (error: unknown) => error instanceof SourceError && error.status === 409
  );
  assert.equal((await listSources()).length, 1);
});

test("capture revisions are immutable, replay safe, and retain previous evidence", async () => {
  const source = await registerSource(input);
  const first = await captureSource(source.id, "Synthetic first passage", 0);
  const replay = await captureSource(source.id, first.body, 0);
  assert.equal(replay.version, 1);
  await captureSource(source.id, "Synthetic corrected passage", 1);
  const revisions = await listRevisions(source.id);
  assert.equal(revisions.length, 2);
  assert.deepEqual(
    new Set(revisions.map((row) => row.body)),
    new Set(["Synthetic first passage", "Synthetic corrected passage"])
  );
  await assert.rejects(
    getPool().query(
      "UPDATE source_revisions SET body = 'changed' WHERE id = $1",
      [revisions[0].id]
    ),
    /immutable/
  );
  assert.equal((await listRevisions(source.id)).length, 2);
});

test("concurrent editors cannot overwrite a newer capture", async () => {
  const source = await registerSource(input);
  const results = await Promise.allSettled([
    captureSource(source.id, "Synthetic editor A", 0),
    captureSource(source.id, "Synthetic editor B", 0),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1
  );
  const failure = results.find((result) => result.status === "rejected");
  assert.ok(
    failure?.status === "rejected" &&
      failure.reason instanceof SourceError &&
      failure.reason.status === 409
  );
  assert.equal((await getSource(source.id)).version, 1);
  assert.equal((await listRevisions(source.id)).length, 1);
});

test("PostgreSQL search retrieves captured text and treats hostile search text as data", async () => {
  const source = await registerSource(input);
  await captureSource(
    source.id,
    "Synthetic records mention freelance contracts and insurance policies.",
    0
  );
  assert.equal((await listSources("freelancer contracts"))[0].id, source.id);
  assert.equal((await listSources("freelance contracts"))[0].id, source.id);
  assert.equal((await listSources("insurance"))[0].id, source.id);
  assert.deepEqual(await listSources("'; DROP TABLE sources; --"), []);
  assert.equal((await getSource(source.id)).id, source.id);
});

test("comments preserve reply context, separate subjects and reject unrelated permalinks", async () => {
  const source = await registerSource(input);
  await captureSource(source.id, "Synthetic original applicant report.", 0);
  const base = {
    url: input.url + "reply1/",
    body: "Synthetic commenter: I carried insurance.",
    parentId: null,
    attribution: "other",
    expectedVersion: 1,
  };
  await assert.rejects(
    captureComment(source.id, {
      ...base,
      url: base.url.replace("abc123", "other12"),
    }),
    /belonging/
  );
  await assert.rejects(
    captureComment(source.id, { ...base, parentId: "missing" }),
    /parent/
  );
  const reply = await captureComment(source.id, base);
  assert.equal((await captureComment(source.id, base)).id, reply.id);
  await captureComment(source.id, {
    ...base,
    url: input.url + "reply2/",
    parentId: reply.id,
    attribution: "original_poster",
    body: "Synthetic OP: I submitted insurance.",
    expectedVersion: 2,
  });
  const workspace = await evidenceWorkspace(source.id);
  assert.equal(workspace.sourceVersion, 3);
  assert.equal(workspace.comments[1].parentId, reply.id);
  const observation = await proposeObservation(source.id, {
    sourceVersion: 3,
    commentId: reply.id,
    summary: "Another commenter reports carrying insurance.",
    quote: "I carried insurance.",
    country: "unknown",
    profile: "unknown",
    action: "carried",
  });
  assert.equal(observation.subject, "comment:reply1");
  await assert.rejects(
    getPool().query("UPDATE comments SET body = 'changed' WHERE id = $1", [
      reply.id,
    ]),
    /immutable/
  );
});

test("only approved current evidence is retrieved; context changes invalidate approval", async () => {
  const source = await registerSource(input);
  await captureSource(
    source.id,
    "Synthetic freelancer: I submitted contracts to Switzerland.",
    0
  );
  const draft = await proposeObservation(source.id, {
    sourceVersion: 1,
    commentId: null,
    summary: "Applicant reports submitting freelance contracts.",
    quote: "I submitted contracts to Switzerland.",
    country: "CH",
    profile: "freelancer",
    action: "submitted",
  });
  assert.deepEqual(await retrieveEvidence("contracts"), []);
  assert.equal((await reviewReadiness()).drafts, 1);
  assert.deepEqual(await retrieveEvidence("What documents do I need?", "CH", "freelancer", true), []);
  await reviewObservation(source.id, draft.id, "approved");
  assert.equal(
    (await retrieveEvidence("contracts", "CH", "freelancer"))[0].url,
    source.url
  );
  assert.equal((await reviewReadiness()).approved, 1);
  assert.equal((await reviewReadiness()).drafts, 0);
  assert.equal((await retrieveEvidence("What documents do I need?", "CH", "freelancer", true)).length, 1);
  assert.deepEqual(await retrieveEvidence("What documents do I need?", "FR", "freelancer", true), []);
  const answerSnapshot = await retrieveEvidence("contracts");
  assert.equal(await evidenceStillCurrent(answerSnapshot), true);
  assert.equal((await listSources())[0].reviewedCount, 1);
  assert.deepEqual(await retrieveEvidence("contracts", "FR"), []);
  assert.deepEqual(await retrieveEvidence("contracts", "CH", "salaried"), []);
  await captureComment(source.id, {
    url: input.url + "clarify/",
    body: "Synthetic clarification: not all contracts were accepted.",
    parentId: null,
    attribution: "original_poster",
    expectedVersion: 1,
  });
  assert.deepEqual(await retrieveEvidence("contracts"), []);
  assert.equal(
    (await evidenceWorkspace(source.id)).observations[0].stale,
    true
  );
  assert.equal(await evidenceStillCurrent(answerSnapshot), false);
  assert.equal((await reviewReadiness()).approved, 0);
  assert.deepEqual(await retrieveEvidence("What documents do I need?", "CH", "freelancer", true), []);
  assert.equal((await listSources())[0].reviewedCount, 0);
  await assert.rejects(
    reviewObservation(source.id, draft.id, "approved"),
    /stale/
  );
  const fresh = await proposeObservation(source.id, {
    sourceVersion: 2,
    commentId: "clarify",
    summary: "Applicant clarifies contracts were not all accepted.",
    quote: "not all contracts were accepted.",
    country: "CH",
    profile: "freelancer",
    action: "returned",
  });
  await reviewObservation(source.id, fresh.id, "approved");
  assert.equal(
    (await retrieveEvidence("contracts"))[0].url,
    input.url + "clarify/"
  );
  await reviewObservation(source.id, fresh.id, "rejected");
  assert.deepEqual(await retrieveEvidence("contracts"), []);
});

test("invented quotes, foreign comments, and stale extraction cannot become observations", async () => {
  const source = await registerSource(input);
  await captureSource(source.id, "Synthetic bank statements submitted.", 0);
  const candidate = {
    sourceVersion: 1,
    commentId: null,
    summary: "Applicant reports bank statements.",
    quote: "bank statements",
    country: "unknown",
    profile: "unknown",
    action: "submitted",
  };
  await assert.rejects(
    proposeObservation(source.id, {
      ...candidate,
      quote: "mandatory bank statements",
    }),
    /exact passage/
  );
  await assert.rejects(
    proposeObservation(source.id, { ...candidate, commentId: "missing" }),
    /not found/
  );
  await captureSource(source.id, "Synthetic bank statements not submitted.", 1);
  await assert.rejects(
    proposeObservation(source.id, candidate),
    /Evidence changed/
  );
  assert.deepEqual((await evidenceWorkspace(source.id)).observations, []);
});


test("captured passage citations become unusable when the source changes", async () => {
  const source = await registerSource(input);
  await captureSource(source.id, "Synthetic captured applicant text.", 0);
  const vector = Array(768).fill(0); vector[0] = 1;
  const id = "00000000-0000-0000-0000-000000000001";
  await getPool().query(`INSERT INTO passages (id,source_id,source_version,body,start_offset,model_key,embedding)
    VALUES ($1,$2,1,$3,0,'synthetic-vector-fixture',$4::vector)`,
    [id,source.id,"Synthetic captured applicant text.",JSON.stringify(vector)]);
  const citation = { id, sourceVersion: 1, reviewStatus: "captured_unreviewed" as const };
  assert.equal(await hybridEvidenceStillCurrent([citation]), true);
  await captureSource(source.id, "Synthetic corrected text.", 1);
  assert.equal(await hybridEvidenceStillCurrent([citation]), false);
});
