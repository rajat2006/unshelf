CREATE TABLE "daily_planning_suppressions" (
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"date" date DEFAULT current_date NOT NULL,
	CONSTRAINT "daily_planning_suppressions_user_id_item_id_date_pk" PRIMARY KEY("user_id","item_id","date")
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "activity_at" timestamp with time zone;--> statement-breakpoint
UPDATE "items" SET "activity_at" = "created_at";--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "activity_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "activity_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_planning_suppressions" ADD CONSTRAINT "daily_planning_suppressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_planning_suppressions" ADD CONSTRAINT "daily_planning_suppressions_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_planning_suppressions_user_date_idx" ON "daily_planning_suppressions" USING btree ("user_id","date");
