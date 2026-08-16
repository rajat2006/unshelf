CREATE TABLE "discover_acquisition_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_target_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"trigger" text NOT NULL,
	"outcome" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"accepted_count" integer,
	"rejected_count" integer,
	"coverage_started_at" timestamp with time zone,
	"next_eligible_at" timestamp with time zone,
	"error_class" text,
	CONSTRAINT "discover_acquisition_attempts_target_generation_unique" UNIQUE("provider_target_id","generation"),
	CONSTRAINT "discover_acquisition_attempts_trigger_check" CHECK ("discover_acquisition_attempts"."trigger" = 'manual_follow'),
	CONSTRAINT "discover_acquisition_attempts_outcome_check" CHECK ("discover_acquisition_attempts"."outcome" IN ('running', 'complete', 'partial', 'failed', 'skipped', 'throttled', 'provider_unavailable')),
	CONSTRAINT "discover_acquisition_attempts_counts_check" CHECK (("discover_acquisition_attempts"."accepted_count" IS NULL OR "discover_acquisition_attempts"."accepted_count" >= 0)
        AND ("discover_acquisition_attempts"."rejected_count" IS NULL OR "discover_acquisition_attempts"."rejected_count" >= 0)),
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
ALTER TABLE "discover_provider_snapshots" ADD COLUMN "acquisition_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "checkpoint_payload" jsonb;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "acquisition_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "current_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "verified_coverage_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "next_eligible_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discover_acquisition_attempts" ADD CONSTRAINT "discover_acquisition_attempts_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discover_acquisition_attempts_target_started_idx" ON "discover_acquisition_attempts" USING btree ("provider_target_id","started_at");--> statement-breakpoint
ALTER TABLE "discover_provider_snapshots" ADD CONSTRAINT "discover_provider_snapshots_acquisition_attempt_id_discover_acquisition_attempts_id_fk" FOREIGN KEY ("acquisition_attempt_id") REFERENCES "public"."discover_acquisition_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_snapshots" ADD CONSTRAINT "discover_provider_snapshots_acquisition_attempt_id_unique" UNIQUE("acquisition_attempt_id");--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD CONSTRAINT "discover_provider_targets_generation_check" CHECK ("discover_provider_targets"."acquisition_generation" >= 0);
