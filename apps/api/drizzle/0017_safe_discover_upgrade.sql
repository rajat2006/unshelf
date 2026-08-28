-- The prototype Discover schema shipped before the smaller scheduled-acquisition
-- model. Keep its tables intact until every durable row has been validated and
-- copied; moving them also moves their indexes out of the public namespace.
CREATE SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_acquisition_attempts" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_candidates" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_discoveries" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_follow_candidate_presence" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_follow_preview_results" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_follow_previews" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_follows" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_idempotency" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_provider_gates" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_provider_result_projections" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_provider_results" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_provider_snapshot_results" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_provider_snapshots" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_provider_target_projections" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
ALTER TABLE "discover_provider_targets" SET SCHEMA "discover_prototype_536";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM discover_prototype_536.discover_follows follow
    JOIN discover_prototype_536.discover_provider_targets target
      ON target.id = follow.provider_target_id
    LEFT JOIN discover_prototype_536.discover_provider_target_projections projection
      ON projection.provider_target_id = target.id
    WHERE target.external_reference IS NULL
       OR NULLIF(target.target_payload ->> 'uploadsPlaylistId', '') IS NULL
       OR projection.provider_target_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate a Follow whose YouTube channel identity or metadata has expired';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM discover_prototype_536.discover_candidates candidate
    JOIN discover_prototype_536.discover_provider_results result
      ON result.id = candidate.provider_result_id
    LEFT JOIN discover_prototype_536.discover_provider_result_projections projection
      ON projection.provider_result_id = result.id
    LEFT JOIN (
      SELECT
        membership.provider_result_id,
        count(DISTINCT snapshot.provider_target_id) AS target_count
      FROM discover_prototype_536.discover_provider_snapshot_results membership
      JOIN discover_prototype_536.discover_provider_snapshots snapshot
        ON snapshot.id = membership.snapshot_id
      GROUP BY membership.provider_result_id
    ) mapping ON mapping.provider_result_id = result.id
    LEFT JOIN discover_prototype_536.discover_provider_targets target
      ON target.id = (
        SELECT snapshot.provider_target_id
        FROM discover_prototype_536.discover_provider_snapshot_results membership
        JOIN discover_prototype_536.discover_provider_snapshots snapshot
          ON snapshot.id = membership.snapshot_id
        WHERE membership.provider_result_id = result.id
        LIMIT 1
      )
    LEFT JOIN discover_prototype_536.discover_provider_target_projections target_projection
      ON target_projection.provider_target_id = target.id
    WHERE result.external_reference IS NULL
       OR projection.provider_result_id IS NULL
       OR mapping.target_count IS DISTINCT FROM 1
       OR target.external_reference IS NULL
       OR NULLIF(target.target_payload ->> 'uploadsPlaylistId', '') IS NULL
       OR target_projection.provider_target_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate a Candidate whose YouTube video or channel metadata has expired or is ambiguous';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM discover_prototype_536.discover_candidates candidate
    WHERE candidate.item_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM discover_prototype_536.discover_discoveries discovery
        WHERE discovery.candidate_id = candidate.id
          AND discovery.state = 'kept'
      )
  ) THEN
    RAISE EXCEPTION 'Cannot migrate a kept Candidate without its Library Item';
  END IF;
END
$$;
--> statement-breakpoint
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
--> statement-breakpoint
INSERT INTO "discover_provider_targets" (
  "id",
  "provider",
  "external_id",
  "canonical_url",
  "title",
  "thumbnail_url",
  "uploads_playlist_id",
  "next_fetch_at",
  "last_fetched_at",
  "last_fetch_outcome",
  "created_at",
  "updated_at"
)
SELECT
  target.id,
  target.provider,
  target.external_reference,
  'https://www.youtube.com/channel/' || target.external_reference,
  projection.publisher,
  NULL,
  target.target_payload ->> 'uploadsPlaylistId',
  COALESCE(target.next_eligible_at, now()),
  target.fetched_at,
  CASE latest_attempt.outcome
    WHEN 'complete' THEN 'complete'
    WHEN 'partial' THEN 'partial'
    WHEN 'failed' THEN 'failed'
    WHEN 'throttled' THEN 'throttled'
    WHEN 'provider_unavailable' THEN 'failed'
    ELSE NULL
  END,
  COALESCE(target.fetched_at, projection.fetched_at),
  GREATEST(
    COALESCE(target.fetched_at, '-infinity'::timestamptz),
    projection.fetched_at
  )
FROM discover_prototype_536.discover_provider_targets target
JOIN discover_prototype_536.discover_provider_target_projections projection
  ON projection.provider_target_id = target.id
LEFT JOIN LATERAL (
  SELECT attempt.outcome
  FROM discover_prototype_536.discover_acquisition_attempts attempt
  WHERE attempt.provider_target_id = target.id
  ORDER BY attempt.started_at DESC, attempt.id DESC
  LIMIT 1
) latest_attempt ON true
WHERE target.external_reference IS NOT NULL
  AND NULLIF(target.target_payload ->> 'uploadsPlaylistId', '') IS NOT NULL;
