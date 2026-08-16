ALTER TABLE "discover_follows" ADD COLUMN "latest_workspace_refresh_outcome" text;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD COLUMN "latest_workspace_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discover_follows" ADD CONSTRAINT "discover_follows_workspace_refresh_check" CHECK ((
        "discover_follows"."latest_workspace_refresh_outcome" IS NULL
        AND "discover_follows"."latest_workspace_refreshed_at" IS NULL
      ) OR (
        "discover_follows"."latest_workspace_refresh_outcome" IN (
          'joined', 'skipped', 'complete', 'partial', 'failed',
          'throttled', 'provider_unavailable'
        )
        AND "discover_follows"."latest_workspace_refreshed_at" IS NOT NULL
      ));