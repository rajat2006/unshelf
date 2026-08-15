DROP TRIGGER IF EXISTS "learning_plans_archived_row_guard" ON "learning_plans";
DROP TRIGGER IF EXISTS "learning_plan_nodes_archived_guard" ON "learning_plan_nodes";
DROP TRIGGER IF EXISTS "stages_archived_guard" ON "stages";
DROP TRIGGER IF EXISTS "learning_plan_item_placements_archived_guard" ON "learning_plan_item_placements";
DROP TRIGGER IF EXISTS "stage_items_archived_guard" ON "stage_items";
DROP TRIGGER IF EXISTS "learning_plan_edges_archived_guard" ON "learning_plan_edges";
DROP FUNCTION IF EXISTS "guard_archived_learning_plan_row"();
DROP FUNCTION IF EXISTS "guard_archived_learning_plan_structure"();
