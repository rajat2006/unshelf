ALTER TABLE "daily_focus_items" ADD COLUMN "title_snapshot" text;--> statement-breakpoint
ALTER TABLE "daily_focus_items" ADD COLUMN "type_snapshot" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "daily_focus_items"
SET
	"title_snapshot" = "items"."title",
	"type_snapshot" = "items"."type"
FROM "items"
WHERE "items"."id" = "daily_focus_items"."item_id"
	AND "items"."user_id" = "daily_focus_items"."user_id";--> statement-breakpoint
ALTER TABLE "daily_focus_items" ALTER COLUMN "title_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_focus_items" ALTER COLUMN "type_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_focus_items" ADD CONSTRAINT "daily_focus_items_type_snapshot_check" CHECK ("daily_focus_items"."type_snapshot" in ('article', 'video', 'playlist', 'course', 'book', 'other'));
