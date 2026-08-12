CREATE TABLE "learning_plan_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"learning_plan_id" uuid NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "learning_plan_nodes_id_user_id_idx" UNIQUE("id","user_id"),
	CONSTRAINT "learning_plan_nodes_id_plan_id_idx" UNIQUE("id","learning_plan_id"),
	CONSTRAINT "learning_plan_nodes_identity_idx" UNIQUE("id","user_id","learning_plan_id"),
	CONSTRAINT "learning_plan_nodes_kind_check" CHECK ("learning_plan_nodes"."kind" in ('stage'))
);
--> statement-breakpoint
ALTER TABLE "trail_edges" RENAME TO "learning_plan_edges";--> statement-breakpoint
ALTER TABLE "trails" RENAME TO "learning_plans";--> statement-breakpoint
ALTER TABLE "stop_items" RENAME TO "stage_items";--> statement-breakpoint
ALTER TABLE "stops" RENAME TO "stages";--> statement-breakpoint
ALTER TABLE "stage_items" RENAME COLUMN "stop_id" TO "stage_id";--> statement-breakpoint
ALTER TABLE "stage_items" RENAME COLUMN "trail_id" TO "learning_plan_id";--> statement-breakpoint
ALTER TABLE "stages" RENAME COLUMN "trail_id" TO "learning_plan_id";--> statement-breakpoint
ALTER TABLE "learning_plan_edges" RENAME COLUMN "from_stop_id" TO "from_node_id";--> statement-breakpoint
ALTER TABLE "learning_plan_edges" RENAME COLUMN "to_stop_id" TO "to_node_id";--> statement-breakpoint
ALTER TABLE "learning_plan_edges" RENAME COLUMN "trail_id" TO "learning_plan_id";--> statement-breakpoint
INSERT INTO "learning_plan_nodes" ("id", "user_id", "learning_plan_id", "kind")
SELECT "id", "user_id", "learning_plan_id", 'stage'
FROM "stages";--> statement-breakpoint
ALTER TABLE "stage_items" DROP CONSTRAINT "stop_items_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "stage_items" DROP CONSTRAINT "stop_items_stop_id_stops_id_fk";
--> statement-breakpoint
ALTER TABLE "stage_items" DROP CONSTRAINT "stop_items_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "stage_items" DROP CONSTRAINT "stop_items_stop_owner_fk";
--> statement-breakpoint
ALTER TABLE "stage_items" DROP CONSTRAINT "stop_items_item_owner_fk";
--> statement-breakpoint
ALTER TABLE "stage_items" DROP CONSTRAINT "stop_items_stop_trail_fk";
--> statement-breakpoint
ALTER TABLE "stages" DROP CONSTRAINT "stops_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "stages" DROP CONSTRAINT "stops_trail_owner_fk";
--> statement-breakpoint
ALTER TABLE "learning_plan_edges" DROP CONSTRAINT "trail_edges_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "learning_plan_edges" DROP CONSTRAINT "trail_edges_from_owner_fk";
--> statement-breakpoint
ALTER TABLE "learning_plan_edges" DROP CONSTRAINT "trail_edges_to_owner_fk";
--> statement-breakpoint
ALTER TABLE "learning_plan_edges" DROP CONSTRAINT "trail_edges_from_trail_fk";
--> statement-breakpoint
ALTER TABLE "learning_plan_edges" DROP CONSTRAINT "trail_edges_to_trail_fk";
--> statement-breakpoint
ALTER TABLE "learning_plans" DROP CONSTRAINT "trails_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "stage_items" DROP CONSTRAINT "stop_items_item_trail_unique";--> statement-breakpoint
ALTER TABLE "stages" DROP CONSTRAINT "stops_id_user_id_idx";--> statement-breakpoint
ALTER TABLE "stages" DROP CONSTRAINT "stops_id_trail_id_idx";--> statement-breakpoint
ALTER TABLE "learning_plans" DROP CONSTRAINT "trails_id_user_id_idx";--> statement-breakpoint
ALTER TABLE "learning_plan_edges" DROP CONSTRAINT "trail_edges_no_self_loop";--> statement-breakpoint
DROP INDEX "stop_items_item_id_idx";--> statement-breakpoint
DROP INDEX "stops_user_id_idx";--> statement-breakpoint
DROP INDEX "stops_trail_id_idx";--> statement-breakpoint
DROP INDEX "trail_edges_to_stop_id_idx";--> statement-breakpoint
DROP INDEX "trail_edges_trail_id_idx";--> statement-breakpoint
DROP INDEX "trails_user_id_idx";--> statement-breakpoint
ALTER TABLE "stage_items" DROP CONSTRAINT "stop_items_stop_id_item_id_pk";--> statement-breakpoint
ALTER TABLE "learning_plan_edges" DROP CONSTRAINT "trail_edges_user_id_from_stop_id_to_stop_id_pk";--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_stage_id_item_id_pk" PRIMARY KEY("stage_id","item_id");--> statement-breakpoint
ALTER TABLE "learning_plan_edges" ADD CONSTRAINT "learning_plan_edges_user_id_from_node_id_to_node_id_pk" PRIMARY KEY("user_id","from_node_id","to_node_id");--> statement-breakpoint
ALTER TABLE "stage_items" ADD COLUMN "position" integer;--> statement-breakpoint
WITH ordered_stage_items AS (
	SELECT
		"stage_id",
		"item_id",
		row_number() OVER (
			PARTITION BY "stage_id"
			ORDER BY "item_id"
		) - 1 AS "position"
	FROM "stage_items"
)
UPDATE "stage_items"
SET "position" = ordered_stage_items."position"
FROM ordered_stage_items
WHERE "stage_items"."stage_id" = ordered_stage_items."stage_id"
	AND "stage_items"."item_id" = ordered_stage_items."item_id";--> statement-breakpoint
