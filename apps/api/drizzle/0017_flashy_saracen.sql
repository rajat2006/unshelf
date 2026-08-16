ALTER TABLE "discover_provider_targets" DROP CONSTRAINT "discover_provider_targets_expiry_check";--> statement-breakpoint
DROP INDEX "discover_provider_results_identity_unique";--> statement-breakpoint
DROP INDEX "discover_provider_targets_identity_unique";--> statement-breakpoint
ALTER TABLE "discover_provider_results" ALTER COLUMN "external_reference" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ALTER COLUMN "external_reference" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ALTER COLUMN "target_payload" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ALTER COLUMN "fetched_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "discover_provider_results_identity_unique" ON "discover_provider_results" USING btree ("provider","external_reference") WHERE "discover_provider_results"."external_reference" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "discover_provider_targets_identity_unique" ON "discover_provider_targets" USING btree ("provider","target_kind","acquisition_scope","external_reference") WHERE "discover_provider_targets"."external_reference" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD CONSTRAINT "discover_provider_targets_expiry_check" CHECK ((
        "discover_provider_targets"."external_reference" IS NULL
        AND "discover_provider_targets"."target_payload" IS NULL
        AND "discover_provider_targets"."fetched_at" IS NULL
        AND "discover_provider_targets"."expires_at" IS NULL
      ) OR (
        "discover_provider_targets"."external_reference" IS NOT NULL
        AND "discover_provider_targets"."target_payload" IS NOT NULL
        AND "discover_provider_targets"."fetched_at" IS NOT NULL
        AND "discover_provider_targets"."expires_at" > "discover_provider_targets"."fetched_at"
      ));