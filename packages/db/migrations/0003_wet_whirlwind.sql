CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_version" integer NOT NULL,
	"comment_id" text,
	"body" text NOT NULL,
	"start_offset" integer NOT NULL,
	"country" text DEFAULT 'unknown' NOT NULL,
	"profile" text DEFAULT 'unknown' NOT NULL,
	"model_key" text NOT NULL,
	"embedding" vector(768) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passages" ADD CONSTRAINT "passages_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passages_source_version_idx" ON "passages" USING btree ("source_id","source_version");--> statement-breakpoint
CREATE INDEX "passages_text_idx" ON "passages" USING gin (to_tsvector('english', "body"));