ALTER TABLE "stage_items" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_id_user_id_idx" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_id_user_id_idx" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_id_plan_id_idx" UNIQUE("id","learning_plan_id");--> statement-breakpoint
ALTER TABLE "learning_plan_nodes" ADD CONSTRAINT "learning_plan_nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plan_nodes" ADD CONSTRAINT "learning_plan_nodes_plan_owner_fk" FOREIGN KEY ("learning_plan_id","user_id") REFERENCES "public"."learning_plans"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_plan_nodes_plan_id_idx" ON "learning_plan_nodes" USING btree ("user_id","learning_plan_id");--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_stage_owner_fk" FOREIGN KEY ("stage_id","user_id") REFERENCES "public"."stages"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_item_owner_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."items"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_stage_plan_fk" FOREIGN KEY ("stage_id","learning_plan_id") REFERENCES "public"."stages"("id","learning_plan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_plan_owner_fk" FOREIGN KEY ("learning_plan_id","user_id") REFERENCES "public"."learning_plans"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_node_identity_fk" FOREIGN KEY ("id","user_id","learning_plan_id") REFERENCES "public"."learning_plan_nodes"("id","user_id","learning_plan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plan_edges" ADD CONSTRAINT "learning_plan_edges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plan_edges" ADD CONSTRAINT "learning_plan_edges_from_owner_fk" FOREIGN KEY ("from_node_id","user_id") REFERENCES "public"."learning_plan_nodes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plan_edges" ADD CONSTRAINT "learning_plan_edges_to_owner_fk" FOREIGN KEY ("to_node_id","user_id") REFERENCES "public"."learning_plan_nodes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plan_edges" ADD CONSTRAINT "learning_plan_edges_from_plan_fk" FOREIGN KEY ("from_node_id","learning_plan_id") REFERENCES "public"."learning_plan_nodes"("id","learning_plan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plan_edges" ADD CONSTRAINT "learning_plan_edges_to_plan_fk" FOREIGN KEY ("to_node_id","learning_plan_id") REFERENCES "public"."learning_plan_nodes"("id","learning_plan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_plans" ADD CONSTRAINT "learning_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stage_items_item_id_idx" ON "stage_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stages_user_id_idx" ON "stages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stages_plan_id_idx" ON "stages" USING btree ("learning_plan_id");--> statement-breakpoint
CREATE INDEX "learning_plan_edges_to_node_id_idx" ON "learning_plan_edges" USING btree ("user_id","to_node_id");--> statement-breakpoint
CREATE INDEX "learning_plan_edges_plan_id_idx" ON "learning_plan_edges" USING btree ("user_id","learning_plan_id");--> statement-breakpoint
CREATE INDEX "learning_plans_user_id_idx" ON "learning_plans" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_item_plan_unique" UNIQUE("item_id","learning_plan_id");--> statement-breakpoint
ALTER TABLE "stage_items" ADD CONSTRAINT "stage_items_stage_position_unique" UNIQUE("stage_id","position");--> statement-breakpoint
ALTER TABLE "learning_plan_edges" ADD CONSTRAINT "learning_plan_edges_no_self_loop" CHECK ("learning_plan_edges"."from_node_id" <> "learning_plan_edges"."to_node_id");
