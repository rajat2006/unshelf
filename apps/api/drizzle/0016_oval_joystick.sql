CREATE TABLE "discover_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"kept_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_candidates_user_result_unique" UNIQUE("user_id","result_id"),
	CONSTRAINT "discover_candidates_state_check" CHECK ("discover_candidates"."state" in ('pending', 'kept', 'rejected')),
	CONSTRAINT "discover_candidates_decision_timestamps_check" CHECK (("discover_candidates"."state" = 'pending' and "discover_candidates"."kept_at" is null and "discover_candidates"."rejected_at" is null)
        or ("discover_candidates"."state" = 'kept' and "discover_candidates"."kept_at" is not null and "discover_candidates"."rejected_at" is null)
        or ("discover_candidates"."state" = 'rejected' and "discover_candidates"."kept_at" is null and "discover_candidates"."rejected_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "discover_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_follows_user_target_unique" UNIQUE("user_id","target_id")
);
--> statement-breakpoint
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
	"next_fetch_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_fetch_outcome" text,
	"claim_token" uuid,
	"claim_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_provider_targets_identity_unique" UNIQUE("provider","external_id"),
	CONSTRAINT "discover_provider_targets_provider_check" CHECK ("discover_provider_targets"."provider" = 'youtube'),
	CONSTRAINT "discover_provider_targets_fetch_outcome_check" CHECK ("discover_provider_targets"."last_fetch_outcome" is null or "discover_provider_targets"."last_fetch_outcome" in ('complete', 'partial', 'failed', 'throttled')),
	CONSTRAINT "discover_provider_targets_claim_check" CHECK (("discover_provider_targets"."claim_token" is null and "discover_provider_targets"."claim_expires_at" is null)
        or ("discover_provider_targets"."claim_token" is not null and "discover_provider_targets"."claim_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "item_provider_identities" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_provider_identities_user_id_provider_external_id_pk" PRIMARY KEY("user_id","provider","external_id"),
	CONSTRAINT "item_provider_identities_provider_check" CHECK ("item_provider_identities"."provider" = 'youtube')
);
--> statement-breakpoint
ALTER TABLE "discover_candidates" ADD CONSTRAINT "discover_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_candidates" ADD CONSTRAINT "discover_candidates_result_id_discover_provider_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."discover_provider_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_provider_results" ADD CONSTRAINT "discover_provider_results_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_provider_identities" ADD CONSTRAINT "item_provider_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_provider_identities" ADD CONSTRAINT "item_provider_identities_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discover_candidates_user_state_idx" ON "discover_candidates" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "discover_follows_active_target_idx" ON "discover_follows" USING btree ("target_id","deleted_at");--> statement-breakpoint
CREATE INDEX "discover_provider_results_target_published_idx" ON "discover_provider_results" USING btree ("target_id","published_at");--> statement-breakpoint
CREATE INDEX "discover_provider_targets_due_idx" ON "discover_provider_targets" USING btree ("next_fetch_at","claim_expires_at");