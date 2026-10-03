import { createHash } from "node:crypto";
import { getPool } from "./client";
import { retrieveEvidence, evidenceStillCurrent } from "./evidence";

export type RetrievedEvidence = Awaited<ReturnType<typeof retrieveEvidence>>[number] & {
  reviewStatus: "reviewed" | "captured_unreviewed";
};

// Preserve literal substrings and offsets. Paragraph grouping keeps document lists together.
export function chunkPassage(body: string) {
  const spans: { body: string; start: number }[] = [];
  let start = 0;
  while (start < body.length) {
    let end = Math.min(start + 1500, body.length);
    if (end < body.length) {
      const paragraph = body.lastIndexOf("\n\n", end);
      const line = body.lastIndexOf("\n", end);
      const space = body.lastIndexOf(" ", end);
      if (paragraph > start + 400) end = paragraph;
      else if (line > start + 400) end = line;
      else if (space > start + 400) end = space;
    }
    const part = body.slice(start, end);
    const leading = part.length - part.trimStart().length;
    const text = part.trim();
    if (text) spans.push({ body: text, start: start + leading });
    if (end === body.length) break;
    start = Math.max(start + 1, end - 180);
  }
  return spans;
}

function ollamaTarget() {
  const url = new URL(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password)
    throw new Error("Embeddings require a local Ollama endpoint.");
  return url;
}
async function modelIdentity() {
  const model = process.env.OLLAMA_EMBED_MODEL;
  if (!model) throw new Error("Configure OLLAMA_EMBED_MODEL to enable embeddings.");
  const response = await fetch(new URL("/api/tags", ollamaTarget()), { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Embedding model service unavailable.");
  const data = await response.json() as { models: { name: string; digest: string }[] };
  const installed = data.models.find(row => row.name === model || row.name === `${model}:latest`);
  if (!installed?.digest) throw new Error("Install the configured embedding model in Ollama.");
  return { model, key: `${model}:${installed.digest}:retrieval-v1` };
}
async function embed(model: string, input: string[]) {
  const response = await fetch(new URL("/api/embed", ollamaTarget()), {
    method: "POST", headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ model, input, truncate: false, keep_alive: "5m" }),
  });
  if (!response.ok) throw new Error("Local embedding generation failed.");
  const data = await response.json() as { embeddings: number[][] };
  if (!Array.isArray(data.embeddings) || data.embeddings.length !== input.length ||
      data.embeddings.some(v => !Array.isArray(v) || v.length !== 768 || v.some(n => typeof n !== "number" || !Number.isFinite(n)) || !v.some(n => n !== 0)))
    throw new Error("Embedding model must return finite, nonzero 768-dimensional vectors.");
  return data.embeddings;
}

// Country is explicit post-title metadata, never inherited by a comment author.
function titleCountry(title: string) {
  const countries: [RegExp, string][] = [[/\bswitzerland\b/i,"CH"],[/\bfrance\b/i,"FR"],[/\bgermany\b/i,"DE"],[/\bitaly\b/i,"IT"],[/\bspain\b/i,"ES"],[/\bnetherlands\b/i,"NL"]];
  const matches = countries.filter(([pattern]) => pattern.test(title));
  return matches.length === 1 ? matches[0][1] : "unknown";
}

export async function indexCapturedPassages(identity?: { model: string; key: string }) {
  const { model, key } = identity ?? await modelIdentity();
  const pool = getPool();
  const docs = await pool.query<{ id: string; version: number; title: string; body: string; comment_id: string | null }>(`
    SELECT id, version, title, current_body AS body, NULL::text AS comment_id FROM sources WHERE current_body <> ''
    UNION ALL
    SELECT s.id, s.version, s.title, c.body, c.id FROM comments c JOIN sources s ON s.id=c.source_id WHERE c.body <> ''`);
  let added = 0;
  for (const doc of docs.rows) {
    const chunks = chunkPassage(doc.body).map(chunk => {
      const hash = createHash("sha256").update(JSON.stringify([doc.id, doc.version, doc.comment_id, chunk.start, chunk.body, doc.title, key])).digest("hex");
      const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
      return { ...chunk, id };
    });
    const existing = await pool.query<{ id: string }>("SELECT id FROM passages WHERE id = ANY($1::uuid[])", [chunks.map(c => c.id)]);
    const known = new Set(existing.rows.map(row => row.id));
    const missing = chunks.filter(c => !known.has(c.id));
    for (let offset = 0; offset < missing.length; offset += 8) {
      const batch = missing.slice(offset, offset + 8);
      const vectors = await embed(model, batch.map(c => `title: ${doc.title.slice(0,250)} | text: ${c.body}`));
      for (let i = 0; i < batch.length; i++) {
        const c = batch[i];
        const saved = await pool.query(`INSERT INTO passages (id, source_id, source_version, comment_id, body, start_offset, country, profile, model_key, embedding)
          SELECT $1::uuid, s.id, s.version, $4, $5, $6, $7, 'unknown', $8, $9::vector
          FROM sources s WHERE s.id=$2 AND s.version=$3 ON CONFLICT (id) DO NOTHING`,
          [c.id, doc.id, doc.version, doc.comment_id, c.body, c.start, doc.comment_id ? "unknown" : titleCountry(doc.title), key, JSON.stringify(vectors[i])]);
        added += saved.rowCount ?? 0;
      }
    }
  }
  return { added, model, modelKey: key };
}

