# Schengen Visa Assistant

A free visa research workspace for applicants from India. Collect selected public threads, preserve replies and exact quotes, review reported observations, and search them with original source links.

Updated 4 October 2026. This first-thread MVP implements PostgreSQL capture/revisions, selected comments, evidence review, cited retrieval, JSON export/import, and a local Qwen conversation agent. Coss UI supplies general components; ElevenLabs primitives supply the conversation UI; Motion respects reduced-motion preferences. This is a research workspace, not a complete country checklist or an approval predictor. Official guidance, cover-letter drafting, and hosted authentication are later work.

## Local setup

Use Node.js 22+ and pnpm 10.16.1, pinned in `package.json`. App commands bind to loopback. Authentication is required before exposing this local admin workspace publicly.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Configure `DATABASE_URL` and `TEST_DATABASE_URL` in the root `.env`. Use separate `schengen` and `schengen_test` databases. Test/reset scripts refuse databases whose names do not end in `_test`. Next.js and database scripts read the root file; externally supplied environment variables take precedence. Restart the app after changing model configuration.

For Docker, set `POSTGRES_PASSWORD` and use the same password in both URLs. Compose binds PostgreSQL to `127.0.0.1:55439` and persists a named volume.

```sh
docker compose up -d postgres
docker compose exec postgres createdb -U schengen schengen_test
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Create the test database once. Open http://127.0.0.1:3000. Seeding registers thread `1u9i3ts` with empty text and unverified metadata; it never inserts or approves applicant claims.

This checkout also has an independent Homebrew PostgreSQL 14.19 cluster at `.local/postgres`, used for verification on port 55439. Existing PostgreSQL services were not changed. From the repository root:

```sh
pg_ctl -D .local/postgres -l .local/postgres.log -o '-h 127.0.0.1 -p 55439 -k /private/tmp' start
pg_ctl -D .local/postgres stop
```

Choose the local cluster or Docker for that port. Compose/CI target PostgreSQL 18 with pgvector but have not been executed here. No hosted database or deployment is configured.

## Try the workflow

1. Open a source and paste its original post text. Save it; prior text revisions remain available.
2. Capture selected comments with their Reddit permalinks. Choose the original post or an already captured comment as the parent. Keep author attribution unknown unless checked.
3. Optionally add checked interpretations: read the post and relevant replies. Add one narrow reported observation with an exact quote, country/profile only where supported, and the relevant document action. Alternatively, use Qwen to suggest candidates.
4. For extracted interpretations, save a draft, check its interpretation and source, then approve or reject it. Approval is a local review decision; it does not verify an applicant's story or turn it into an official rule.
5. Open Assistant and search a document term or question. Current captured passages are searchable without approving extracted summaries. Results label unreviewed passages separately from approved observations and preserve exact quotes and source links.

Country codes use ISO two-letter codes such as `CH` and `FR`. Selected country/profile filters exclude unknown classifications. Every question searches independently; conversation history is not used to infer applicant facts. Responses are snapshots: run a new search after changing captures or approvals.

The initial selected thread has been captured in this local development database from a cached web-reader view, with four comments from two selected reply chains. Its raw snapshot is ignored by Git. That capture is partial, not a verified live refresh or complete comment traversal. No observation was automatically approved.

## Local Qwen

Install Ollama, then:

```sh
ollama serve
ollama pull qwen3.5:9b
ollama pull embeddinggemma
```

Configure the root `.env` and restart the app:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:9b
OLLAMA_EMBED_MODEL=embeddinggemma
```

The gateway accepts loopback HTTP endpoints only. Extraction uses Ollama's [structured output schema](https://docs.ollama.com/capabilities/structured-outputs), disables thinking, and validates exact quotes and field values before returning candidates. A model timeout or malformed response saves nothing. Suggestions remain editable drafts and need review; schema validation does not prove semantic support.

