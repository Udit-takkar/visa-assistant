CREATE TABLE "source_snapshots" (
	"content_hash" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"relative_path" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;