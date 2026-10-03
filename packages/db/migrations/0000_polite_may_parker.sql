CREATE TABLE "source_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"body" text NOT NULL,
	"content_hash" text NOT NULL,
	"capture_method" text DEFAULT 'manual_paste' NOT NULL,
	"coverage" text DEFAULT 'post_only' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'reddit' NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"current_body" text DEFAULT '' NOT NULL,
	"current_revision_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_revisions" ADD CONSTRAINT "source_revisions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_current_revision_id_source_revisions_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."source_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_revision_content_idx" ON "source_revisions" USING btree ("source_id","content_hash");--> statement-breakpoint
CREATE INDEX "sources_text_search_idx" ON "sources" USING gin (to_tsvector('english', "title" || ' ' || "reason" || ' ' || "current_body"));
--> statement-breakpoint
CREATE FUNCTION prevent_source_revision_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Source revisions are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_source_revision BEFORE UPDATE ON source_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_source_revision_update();