--> statement-breakpoint
WITH result_targets AS (
  SELECT
    membership.provider_result_id,
    min(snapshot.provider_target_id::text)::uuid AS target_id
  FROM discover_prototype_536.discover_provider_snapshot_results membership
  JOIN discover_prototype_536.discover_provider_snapshots snapshot
    ON snapshot.id = membership.snapshot_id
  GROUP BY membership.provider_result_id
  HAVING count(DISTINCT snapshot.provider_target_id) = 1
)
INSERT INTO "discover_provider_results" (
  "id",
  "target_id",
  "provider",
  "external_id",
  "source",
  "title",
  "thumbnail_url",
  "published_at",
  "duration_seconds",
  "created_at",
  "updated_at"
)
SELECT
  result.id,
  result_targets.target_id,
  result.provider,
  result.external_reference,
  projection.source,
  projection.title,
  projection.thumbnail_url,
  projection.published_at,
  projection.duration_seconds,
  projection.fetched_at,
  projection.fetched_at
FROM discover_prototype_536.discover_provider_results result
JOIN result_targets ON result_targets.provider_result_id = result.id
JOIN discover_prototype_536.discover_provider_result_projections projection
  ON projection.provider_result_id = result.id
JOIN discover_provider_targets target ON target.id = result_targets.target_id
WHERE result.external_reference IS NOT NULL;
--> statement-breakpoint
INSERT INTO "discover_follows" (
  "id",
  "user_id",
  "target_id",
  "deleted_at",
  "created_at",
  "updated_at"
)
-- The smaller model has one active/deleted boundary. Prototype Paused and
-- Removed Follows both stop intake, so their last update becomes deleted_at.
SELECT
  follow.id,
  follow.user_id,
  follow.provider_target_id,
  CASE WHEN follow.lifecycle = 'active' THEN NULL ELSE follow.updated_at END,
  follow.created_at,
  follow.updated_at
FROM discover_prototype_536.discover_follows follow;
--> statement-breakpoint
INSERT INTO "discover_candidates" (
  "id",
  "user_id",
  "result_id",
  "state",
  "kept_at",
  "rejected_at",
  "created_at",
  "updated_at"
)
-- Prototype Discoveries recorded repeated appearances. The current model keeps
-- one durable Candidate decision: a Library Item wins as Kept, the latest
-- dismissal becomes Rejected, and New/Seen remains Pending.
SELECT
  candidate.id,
  candidate.user_id,
  candidate.provider_result_id,
  CASE
    WHEN candidate.item_id IS NOT NULL THEN 'kept'
    WHEN latest_decision.state = 'dismissed' THEN 'rejected'
    ELSE 'pending'
  END,
  CASE
    WHEN candidate.item_id IS NOT NULL
      THEN COALESCE(kept_decision.decided_at, item.created_at, candidate.created_at)
    ELSE NULL
  END,
  CASE
    WHEN candidate.item_id IS NULL AND latest_decision.state = 'dismissed'
      THEN latest_decision.decided_at
    ELSE NULL
  END,
  candidate.created_at,
  GREATEST(
    candidate.created_at,
    COALESCE(latest_decision.changed_at, candidate.created_at)
  )
FROM discover_prototype_536.discover_candidates candidate
LEFT JOIN items item
  ON item.id = candidate.item_id
 AND item.user_id = candidate.user_id
LEFT JOIN LATERAL (
  SELECT
    discovery.state,
    discovery.decided_at,
    COALESCE(discovery.decided_at, discovery.seen_at, discovery.discovered_at) AS changed_at
  FROM discover_prototype_536.discover_discoveries discovery
  WHERE discovery.candidate_id = candidate.id
  ORDER BY
    COALESCE(discovery.decided_at, discovery.seen_at, discovery.discovered_at) DESC,
    discovery.id DESC
  LIMIT 1
) latest_decision ON true
LEFT JOIN LATERAL (
  SELECT max(discovery.decided_at) AS decided_at
  FROM discover_prototype_536.discover_discoveries discovery
  WHERE discovery.candidate_id = candidate.id
    AND discovery.state = 'kept'
) kept_decision ON true;
--> statement-breakpoint
INSERT INTO "item_provider_identities" (
  "user_id",
  "provider",
  "external_id",
  "item_id",
  "created_at"
)
SELECT
  candidate.user_id,
  result.provider,
  result.external_id,
  legacy_candidate.item_id,
  COALESCE(candidate.kept_at, candidate.created_at)
FROM discover_prototype_536.discover_candidates legacy_candidate
JOIN discover_candidates candidate ON candidate.id = legacy_candidate.id
JOIN discover_provider_results result ON result.id = candidate.result_id
WHERE legacy_candidate.item_id IS NOT NULL;
--> statement-breakpoint
-- Preview, acquisition-attempt, snapshot, presence, gate, and idempotency rows
-- were operational cache/state. Durable Follows, Candidates, decisions, and
-- Library identities have been copied above, so the retired model can go.
DROP SCHEMA "discover_prototype_536" CASCADE;
