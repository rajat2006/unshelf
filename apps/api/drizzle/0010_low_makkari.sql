ALTER TABLE "daily_focus_items" ADD COLUMN "status_snapshot" text;--> statement-breakpoint
ALTER TABLE "daily_focus_items" ADD COLUMN "part_percentage_snapshot" integer;--> statement-breakpoint
UPDATE "daily_focus_items"
SET
	"status_snapshot" = "items"."status",
	"part_percentage_snapshot" = (
		SELECT round(
			100.0 * count(*) FILTER (WHERE "parts"."completed")
			/ nullif(count(*), 0)
		)::integer
		FROM "parts"
		WHERE "parts"."item_id" = "daily_focus_items"."item_id"
			AND "parts"."user_id" = "daily_focus_items"."user_id"
	)
FROM "items"
WHERE "items"."id" = "daily_focus_items"."item_id"
	AND "items"."user_id" = "daily_focus_items"."user_id";--> statement-breakpoint
ALTER TABLE "daily_focus_items" ALTER COLUMN "status_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_focus_items" ADD CONSTRAINT "daily_focus_items_status_snapshot_check" CHECK ("daily_focus_items"."status_snapshot" in ('not_started', 'in_progress', 'done'));--> statement-breakpoint
ALTER TABLE "daily_focus_items" ADD CONSTRAINT "daily_focus_items_part_percentage_snapshot_check" CHECK ("daily_focus_items"."part_percentage_snapshot" between 0 and 100);
