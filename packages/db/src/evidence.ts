import { and, eq, desc, sql } from "drizzle-orm";
import { getDatabase } from "./client";
import { sources, comments, observations } from "./schema";
import { SourceError } from "./repository";

export const profiles = [
  "unknown",
  "freelancer",
  "salaried",
  "student",
  "self_employed",
  "retired",
  "unemployed",
] as const;
export const actions = [
  "unknown",
  "submitted",
  "carried",
  "requested",
  "returned",
  "suggested",
] as const;
export type ObservationInput = {
  sourceVersion: number;
  commentId: string | null;
  summary: string;
  quote: string;
  country: string;
  profile: string;
  action: string;
};

export async function evidenceWorkspace(sourceId: string) {
  const db = getDatabase();
  // One transaction gives the UI a consistent post/comment/review snapshot.
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for("share");
    if (!source) throw new SourceError("Source not found.", 404);
    const replies = await tx
      .select()
      .from(comments)
      .where(eq(comments.sourceId, sourceId))
      .orderBy(comments.capturedAt);
    const claims = await tx
      .select()
      .from(observations)
      .where(eq(observations.sourceId, sourceId))
      .orderBy(desc(observations.createdAt));
    return {
      sourceVersion: source.version,
      sourceUrl: source.url,
      sourceTitle: source.title,
      postBody: source.currentBody,
      comments: replies,
      observations: claims.map((row) => ({
        ...row,
        stale: row.sourceVersion !== source.version,
      })),
      coverage: "Selected comments only; completeness is unknown.",
    };
  });
}

export async function captureComment(
  sourceId: string,
  input: {
    url: string;
    body: string;
    parentId: string | null;
    attribution: string;
    expectedVersion: number;
  }
) {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new SourceError("Use a Reddit comment permalink.", 400);
  }
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
    match[1].toLowerCase() !== sourceId
  )
    throw new SourceError(
      "Use a comment permalink belonging to this thread.",
      400
    );
  if (
    !input.body.trim() ||
    input.body.length > 50_000 ||
    !["original_poster", "other", "unknown"].includes(input.attribution)
  )
    throw new SourceError("Provide comment text and valid attribution.", 400);
  const id = match[2].toLowerCase();
  return getDatabase().transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for("update");
    if (!source?.currentRevisionId || !source.currentBody.trim())
      throw new SourceError("Capture the original post first.", 409);
    const [existing] = await tx
      .select()
      .from(comments)
      .where(eq(comments.id, id));
    if (existing) {
      if (
        existing.sourceId === sourceId &&
        existing.body === input.body &&
        existing.parentId === input.parentId &&
        existing.attribution === input.attribution
      )
        return existing;
      throw new SourceError(
        "This comment is already captured. Saved comments are immutable in this MVP.",
        409
      );
    }
    if (source.version !== input.expectedVersion)
      throw new SourceError(
        "The thread changed. Refresh evidence before adding the comment; your text is kept.",
        409
      );
    if (input.parentId) {
      const [parent] = await tx
        .select()
        .from(comments)
        .where(
          and(eq(comments.id, input.parentId), eq(comments.sourceId, sourceId))
        );
      if (!parent)
        throw new SourceError(
          "Capture the parent comment in this thread first.",
          400
        );
    }
    const [saved] = await tx
      .insert(comments)
      .values({
        id,
        sourceId,
        body: input.body,
        parentId: input.parentId,
        attribution: input.attribution,
        url: `https://www.reddit.com${url.pathname.replace(/\/$/, "")}/`,
      })
      .returning();
    await tx
      .update(sources)
      .set({ version: source.version + 1, updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
    return saved;
  });
}

export async function proposeObservation(
  sourceId: string,
  input: ObservationInput
) {
  if (
    !input.summary.trim() ||
    input.summary.length > 2000 ||
    !input.quote.trim() ||
    input.quote.length > 10000 ||
    !profiles.includes(input.profile as (typeof profiles)[number]) ||
    !actions.includes(input.action as (typeof actions)[number]) ||
    !/^(unknown|[A-Z]{2})$/.test(input.country)
  )
    throw new SourceError(
      "Check the observation fields. Country must be an ISO country code or unknown.",
      400
    );
  return getDatabase().transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for("share");
    if (!source?.currentRevisionId || source.version !== input.sourceVersion)
      throw new SourceError(
        "Evidence changed. Refresh and select the quote again.",
        409
      );
    const [comment] = input.commentId
      ? await tx
          .select()
          .from(comments)
          .where(
            and(
              eq(comments.id, input.commentId),
              eq(comments.sourceId, sourceId)
            )
          )
      : [];
    if (input.commentId && !comment)
      throw new SourceError("Comment not found in this thread.", 400);
    const text = comment ? comment.body : source.currentBody;
    const quoteStart = text.indexOf(input.quote);
    if (quoteStart < 0)
      throw new SourceError(
        "The quote must be an exact passage from the selected capture.",
        400
      );
    const [row] = await tx
      .insert(observations)
      .values({
        ...input,
        sourceId,
        quoteStart,
        revisionId: source.currentRevisionId,
        subject: comment
          ? comment.attribution === "original_poster"
            ? "original_poster"
            : `comment:${comment.id}`
          : "original_poster",
      })
      .returning();
    return row;
  });
}

