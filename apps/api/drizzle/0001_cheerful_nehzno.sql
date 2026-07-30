ALTER TABLE "stop_items" ADD COLUMN "trail_id" uuid;--> statement-breakpoint
UPDATE "stop_items"
SET "trail_id" = "stops"."trail_id"
FROM "stops"
WHERE "stop_items"."stop_id" = "stops"."id";--> statement-breakpoint
DELETE FROM "stop_items" AS "duplicate"
USING "stop_items" AS "kept"
WHERE "duplicate"."item_id" = "kept"."item_id"
  AND "duplicate"."trail_id" = "kept"."trail_id"
  AND "duplicate"."stop_id" > "kept"."stop_id";--> statement-breakpoint
ALTER TABLE "stop_items" ALTER COLUMN "trail_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stop_items" ADD CONSTRAINT "stop_items_stop_trail_fk" FOREIGN KEY ("stop_id","trail_id") REFERENCES "public"."stops"("id","trail_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_items" ADD CONSTRAINT "stop_items_item_trail_unique" UNIQUE("item_id","trail_id");
