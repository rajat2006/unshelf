CREATE TABLE "discover_acquisition_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_target_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"trigger" text NOT NULL,
	"outcome" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"lease_expires_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"accepted_count" integer,
	"rejected_count" integer,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"coverage_started_at" timestamp with time zone,
	"next_eligible_at" timestamp with time zone,
	"error_class" text,
	CONSTRAINT "discover_acquisition_attempts_target_generation_unique" UNIQUE("provider_target_id","generation"),
	CONSTRAINT "discover_acquisition_attempts_trigger_check" CHECK ("discover_acquisition_attempts"."trigger" IN ('app_open', 'manual_workspace', 'manual_follow')),
	CONSTRAINT "discover_acquisition_attempts_outcome_check" CHECK ("discover_acquisition_attempts"."outcome" IN ('running', 'complete', 'partial', 'failed', 'skipped', 'throttled', 'provider_unavailable')),
	CONSTRAINT "discover_acquisition_attempts_counts_check" CHECK (("discover_acquisition_attempts"."accepted_count" IS NULL OR "discover_acquisition_attempts"."accepted_count" >= 0)
        AND ("discover_acquisition_attempts"."rejected_count" IS NULL OR "discover_acquisition_attempts"."rejected_count" >= 0)
        AND "discover_acquisition_attempts"."retry_count" >= 0),
	CONSTRAINT "discover_acquisition_attempts_terminal_check" CHECK ((
        "discover_acquisition_attempts"."outcome" = 'running'
        AND "discover_acquisition_attempts"."finished_at" IS NULL
        AND "discover_acquisition_attempts"."accepted_count" IS NULL
        AND "discover_acquisition_attempts"."rejected_count" IS NULL
      ) OR (
        "discover_acquisition_attempts"."outcome" <> 'running'
        AND "discover_acquisition_attempts"."finished_at" IS NOT NULL
        AND "discover_acquisition_attempts"."accepted_count" IS NOT NULL
        AND "discover_acquisition_attempts"."rejected_count" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "discover_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_result_id" uuid NOT NULL,
	"item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_candidates_user_result_unique" UNIQUE("user_id","provider_result_id"),
	CONSTRAINT "discover_candidates_identity_owner_unique" UNIQUE("id","user_id"),
	CONSTRAINT "discover_candidates_item_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "discover_discoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"follow_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"appearance_sequence" integer NOT NULL,
	"position" integer NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	CONSTRAINT "discover_discoveries_occurrence_unique" UNIQUE("follow_id","candidate_id","appearance_sequence"),
	CONSTRAINT "discover_discoveries_identity_owner_unique" UNIQUE("id","user_id"),
	CONSTRAINT "discover_discoveries_position_check" CHECK ("discover_discoveries"."position" >= 0),
	CONSTRAINT "discover_discoveries_state_check" CHECK ("discover_discoveries"."state" IN ('new', 'seen', 'kept', 'dismissed')),
	CONSTRAINT "discover_discoveries_state_timestamps_check" CHECK ((
        "discover_discoveries"."state" = 'new'
        AND "discover_discoveries"."seen_at" IS NULL
        AND "discover_discoveries"."decided_at" IS NULL
      ) OR (
        "discover_discoveries"."state" = 'seen'
        AND "discover_discoveries"."seen_at" IS NOT NULL
        AND "discover_discoveries"."decided_at" IS NULL
      ) OR (
        "discover_discoveries"."state" IN ('kept', 'dismissed')
        AND "discover_discoveries"."decided_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "discover_follow_candidate_presence" (
	"user_id" uuid NOT NULL,
	"follow_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"appearance_sequence" integer DEFAULT 1 NOT NULL,
	"present" boolean DEFAULT true NOT NULL,
	"first_surfaced_snapshot_id" uuid NOT NULL,
	"last_surfaced_snapshot_id" uuid NOT NULL,
	CONSTRAINT "discover_follow_candidate_presence_follow_id_candidate_id_pk" PRIMARY KEY("follow_id","candidate_id"),
	CONSTRAINT "discover_presence_identity_owner_unique" UNIQUE("follow_id","candidate_id","user_id"),
	CONSTRAINT "discover_presence_occurrence_owner_unique" UNIQUE("follow_id","candidate_id","appearance_sequence","user_id"),
	CONSTRAINT "discover_presence_sequence_check" CHECK ("discover_follow_candidate_presence"."appearance_sequence" > 0)
);
--> statement-breakpoint
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
CREATE TABLE "discover_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_target_id" uuid NOT NULL,
	"target_url" text NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"latest_workspace_refresh_outcome" text,
	"latest_workspace_refreshed_at" timestamp with time zone,
	"last_applied_provider_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_follows_user_target_unique" UNIQUE("user_id","provider_target_id"),
	CONSTRAINT "discover_follows_identity_owner_unique" UNIQUE("id","user_id"),
	CONSTRAINT "discover_follows_identity_target_unique" UNIQUE("id","user_id","provider_target_id"),
	CONSTRAINT "discover_follows_lifecycle_check" CHECK ("discover_follows"."lifecycle" IN ('active', 'paused', 'removed')),
	CONSTRAINT "discover_follows_workspace_refresh_check" CHECK ((
        "discover_follows"."latest_workspace_refresh_outcome" IS NULL
        AND "discover_follows"."latest_workspace_refreshed_at" IS NULL
      ) OR (
        "discover_follows"."latest_workspace_refresh_outcome" IN (
          'joined', 'skipped', 'complete', 'partial', 'failed',
          'throttled', 'provider_unavailable'
        )
        AND "discover_follows"."latest_workspace_refreshed_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "discover_idempotency" (
	"user_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_idempotency_user_id_operation_request_id_pk" PRIMARY KEY("user_id","operation","request_id"),
	CONSTRAINT "discover_idempotency_operation_check" CHECK ("discover_idempotency"."operation" IN ('confirm_follow', 'set_follow_lifecycle', 'decide_discoveries', 'keep_discovery'))
);
--> statement-breakpoint
CREATE TABLE "discover_provider_gates" (
	"provider" text PRIMARY KEY NOT NULL,
	"next_eligible_at" timestamp with time zone NOT NULL,
	"error_class" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
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
	"generation" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discover_result_projection_generation_check" CHECK ("discover_provider_result_projections"."generation" >= 0),
	CONSTRAINT "discover_result_projection_type_check" CHECK ("discover_provider_result_projections"."type" = 'video'),
	CONSTRAINT "discover_result_projection_duration_check" CHECK ("discover_provider_result_projections"."duration_seconds" > 0),
	CONSTRAINT "discover_result_projection_expiry_check" CHECK ("discover_provider_result_projections"."expires_at" > "discover_provider_result_projections"."fetched_at")
);
--> statement-breakpoint
CREATE TABLE "discover_provider_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_reference" text,
	"data_generation" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "discover_provider_results_provider_check" CHECK ("discover_provider_results"."provider" = 'youtube'),
	CONSTRAINT "discover_provider_results_generation_check" CHECK ("discover_provider_results"."data_generation" >= 0),
	CONSTRAINT "discover_provider_results_expiry_check" CHECK ((
        "discover_provider_results"."external_reference" IS NULL
        AND "discover_provider_results"."fetched_at" IS NULL
        AND "discover_provider_results"."expires_at" IS NULL
      ) OR (
        "discover_provider_results"."external_reference" IS NOT NULL
        AND "discover_provider_results"."fetched_at" IS NOT NULL
        AND "discover_provider_results"."expires_at" > "discover_provider_results"."fetched_at"
      ))
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
	"acquisition_attempt_id" uuid,
	"sequence" integer NOT NULL,
	"outcome" text NOT NULL,
	"rejected_count" integer NOT NULL,
	"coverage_started_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discover_provider_snapshots_acquisition_attempt_id_unique" UNIQUE("acquisition_attempt_id"),
	CONSTRAINT "discover_provider_snapshots_id_target_unique" UNIQUE("id","provider_target_id"),
	CONSTRAINT "discover_provider_snapshots_target_sequence_unique" UNIQUE("provider_target_id","sequence"),
	CONSTRAINT "discover_provider_snapshots_outcome_check" CHECK ("discover_provider_snapshots"."outcome" IN ('preview', 'partial', 'empty')),
	CONSTRAINT "discover_provider_snapshots_rejected_count_check" CHECK ("discover_provider_snapshots"."rejected_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "discover_provider_target_projections" (
	"provider_target_id" uuid PRIMARY KEY NOT NULL,
	"publisher" text NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discover_target_projection_generation_check" CHECK ("discover_provider_target_projections"."generation" >= 0),
	CONSTRAINT "discover_target_projection_expiry_check" CHECK ("discover_provider_target_projections"."expires_at" > "discover_provider_target_projections"."fetched_at")
);
--> statement-breakpoint
CREATE TABLE "discover_provider_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"target_kind" text NOT NULL,
	"acquisition_scope" text DEFAULT 'system' NOT NULL,
	"external_reference" text,
	"target_payload" jsonb,
	"checkpoint_payload" jsonb,
	"checkpoint_fetched_at" timestamp with time zone,
	"checkpoint_expires_at" timestamp with time zone,
	"data_generation" integer DEFAULT 0 NOT NULL,
	"acquisition_generation" integer DEFAULT 0 NOT NULL,
	"current_snapshot_id" uuid,
	"verified_coverage_started_at" timestamp with time zone,
	"next_eligible_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "discover_provider_targets_provider_check" CHECK ("discover_provider_targets"."provider" = 'youtube'),
	CONSTRAINT "discover_provider_targets_kind_check" CHECK ("discover_provider_targets"."target_kind" = 'channel'),
	CONSTRAINT "discover_provider_targets_generation_check" CHECK ("discover_provider_targets"."data_generation" >= 0 AND "discover_provider_targets"."acquisition_generation" >= 0),
	CONSTRAINT "discover_provider_targets_expiry_check" CHECK ((
        "discover_provider_targets"."external_reference" IS NULL
        AND "discover_provider_targets"."target_payload" IS NULL
        AND "discover_provider_targets"."fetched_at" IS NULL
        AND "discover_provider_targets"."expires_at" IS NULL
      ) OR (
        "discover_provider_targets"."external_reference" IS NOT NULL
        AND "discover_provider_targets"."target_payload" IS NOT NULL
        AND "discover_provider_targets"."fetched_at" IS NOT NULL
        AND "discover_provider_targets"."expires_at" > "discover_provider_targets"."fetched_at"
      )),
	CONSTRAINT "discover_provider_targets_checkpoint_expiry_check" CHECK ((
        "discover_provider_targets"."checkpoint_payload" IS NULL
        AND "discover_provider_targets"."checkpoint_fetched_at" IS NULL
        AND "discover_provider_targets"."checkpoint_expires_at" IS NULL
      ) OR (
        "discover_provider_targets"."checkpoint_payload" IS NOT NULL
        AND "discover_provider_targets"."checkpoint_fetched_at" IS NOT NULL
        AND "discover_provider_targets"."checkpoint_expires_at" > "discover_provider_targets"."checkpoint_fetched_at"
      ))
);
--> statement-breakpoint
ALTER TABLE "discover_acquisition_attempts" ADD CONSTRAINT "discover_acquisition_attempts_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_candidates" ADD CONSTRAINT "discover_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_candidates" ADD CONSTRAINT "discover_candidates_provider_result_id_discover_provider_results_id_fk" FOREIGN KEY ("provider_result_id") REFERENCES "public"."discover_provider_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_candidates" ADD CONSTRAINT "discover_candidates_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_discoveries" ADD CONSTRAINT "discover_discoveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_discoveries" ADD CONSTRAINT "discover_discoveries_presence_owner_fk" FOREIGN KEY ("follow_id","candidate_id","user_id") REFERENCES "public"."discover_follow_candidate_presence"("follow_id","candidate_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_candidate_presence" ADD CONSTRAINT "discover_follow_candidate_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_candidate_presence" ADD CONSTRAINT "discover_follow_candidate_presence_first_surfaced_snapshot_id_discover_provider_snapshots_id_fk" FOREIGN KEY ("first_surfaced_snapshot_id") REFERENCES "public"."discover_provider_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_candidate_presence" ADD CONSTRAINT "discover_follow_candidate_presence_last_surfaced_snapshot_id_discover_provider_snapshots_id_fk" FOREIGN KEY ("last_surfaced_snapshot_id") REFERENCES "public"."discover_provider_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_candidate_presence" ADD CONSTRAINT "discover_presence_follow_owner_fk" FOREIGN KEY ("follow_id","user_id") REFERENCES "public"."discover_follows"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_candidate_presence" ADD CONSTRAINT "discover_presence_candidate_owner_fk" FOREIGN KEY ("candidate_id","user_id") REFERENCES "public"."discover_candidates"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_preview_results" ADD CONSTRAINT "discover_follow_preview_results_preview_id_user_id_snapshot_id_discover_follow_previews_id_user_id_snapshot_id_fk" FOREIGN KEY ("preview_id","user_id","snapshot_id") REFERENCES "public"."discover_follow_previews"("id","user_id","snapshot_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_preview_results" ADD CONSTRAINT "discover_follow_preview_results_snapshot_id_provider_result_id_discover_provider_snapshot_results_snapshot_id_provider_result_id_fk" FOREIGN KEY ("snapshot_id","provider_result_id") REFERENCES "public"."discover_provider_snapshot_results"("snapshot_id","provider_result_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_previews" ADD CONSTRAINT "discover_follow_previews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_previews" ADD CONSTRAINT "discover_follow_previews_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_previews" ADD CONSTRAINT "discover_follow_previews_snapshot_id_discover_provider_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."discover_provider_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follow_previews" ADD CONSTRAINT "discover_follow_previews_snapshot_id_provider_target_id_discover_provider_snapshots_id_provider_target_id_fk" FOREIGN KEY ("snapshot_id","provider_target_id") REFERENCES "public"."discover_provider_snapshots"("id","provider_target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_applied_snapshot_target_fk" FOREIGN KEY ("last_applied_provider_snapshot_id","provider_target_id") REFERENCES "public"."discover_provider_snapshots"("id","provider_target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_idempotency" ADD CONSTRAINT "discover_idempotency_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_result_projections" ADD CONSTRAINT "discover_provider_result_projections_provider_result_id_discover_provider_results_id_fk" FOREIGN KEY ("provider_result_id") REFERENCES "public"."discover_provider_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_snapshot_results" ADD CONSTRAINT "discover_provider_snapshot_results_snapshot_id_discover_provider_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."discover_provider_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_snapshot_results" ADD CONSTRAINT "discover_provider_snapshot_results_provider_result_id_discover_provider_results_id_fk" FOREIGN KEY ("provider_result_id") REFERENCES "public"."discover_provider_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_snapshots" ADD CONSTRAINT "discover_provider_snapshots_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_snapshots" ADD CONSTRAINT "discover_provider_snapshots_acquisition_attempt_id_discover_acquisition_attempts_id_fk" FOREIGN KEY ("acquisition_attempt_id") REFERENCES "public"."discover_acquisition_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_target_projections" ADD CONSTRAINT "discover_provider_target_projections_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discover_acquisition_attempts_one_running_per_target" ON "discover_acquisition_attempts" USING btree ("provider_target_id") WHERE "discover_acquisition_attempts"."outcome" = 'running';--> statement-breakpoint
CREATE INDEX "discover_acquisition_attempts_target_started_idx" ON "discover_acquisition_attempts" USING btree ("provider_target_id","started_at");--> statement-breakpoint
CREATE INDEX "discover_candidates_user_id_idx" ON "discover_candidates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discover_discoveries_user_state_idx" ON "discover_discoveries" USING btree ("user_id","state","discovered_at");--> statement-breakpoint
CREATE INDEX "discover_presence_user_id_idx" ON "discover_follow_candidate_presence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discover_follow_previews_expiry_idx" ON "discover_follow_previews" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discover_follows_user_lifecycle_idx" ON "discover_follows" USING btree ("user_id","lifecycle");--> statement-breakpoint
CREATE INDEX "discover_result_projection_expiry_idx" ON "discover_provider_result_projections" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discover_provider_results_identity_unique" ON "discover_provider_results" USING btree ("provider","external_reference") WHERE "discover_provider_results"."external_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "discover_provider_results_expiry_idx" ON "discover_provider_results" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discover_target_projection_expiry_idx" ON "discover_provider_target_projections" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discover_provider_targets_expiry_idx" ON "discover_provider_targets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discover_provider_targets_checkpoint_expiry_idx" ON "discover_provider_targets" USING btree ("checkpoint_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discover_provider_targets_identity_unique" ON "discover_provider_targets" USING btree ("provider","target_kind","acquisition_scope","external_reference") WHERE "discover_provider_targets"."external_reference" IS NOT NULL;