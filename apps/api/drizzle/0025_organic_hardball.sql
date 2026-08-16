ALTER TABLE "discover_provider_result_projections" ADD COLUMN "generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_results" ADD COLUMN "data_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_results" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discover_provider_results" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "discover_provider_results" AS "result"
SET "fetched_at" = "projection"."fetched_at",
    "expires_at" = "projection"."expires_at"
FROM "discover_provider_result_projections" AS "projection"
WHERE "projection"."provider_result_id" = "result"."id"
  AND "result"."external_reference" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_target_projections" ADD COLUMN "generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "discover_result_projection_expiry_idx" ON "discover_provider_result_projections" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discover_provider_results_expiry_idx" ON "discover_provider_results" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discover_target_projection_expiry_idx" ON "discover_provider_target_projections" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "discover_provider_targets_expiry_idx" ON "discover_provider_targets" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "discover_provider_result_projections" ADD CONSTRAINT "discover_result_projection_generation_check" CHECK ("discover_provider_result_projections"."generation" >= 0);--> statement-breakpoint
ALTER TABLE "discover_provider_results" ADD CONSTRAINT "discover_provider_results_generation_check" CHECK ("discover_provider_results"."data_generation" >= 0);--> statement-breakpoint
ALTER TABLE "discover_provider_results" ADD CONSTRAINT "discover_provider_results_expiry_check" CHECK ((
        "discover_provider_results"."external_reference" IS NULL
        AND "discover_provider_results"."fetched_at" IS NULL
        AND "discover_provider_results"."expires_at" IS NULL
      ) OR (
        "discover_provider_results"."external_reference" IS NOT NULL
        AND "discover_provider_results"."fetched_at" IS NOT NULL
        AND "discover_provider_results"."expires_at" > "discover_provider_results"."fetched_at"
      ));--> statement-breakpoint
ALTER TABLE "discover_provider_target_projections" ADD CONSTRAINT "discover_target_projection_generation_check" CHECK ("discover_provider_target_projections"."generation" >= 0);
--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "checkpoint_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "checkpoint_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" DROP CONSTRAINT "discover_provider_targets_generation_check";--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "data_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD CONSTRAINT "discover_provider_targets_generation_check" CHECK ("discover_provider_targets"."data_generation" >= 0 AND "discover_provider_targets"."acquisition_generation" >= 0);--> statement-breakpoint
UPDATE "discover_provider_targets"
SET "checkpoint_payload" = NULL,
    "checkpoint_fetched_at" = NULL,
    "checkpoint_expires_at" = NULL,
    "verified_coverage_started_at" = NULL
WHERE "checkpoint_payload" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "discover_provider_targets_checkpoint_expiry_idx" ON "discover_provider_targets" USING btree ("checkpoint_expires_at");--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD CONSTRAINT "discover_provider_targets_checkpoint_expiry_check" CHECK ((
        "discover_provider_targets"."checkpoint_payload" IS NULL
        AND "discover_provider_targets"."checkpoint_fetched_at" IS NULL
        AND "discover_provider_targets"."checkpoint_expires_at" IS NULL
      ) OR (
        "discover_provider_targets"."checkpoint_payload" IS NOT NULL
        AND "discover_provider_targets"."checkpoint_fetched_at" IS NOT NULL
        AND "discover_provider_targets"."checkpoint_expires_at" > "discover_provider_targets"."checkpoint_fetched_at"
      ));