export async function retrieveHybrid(query: string, country: string, profile: string, overview: boolean, lexicalQuery = query) {
  const reviewed = await retrieveEvidence(lexicalQuery, country, profile, overview);
  const evidence: RetrievedEvidence[] = reviewed.map(row => ({ ...row, reviewStatus: "reviewed" }));
  try {
    const identity = await modelIdentity();
    await indexCapturedPassages(identity);
    const counts = await getPool().query<{ total: number; matching: number }>(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE ($2='unknown' OR p.country=$2) AND ($3='unknown' OR p.profile=$3))::int AS matching
      FROM passages p JOIN sources s ON s.id=p.source_id AND s.version=p.source_version WHERE p.model_key=$1`,
      [identity.key,country,profile]);
    const [vector] = await embed(identity.model, [`task: search result | query: ${query.slice(0,4000)}`]);
    const rows = await getPool().query<{
      id: string; body: string; source_id: string; source_version: number; title: string;
      url: string; subject: string; country: string; profile: string; captured_at: Date | null; score: number;
    }>(`WITH eligible AS (
      SELECT p.*, s.title, COALESCE(c.url,s.url) AS url, COALESCE(c.captured_at,s.captured_at) AS captured_at,
        CASE WHEN p.comment_id IS NULL THEN 'original_poster' ELSE c.attribution END AS subject,
        1-(p.embedding <=> $1::vector) AS similarity,
        ts_rank(to_tsvector('english',p.body), websearch_to_tsquery('english',$2)) AS lexical
      FROM passages p JOIN sources s ON s.id=p.source_id AND s.version=p.source_version
      LEFT JOIN comments c ON c.id=p.comment_id
      WHERE p.model_key=$3 AND ($4='unknown' OR p.country=$4) AND ($5='unknown' OR p.profile=$5)
        AND (NOT $6::boolean OR p.comment_id IS NULL)
    ), semantic AS (
      SELECT id, row_number() OVER(ORDER BY similarity DESC,id) AS rank FROM eligible
      WHERE similarity >= 0.40 ORDER BY similarity DESC,id LIMIT 20
    ), lexical AS (
      SELECT id, row_number() OVER(ORDER BY lexical DESC,id) AS rank FROM eligible
      WHERE lexical>0 ORDER BY lexical DESC,id LIMIT 20
    ), fused AS (
      SELECT id, SUM(score) AS score FROM (
        SELECT id, 1.0/(60+rank) AS score FROM semantic UNION ALL SELECT id,1.0/(60+rank) FROM lexical
      ) results GROUP BY id
    ) SELECT e.*,f.score::float FROM eligible e JOIN fused f USING(id) ORDER BY f.score DESC,e.id LIMIT 6`,
      [JSON.stringify(vector), lexicalQuery, identity.key, country, profile, overview]);
    for (const row of rows.rows) {
      // Prefer a checked interpretation when its quote is contained in the same passage.
      if (evidence.some(e => e.sourceId === row.source_id && row.body.includes(e.quote))) continue;
      evidence.push({ id: row.id, summary: "Captured applicant passage · unreviewed", quote: row.body,
        url: row.url, title: row.title, subject: row.subject || "unknown", country: row.country,
        profile: row.profile, action: "unknown", sourceId: row.source_id, sourceVersion: row.source_version,
        capturedAt: row.captured_at?.toISOString(), kind: "applicant_experience", coverage: "partial", reviewStatus: "captured_unreviewed" });
    }
    return { captureCount: counts.rows[0].total, filteredCaptureCount: counts.rows[0].matching, evidence: evidence.slice(0,8), kind: "hybrid" as const,
      notice: "Semantic embeddings and text search retrieved current captures. Unreviewed passages are applicant claims; inspect their quotes and sources." };
  } catch (error) {
    return { captureCount: 0, filteredCaptureCount: 0, evidence, kind: "reviewed_text_fallback" as const,
      notice: `Semantic retrieval unavailable: ${error instanceof Error ? error.message : "unknown error"} Only reviewed text matches are shown.` };
  }
}

export async function hybridEvidenceStillCurrent(rows: Pick<RetrievedEvidence, "id" | "sourceVersion" | "reviewStatus">[]) {
  const reviewed = rows.filter(row => row.reviewStatus === "reviewed");
  if (!await evidenceStillCurrent(reviewed)) return false;
  const raw = rows.filter(row => row.reviewStatus === "captured_unreviewed");
  if (!raw.length) return true;
  const result = await getPool().query<{ id: string; source_version: number }>(`SELECT p.id,p.source_version FROM passages p
    JOIN sources s ON s.id=p.source_id AND s.version=p.source_version WHERE p.id=ANY($1::uuid[])`, [raw.map(row => row.id)]);
  return raw.every(row => result.rows.some(r => r.id === row.id && r.source_version === row.sourceVersion));
}
