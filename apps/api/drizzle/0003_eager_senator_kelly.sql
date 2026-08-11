CREATE TABLE "learning_plan_item_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"learning_plan_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"stage_id" uuid,
	"node_id" uuid,
	"node_kind" text,
	CONSTRAINT "learning_plan_item_placements_item_plan_unique" UNIQUE("item_id","learning_plan_id"),
	CONSTRAINT "learning_plan_item_placements_id_identity_idx" UNIQUE("id","user_id","learning_plan_id"),
	CONSTRAINT "learning_plan_item_placements_stage_identity_idx" UNIQUE("id","user_id","learning_plan_id","item_id","stage_id"),
	CONSTRAINT "learning_plan_item_placements_node_unique" UNIQUE("node_id"),
	CONSTRAINT "learning_plan_item_placements_variant_check" CHECK ((
        "learning_plan_item_placements"."stage_id" is not null
        and "learning_plan_item_placements"."node_id" is null
        and "learning_plan_item_placements"."node_kind" is null
      ) or (
        "learning_plan_item_placements"."stage_id" is null
        and "learning_plan_item_placements"."node_id" is not null
        and "learning_plan_item_placements"."node_kind" = 'item'
      ))
);
--> statement-breakpoint
ALTER TABLE "learning_plan_nodes" DROP CONSTRAINT "learning_plan_nodes_kind_check";--> statement-breakpoint
ALTER TABLE "stage_items" ADD COLUMN "placement_id" uuid;--> statement-breakpoint
ALTER TABLE "learning_plan_item_placements" ADD CONSTRAINT "learning_plan_item_placements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plan_item_placements" ADD CONSTRAINT "learning_plan_item_placements_plan_owner_fk" FOREIGN KEY ("learning_plan_id","user_id") REFERENCES "public"."learning_plans"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plan_item_placements" ADD CONSTRAINT "learning_plan_item_placements_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_identity_idx" UNIQUE("id","user_id","learning_plan_id");--> statement-breakpoint
ALTER TABLE "learning_plan_item_placements" ADD CONSTRAINT "learning_plan_item_placements_stage_fk" FOREIGN KEY ("stage_id","user_id","learning_plan_id") REFERENCES "public"."stages"("id","user_id","learning_plan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plan_nodes" ADD CONSTRAINT "learning_plan_nodes_typed_identity_idx" UNIQUE("id","user_id","learning_plan_id","kind");--> statement-breakpoint
ALTER TABLE "learning_plan_item_placements" ADD CONSTRAINT "learning_plan_item_placements_node_fk" FOREIGN KEY ("node_id","user_id","learning_plan_id","node_kind") REFERENCES "public"."learning_plan_nodes"("id","user_id","learning_plan_id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_plan_item_placements_plan_idx" ON "learning_plan_item_placements" USING btree ("user_id","learning_plan_id");--> statement-breakpoint
INSERT INTO "learning_plan_item_placements" (
	"user_id", "learning_plan_id", "item_id", "stage_id"
)
SELECT "user_id", "learning_plan_id", "item_id", "stage_id"
FROM "stage_items";--> statement-breakpoint
UPDATE "stage_items"
SET "placement_id" = "learning_plan_item_placements"."id"
FROM "learning_plan_item_placements"
WHERE "learning_plan_item_placements"."user_id" = "stage_items"."user_id"
	AND "learning_plan_item_placements"."learning_plan_id" = "stage_items"."learning_plan_id"
	AND "learning_plan_item_placements"."item_id" = "stage_items"."item_id";--> statement-breakpoint
ALTER TABLE "stage_items" ALTER COLUMN "placement_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_placement_fk" FOREIGN KEY ("placement_id","user_id","learning_plan_id","item_id","stage_id") REFERENCES "public"."learning_plan_item_placements"("id","user_id","learning_plan_id","item_id","stage_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_placement_unique" UNIQUE("placement_id");--> statement-breakpoint
ALTER TABLE "learning_plan_nodes" ADD CONSTRAINT "learning_plan_nodes_kind_check" CHECK ("learning_plan_nodes"."kind" in ('item', 'stage'));
