import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  vector,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull().default("reddit"),
    url: text("url").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull().default(""),
    currentBody: text("current_body").notNull().default(""),
    currentRevisionId: uuid("current_revision_id").references(
      (): AnyPgColumn => sourceRevisions.id
    ),
    version: integer("version").notNull().default(0),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sources_text_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.title} || ' ' || ${table.reason} || ' ' || ${table.currentBody})`
    ),
  ]
);

export const sourceRevisions = pgTable(
  "source_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references((): AnyPgColumn => sources.id),
    body: text("body").notNull(),
    contentHash: text("content_hash").notNull(),
    captureMethod: text("capture_method").notNull().default("manual_paste"),
    coverage: text("coverage").notNull().default("post_only"),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("source_revision_content_idx").on(
      table.sourceId,
      table.contentHash
    ),
  ]
);

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id),
  parentId: text("parent_id"),
  attribution: text("attribution").notNull(),
  url: text("url").notNull(),
  body: text("body").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    sourceVersion: integer("source_version").notNull(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => sourceRevisions.id),
    commentId: text("comment_id").references(() => comments.id),
    summary: text("summary").notNull(),
    quote: text("quote").notNull(),
    quoteStart: integer("quote_start").notNull(),
    subject: text("subject").notNull(),
    country: text("country").notNull().default("unknown"),
    profile: text("profile").notNull().default("unknown"),
    action: text("action").notNull().default("unknown"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("observations_text_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.summary} || ' ' || ${table.quote})`
    ),
  ]
);

export const sourceSnapshots = pgTable("source_snapshots", {
  contentHash: text("content_hash").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id),
  relativePath: text("relative_path").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Exact cosine search is sufficient for the initial small corpus; add HNSW after measuring scale.
export const passages = pgTable("passages", {
  id: uuid("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  sourceVersion: integer("source_version").notNull(),
  commentId: text("comment_id").references(() => comments.id),
  body: text("body").notNull(),
  startOffset: integer("start_offset").notNull(),
  country: text("country").notNull().default("unknown"),
  profile: text("profile").notNull().default("unknown"),
  modelKey: text("model_key").notNull(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
}, table => [
  index("passages_source_version_idx").on(table.sourceId, table.sourceVersion),
  index("passages_text_idx").using("gin", sql`to_tsvector('english', ${table.body})`),
]);
