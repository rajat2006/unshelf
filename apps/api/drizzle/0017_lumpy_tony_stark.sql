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
ALTER TABLE "discover_candidates" ADD CONSTRAINT "discover_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_candidates" ADD CONSTRAINT "discover_candidates_result_id_discover_provider_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."discover_provider_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discover_candidates_user_state_idx" ON "discover_candidates" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "discover_follows_active_target_idx" ON "discover_follows" USING btree ("target_id","deleted_at");
