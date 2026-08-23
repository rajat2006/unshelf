CREATE TABLE "discover_provider_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"thumbnail_url" text,
	"published_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_provider_results_identity_unique" UNIQUE("provider","external_id"),
	CONSTRAINT "discover_provider_results_provider_check" CHECK ("discover_provider_results"."provider" = 'youtube'),
	CONSTRAINT "discover_provider_results_duration_check" CHECK ("discover_provider_results"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discover_provider_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"thumbnail_url" text,
	"uploads_playlist_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_provider_targets_identity_unique" UNIQUE("provider","external_id"),
	CONSTRAINT "discover_provider_targets_provider_check" CHECK ("discover_provider_targets"."provider" = 'youtube')
);
--> statement-breakpoint
ALTER TABLE "discover_provider_results" ADD CONSTRAINT "discover_provider_results_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discover_provider_results_target_published_idx" ON "discover_provider_results" USING btree ("target_id","published_at");