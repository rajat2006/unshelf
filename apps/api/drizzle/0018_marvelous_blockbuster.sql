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
CREATE TABLE "discover_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_target_id" uuid NOT NULL,
	"target_url" text NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"last_applied_provider_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_follows_user_target_unique" UNIQUE("user_id","provider_target_id"),
	CONSTRAINT "discover_follows_identity_owner_unique" UNIQUE("id","user_id"),
	CONSTRAINT "discover_follows_identity_target_unique" UNIQUE("id","user_id","provider_target_id"),
	CONSTRAINT "discover_follows_lifecycle_check" CHECK ("discover_follows"."lifecycle" IN ('active', 'paused', 'removed'))
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
	CONSTRAINT "discover_idempotency_operation_check" CHECK ("discover_idempotency"."operation" = 'confirm_follow')
);
--> statement-breakpoint
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
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_provider_target_id_discover_provider_targets_id_fk" FOREIGN KEY ("provider_target_id") REFERENCES "public"."discover_provider_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_applied_snapshot_target_fk" FOREIGN KEY ("last_applied_provider_snapshot_id","provider_target_id") REFERENCES "public"."discover_provider_snapshots"("id","provider_target_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discover_idempotency" ADD CONSTRAINT "discover_idempotency_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discover_candidates_user_id_idx" ON "discover_candidates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discover_discoveries_user_state_idx" ON "discover_discoveries" USING btree ("user_id","state","discovered_at");--> statement-breakpoint
CREATE INDEX "discover_presence_user_id_idx" ON "discover_follow_candidate_presence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discover_follows_user_lifecycle_idx" ON "discover_follows" USING btree ("user_id","lifecycle");