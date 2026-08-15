DROP TRIGGER IF EXISTS "learning_plans_archived_row_guard" ON "learning_plans";
DROP TRIGGER IF EXISTS "learning_plan_nodes_archived_guard" ON "learning_plan_nodes";
DROP TRIGGER IF EXISTS "stages_archived_guard" ON "stages";
DROP TRIGGER IF EXISTS "learning_plan_item_placements_archived_guard" ON "learning_plan_item_placements";
DROP TRIGGER IF EXISTS "stage_items_archived_guard" ON "stage_items";
DROP TRIGGER IF EXISTS "learning_plan_edges_archived_guard" ON "learning_plan_edges";
DROP FUNCTION IF EXISTS "guard_archived_learning_plan_row"();
DROP FUNCTION IF EXISTS "guard_archived_learning_plan_structure"();

ALTER TABLE "learning_plan_nodes" ADD COLUMN "created_at" timestamp with time zone;

WITH "ranked_nodes" AS (
	SELECT
		"learning_plan_nodes"."id",
		row_number() OVER (
			PARTITION BY "learning_plan_nodes"."learning_plan_id"
			ORDER BY
				CASE WHEN "learning_plan_nodes"."kind" = 'stage' THEN 0 ELSE 1 END,
				coalesce("stages"."name", "items"."title"),
				"learning_plan_nodes"."id"
		) AS "ordinal"
	FROM "learning_plan_nodes"
	LEFT JOIN "stages"
		ON "stages"."id" = "learning_plan_nodes"."id"
	LEFT JOIN "learning_plan_item_placements"
		ON "learning_plan_item_placements"."node_id" = "learning_plan_nodes"."id"
	LEFT JOIN "items"
		ON "items"."id" = "learning_plan_item_placements"."item_id"
)
UPDATE "learning_plan_nodes"
SET "created_at" = timestamp with time zone '2000-01-01 00:00:00+00'
	+ "ranked_nodes"."ordinal" * interval '1 microsecond'
FROM "ranked_nodes"
WHERE "learning_plan_nodes"."id" = "ranked_nodes"."id";

ALTER TABLE "learning_plan_nodes" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "learning_plan_nodes" ALTER COLUMN "created_at" SET NOT NULL;
