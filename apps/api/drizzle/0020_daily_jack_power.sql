CREATE TABLE "discover_provider_gates" (
	"provider" text PRIMARY KEY NOT NULL,
	"next_eligible_at" timestamp with time zone NOT NULL,
	"error_class" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discover_acquisition_attempts" DROP CONSTRAINT "discover_acquisition_attempts_counts_check";--> statement-breakpoint
ALTER TABLE "discover_acquisition_attempts" ADD COLUMN "lease_expires_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_acquisition_attempts" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "discover_acquisition_attempts_one_running_per_target" ON "discover_acquisition_attempts" USING btree ("provider_target_id") WHERE "discover_acquisition_attempts"."outcome" = 'running';--> statement-breakpoint
ALTER TABLE "discover_acquisition_attempts" ADD CONSTRAINT "discover_acquisition_attempts_counts_check" CHECK (("discover_acquisition_attempts"."accepted_count" IS NULL OR "discover_acquisition_attempts"."accepted_count" >= 0)
        AND ("discover_acquisition_attempts"."rejected_count" IS NULL OR "discover_acquisition_attempts"."rejected_count" >= 0)
        AND "discover_acquisition_attempts"."retry_count" >= 0);