The assistant chunks current post/comment text into literal passages, embeds them using local EmbeddingGemma through Ollama, and stores 768-dimensional vectors in PostgreSQL [pgvector](https://github.com/pgvector/pgvector). [Ollama embedding API](https://docs.ollama.com/api/embed) and [EmbeddingGemma prompt formatting](https://ai.google.dev/gemma/docs/embeddinggemma/inference-embeddinggemma-with-sentence-transformers) inform the local integration. Vectors carry source version, content identity, offsets, and embedding model digest. New or changed captures are indexed incrementally on the next chat query; `pnpm source:index` can index them explicitly. Indexed text never approves extracted summaries.

Retrieval combines cosine similarity and full-text rank using reciprocal rank fusion, then Qwen explains matching passages using short citation handles, which code validates and maps back to stored passage IDs. Answers use a strict cited-line format that code decodes into validated statements; JSON answer generation was unreliable in the local model audit. Extraction suggestions still use structured JSON. Broad raw document overviews use post passages; specific questions can retrieve selected comments with separate author attribution. Follow-up questions use recent question context without treating it as evidence. Raw passages are labelled captured/unreviewed; approved summaries remain reviewed. Source versions are rechecked after inference, and stale vectors are excluded. Embeddings failing to load produce an explicit notice and reviewed text fallback. Unknown country/profile metadata stays unknown; specific filters exclude it. Country labels for raw post passages come only from unambiguous destination names in the captured title; comments do not inherit the post author's country/profile. Raw applicant profiles currently remain unknown. The initial semantic cutoff is a heuristic, not a calibrated relevance probability. Model citation validation checks identifiers, not semantic truth.

```sh
pnpm model:check
```

This runs three synthetic extraction smoke fixtures and one cited conversational-answer fixture and writes results to `.local/evaluations/qwen-smoke.json`. It is not a quality benchmark, a visa validation, or fine-tuning. Model quality evaluation on held-out reviewed threads remains later work. Cloud fine-tuning is possible separately; no cloud provider account, training upload, paid job, or tuned model is configured.

## Selective file ingestion

Use UI post/comment paste or import one explicitly prepared capture file:

```sh
pnpm source:import /absolute/path/capture.json
```

The file format is:

```json
{
  "schemaVersion": 1,
  "url": "https://www.reddit.com/r/SchengenVisa/comments/THREAD_ID/TITLE/",
  "title": "A selected thread",
  "body": "Exact captured post text",
  "comments": [
    {
      "url": "https://www.reddit.com/r/SchengenVisa/comments/THREAD_ID/comment/COMMENT_ID/",
      "body": "Exact captured comment text",
      "parentId": null,
      "attribution": "unknown"
    }
  ]
}
```

Supply actual lowercase Reddit IDs. Order parents before replies; `parentId: null` means a reply to the post. Attribution is `original_poster`, `other`, or `unknown`. Unknown parent relationships need investigation before import. A file accepts up to 100 selected comments and 1 MB of JSON.

Import preserves original JSON bytes under `.local/snapshots/`, with a SHA-256 identity and PostgreSQL manifest. Replaying identical records is safe; a differing existing post is refused. Import stops on failure and reports that earlier successful records remain saved: it is resumable, not an atomic whole-file operation. Imported review approvals are never applied. “Export thread capture” produces a compatible bundle; the original post export can also include an explicitly labelled unsaved draft.

No broad crawler, automatic refresh, background scraping, attachment ingestion, or browser collection automation is implemented. Direct JSON access to the selected Reddit thread returned 403; capture proceeded via a cached web reader, preserving partial coverage.

## Evidence and persistence

`packages/core` holds shared source types and URL normalization. `packages/db` owns Drizzle migrations, repositories and checks. `apps/web` owns UI and Node.js API routes.

- Canonical thread/comment identities prevent duplicate capture. Comment URLs and parents must belong to the same thread.
- Post text revisions are immutable and SHA-256-deduplicated. Version checks prevent stale edits; identical retries are safe.
- Saved comments are immutable in this MVP. New clarifications can be added; editing/withdrawing captured comments remains later work.
- Observations reference the post revision, optional immutable comment, exact quote offset, separate subject, and thread version. Draft/rejected summaries are excluded; captured source passages are independently retrievable and labelled unreviewed.
- Any changed post or newly captured comment advances the thread version. Earlier approvals become stale and stop appearing in new results. Recreate and review observations against current context.
- Submitted, carried, requested, returned, suggested and unknown are separate document actions. Another commenter's experience is not assigned to the original poster.
- PostgreSQL English text search uses GIN indexes. Assistant retrieval combines exact pgvector cosine search and text search using reciprocal rank fusion. Jev and a separate model reranker are not implemented.
- Earlier browser drafts can be explicitly imported without replacing conflicting database text; originals are retained.

Routes: `GET/POST /api/sources`, `GET/PUT /api/sources/:id`, `GET /api/sources/:id/revisions`, `GET/POST /api/sources/:id/evidence`, `POST /api/sources/:id/extract`, and `POST /api/chat`. JSON input bounds and cross-site write checks do not substitute for authentication.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test:db
pnpm build
pnpm --filter @schengen/web exec playwright install chromium
pnpm test:e2e
```

Browser tests start an isolated app on port 3127 with `.next-e2e` output and reset only `TEST_DATABASE_URL`. Database and browser tests share that test database; run them sequentially. Real model inference is a separate smoke check; automated contract/browser checks use synthetic fixtures and mocked model responses.

## Local notes and attribution

`docs/` and root `TASKS.md` are maintained locally and ignored by Git at the user's request. `.env`, `.local/`, snapshots and evaluation files are also ignored. Attribution and licenses live in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The public repository is https://github.com/Udit-takkar/visa-assistant, initially published on `codex/initialize-app`. No deployment is configured.

The captured first thread contains one post and four selected comments. Its three extracted observations remain unapproved drafts. With embeddings enabled the captured passages can support cited answers immediately, clearly labelled unreviewed applicant claims. This corpus cannot establish official visa rules, complete checklists, or approval chances. Requirement and approval-prediction questions explicitly abstain.

Future OpenAI/DeepSeek integration can reuse this UI and knowledge bank through provider adapters. The current gateway supports local Ollama only; cloud adapters and API keys are not configured.

Manual query review is maintained in local ignored docs. This small audit is not proof of general model accuracy. Local captures, model files, credentials, docs and TASKS.md are excluded from the public repository.
