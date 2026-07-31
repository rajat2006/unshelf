ALTER TABLE "stop_items" ADD COLUMN "trail_id" uuid;--> statement-breakpoint
UPDATE "stop_items"
SET "trail_id" = "stops"."trail_id"
FROM "stops"
WHERE "stop_items"."stop_id" = "stops"."id";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "stop_items"
    GROUP BY "item_id", "trail_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one Stop per Item per Trail: resolve duplicate stop_items memberships first';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "stop_items" ALTER COLUMN "trail_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stop_items" ADD CONSTRAINT "stop_items_stop_trail_fk" FOREIGN KEY ("stop_id","trail_id") REFERENCES "public"."stops"("id","trail_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_items" ADD CONSTRAINT "stop_items_item_trail_unique" UNIQUE("item_id","trail_id");
