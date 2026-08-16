CREATE TABLE "discover_follow_preview_results" (
	"preview_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"provider_result_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "discover_follow_preview_results_preview_id_provider_result_id_pk" PRIMARY KEY("preview_id","provider_result_id"),
	CONSTRAINT "discover_follow_preview_results_position_unique" UNIQUE("preview_id","position"),
	CONSTRAINT "discover_follow_preview_results_position_check" CHECK ("discover_follow_preview_results"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discover_follow_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_target_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"target_url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "discover_follow_previews_identity_unique" UNIQUE("id","user_id","snapshot_id"),
	CONSTRAINT "discover_follow_previews_expiry_check" CHECK ("discover_follow_previews"."expires_at" > "discover_follow_previews"."created_at"),
	CONSTRAINT "discover_follow_previews_consumed_check" CHECK ("discover_follow_previews"."consumed_at" IS NULL OR "discover_follow_previews"."consumed_at" >= "discover_follow_previews"."created_at")
);
--> statement-breakpoint
CREATE TABLE "discover_provider_result_projections" (
	"provider_result_id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"publisher" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"type" text NOT NULL,
	"thumbnail_url" text,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discover_result_projection_type_check" CHECK ("discover_provider_result_projections"."type" = 'video'),
	CONSTRAINT "discover_result_projection_duration_check" CHECK ("discover_provider_result_projections"."duration_seconds" > 0),
	CONSTRAINT "discover_result_projection_expiry_check" CHECK ("discover_provider_result_projections"."expires_at" > "discover_provider_result_projections"."fetched_at")
);
--> statement-breakpoint
CREATE TABLE "discover_provider_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_reference" text NOT NULL,
	CONSTRAINT "discover_provider_results_provider_check" CHECK ("discover_provider_results"."provider" = 'youtube')
);
--> statement-breakpoint
CREATE TABLE "discover_provider_snapshot_results" (
	"snapshot_id" uuid NOT NULL,
	"provider_result_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "discover_provider_snapshot_results_snapshot_id_provider_result_id_pk" PRIMARY KEY("snapshot_id","provider_result_id"),
	CONSTRAINT "discover_snapshot_results_position_unique" UNIQUE("snapshot_id","position"),
	CONSTRAINT "discover_snapshot_results_position_check" CHECK ("discover_provider_snapshot_results"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discover_provider_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_target_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"outcome" text NOT NULL,
	"rejected_count" integer NOT NULL,
	"coverage_started_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discover_provider_snapshots_id_target_unique" UNIQUE("id","provider_target_id"),
	CONSTRAINT "discover_provider_snapshots_target_sequence_unique" UNIQUE("provider_target_id","sequence"),
	CONSTRAINT "discover_provider_snapshots_outcome_check" CHECK ("discover_provider_snapshots"."outcome" IN ('preview', 'partial', 'empty')),
	CONSTRAINT "discover_provider_snapshots_rejected_count_check" CHECK ("discover_provider_snapshots"."rejected_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discover_provider_target_projections" (
	"provider_target_id" uuid PRIMARY KEY NOT NULL,
	"publisher" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discover_target_projection_expiry_check" CHECK ("discover_provider_target_projections"."expires_at" > "discover_provider_target_projections"."fetched_at")
);
--> statement-breakpoint
CREATE TABLE "discover_provider_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"target_kind" text NOT NULL,
	"acquisition_scope" text DEFAULT 'system' NOT NULL,
	"external_reference" text NOT NULL,
	"target_payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discover_provider_targets_provider_check" CHECK ("discover_provider_targets"."provider" = 'youtube'),
	CONSTRAINT "discover_provider_targets_kind_check" CHECK ("discover_provider_targets"."target_kind" = 'channel'),
	CONSTRAINT "discover_provider_targets_expiry_check" CHECK ("discover_provider_targets"."expires_at" > "discover_provider_targets"."fetched_at")
);
--> statement-breakpoint
ALTER TABLE "discover_follow_preview_results" ADD CONSTRAINT "discover_follow_preview_results_preview_id_user_id_snapshot_id_discover_follow_previews_id_user_id_snapshot_id_fk" FOREIGN KEY ("preview_id","user_id","snapshot_id") REFERENCES "public"."discover_follow_previews"("id","user_id","snapshot_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_preview_results" ADD CONSTRAINT "discover_follow_preview_results_snapshot_id_provider_result_id_discover_provider_snapshot_results_snapshot_id_provider_result_id_fk" FOREIGN KEY ("snapshot_id","provider_result_id") REFERENCES "public"."discover_provider_snapshot_results"("snapshot_id","provider_result_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_previews" ADD CONSTRAINT "discover_follow_previews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_previews" ADD CONSTRAINT "discover_follow_previews_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_previews" ADD CONSTRAINT "discover_follow_previews_snapshot_id_discover_provider_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."discover_provider_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_previews" ADD CONSTRAINT "discover_follow_previews_snapshot_id_provider_target_id_discover_provider_snapshots_id_provider_target_id_fk" FOREIGN KEY ("snapshot_id","provider_target_id") REFERENCES "public"."discover_provider_snapshots"("id","provider_target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_result_projections" ADD CONSTRAINT "discover_provider_result_projections_provider_result_id_discover_provider_results_id_fk" FOREIGN KEY ("provider_result_id") REFERENCES "public"."discover_provider_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_snapshot_results" ADD CONSTRAINT "discover_provider_snapshot_results_snapshot_id_discover_provider_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."discover_provider_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_snapshot_results" ADD CONSTRAINT "discover_provider_snapshot_results_provider_result_id_discover_provider_results_id_fk" FOREIGN KEY ("provider_result_id") REFERENCES "public"."discover_provider_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_snapshots" ADD CONSTRAINT "discover_provider_snapshots_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_target_projections" ADD CONSTRAINT "discover_provider_target_projections_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discover_follow_previews_expiry_idx" ON "discover_follow_previews" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discover_provider_results_identity_unique" ON "discover_provider_results" USING btree ("provider","external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "discover_provider_targets_identity_unique" ON "discover_provider_targets" USING btree ("provider","target_kind","acquisition_scope","external_reference");