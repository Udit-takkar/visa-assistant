CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"parent_id" text,
	"attribution" text NOT NULL,
	"url" text NOT NULL,
	"body" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"source_version" integer NOT NULL,
	"revision_id" uuid NOT NULL,
	"comment_id" text,
	"summary" text NOT NULL,
	"quote" text NOT NULL,
	"quote_start" integer NOT NULL,
	"subject" text NOT NULL,
	"country" text DEFAULT 'unknown' NOT NULL,
	"profile" text DEFAULT 'unknown' NOT NULL,
	"action" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_revision_id_source_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."source_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "observations_text_search_idx" ON "observations" USING gin (to_tsvector('english', "summary" || ' ' || "quote"));
--> statement-breakpoint
CREATE TRIGGER comments_immutable BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION prevent_source_revision_update();
--> statement-breakpoint
ALTER TABLE comments ADD CONSTRAINT comments_parent_id_fk FOREIGN KEY (parent_id) REFERENCES comments(id);
