ALTER TABLE "discover_provider_targets" ADD COLUMN "next_fetch_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "last_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "last_fetch_outcome" text;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "discover_provider_targets_due_idx" ON "discover_provider_targets" USING btree ("next_fetch_at","claim_expires_at");--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD CONSTRAINT "discover_provider_targets_fetch_outcome_check" CHECK ("discover_provider_targets"."last_fetch_outcome" is null or "discover_provider_targets"."last_fetch_outcome" in ('complete', 'partial', 'failed', 'throttled'));--> statement-breakpoint
ALTER TABLE "discover_provider_targets" ADD CONSTRAINT "discover_provider_targets_claim_check" CHECK (("discover_provider_targets"."claim_token" is null and "discover_provider_targets"."claim_expires_at" is null)
        or ("discover_provider_targets"."claim_token" is not null and "discover_provider_targets"."claim_expires_at" is not null));