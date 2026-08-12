CREATE TABLE "daily_focus_item_origins" (
	"daily_focus_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"placement_id" uuid NOT NULL,
	CONSTRAINT "daily_focus_item_origins_daily_focus_id_item_id_pk" PRIMARY KEY("daily_focus_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "daily_focus_items" ADD CONSTRAINT "daily_focus_items_identity_idx" UNIQUE("daily_focus_id","user_id","item_id");--> statement-breakpoint
ALTER TABLE "learning_plan_item_placements" ADD CONSTRAINT "learning_plan_item_placements_origin_identity_idx" UNIQUE("id","user_id","item_id");--> statement-breakpoint
ALTER TABLE "daily_focus_item_origins" ADD CONSTRAINT "daily_focus_item_origins_focus_item_fk" FOREIGN KEY ("daily_focus_id","user_id","item_id") REFERENCES "public"."daily_focus_items"("daily_focus_id","user_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_focus_item_origins" ADD CONSTRAINT "daily_focus_item_origins_placement_fk" FOREIGN KEY ("placement_id","user_id","item_id") REFERENCES "public"."learning_plan_item_placements"("id","user_id","item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_focus_item_origins_user_id_idx" ON "daily_focus_item_origins" USING btree ("user_id");