export async function reviewObservation(
  sourceId: string,
  id: string,
  status: string
) {
  if (!["approved", "rejected"].includes(status))
    throw new SourceError("Choose approved or rejected.", 400);
  return getDatabase().transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for("share");
    const [claim] = await tx
      .select()
      .from(observations)
      .where(and(eq(observations.id, id), eq(observations.sourceId, sourceId)))
      .for("update");
    if (!source || !claim) throw new SourceError("Observation not found.", 404);
    if (status === "approved" && claim.sourceVersion !== source.version)
      throw new SourceError(
        "This observation is stale. Create and review a new observation against the current capture.",
        409
      );
    const [saved] = await tx
      .update(observations)
      .set({ status })
      .where(eq(observations.id, id))
      .returning();
    return saved;
  });
}

export async function retrieveEvidence(
  query: string,
  country = "unknown",
  profile = "unknown",
  overview = false
) {
  const vector = sql`to_tsvector('english', ${observations.summary} || ' ' || ${observations.quote})`;
  const tsquery = sql`websearch_to_tsquery('english', ${query})`;
  const rows = await getDatabase()
    .select({ observation: observations, source: sources, comment: comments })
    .from(observations)
    .innerJoin(sources, eq(observations.sourceId, sources.id))
    .leftJoin(comments, eq(observations.commentId, comments.id))
    .where(
      and(
        eq(observations.status, "approved"),
        eq(observations.sourceVersion, sources.version),
        overview ? undefined : sql`${vector} @@ ${tsquery}`,
        country === "unknown" ? undefined : eq(observations.country, country),
        profile === "unknown" ? undefined : eq(observations.profile, profile)
      )
    )
    .orderBy(
      sql`ts_rank(${vector}, ${tsquery}) DESC`,
      desc(observations.createdAt)
    )
    .limit(8);
  return rows.map(({ observation, source, comment }) => ({
    id: observation.id,
    summary: observation.summary,
    quote: observation.quote,
    url: comment?.url ?? source.url,
    title: source.title,
    subject: observation.subject,
    country: observation.country,
    profile: observation.profile,
    action: observation.action,
    sourceId: source.id,
    sourceVersion: source.version,
    capturedAt: (comment?.capturedAt ?? source.capturedAt)?.toISOString(),
    kind: "applicant_experience" as const,
    coverage: "partial" as const,
  }));
}

export async function hasReviewedEvidence(
  country = "unknown",
  profile = "unknown"
) {
  const rows = await getDatabase()
    .select({ id: observations.id })
    .from(observations)
    .innerJoin(sources, eq(observations.sourceId, sources.id))
    .where(
      and(
        eq(observations.status, "approved"),
        eq(observations.sourceVersion, sources.version),
        country === "unknown" ? undefined : eq(observations.country, country),
        profile === "unknown" ? undefined : eq(observations.profile, profile)
      )
    )
    .limit(1);
  return rows.length > 0;
}


// Recheck review and source versions after slow model inference.
export async function evidenceStillCurrent(rows: { id: string; sourceVersion: number }[]) {
  if (!rows.length) return true;
  const current = await getDatabase().select({ id: observations.id, version: observations.sourceVersion })
    .from(observations).innerJoin(sources, eq(observations.sourceId, sources.id))
    .where(and(eq(observations.status, "approved"), eq(observations.sourceVersion, sources.version),
      sql`${observations.id} IN (${sql.join(rows.map(row => sql`${row.id}::uuid`), sql`, `)})`));
  return rows.every(row => current.some(item => item.id === row.id && item.version === row.sourceVersion));
}


export async function reviewReadiness() {
  const db = getDatabase();
  const [counts] = await db.select({
    approved: sql<number>`count(*) FILTER (WHERE ${observations.status} = 'approved')::int`,
    drafts: sql<number>`count(*) FILTER (WHERE ${observations.status} = 'draft')::int`,
  }).from(observations).innerJoin(sources, eq(observations.sourceId, sources.id))
    .where(eq(observations.sourceVersion, sources.version));
  const reviewSources = await db.select({ sourceId: sources.id, title: sources.title,
    draftCount: sql<number>`count(*)::int` })
    .from(observations).innerJoin(sources, eq(observations.sourceId, sources.id))
    .where(and(eq(observations.status, "draft"), eq(observations.sourceVersion, sources.version)))
    .groupBy(sources.id, sources.title).orderBy(sources.title).limit(3);
  return { ...counts, reviewSources };
}
