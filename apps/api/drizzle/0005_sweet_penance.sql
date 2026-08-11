ALTER TABLE "items" ADD COLUMN "created_at" timestamp with time zone;--> statement-breakpoint
UPDATE "items"
SET "created_at" = "users"."created_at"
FROM "users"
WHERE "items"."user_id" = "users"."id";--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "created_at" SET NOT NULL;
