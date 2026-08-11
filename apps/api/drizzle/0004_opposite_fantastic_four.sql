ALTER TABLE "learning_plans" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE FUNCTION guard_archived_learning_plan_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'archived Learning Plan structure is read-only'
      USING ERRCODE = '23514',
            CONSTRAINT = 'learning_plan_active_structure';
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.archived_at IS NOT NULL
    AND NEW.archived_at IS NOT NULL
    AND (
      OLD.id IS DISTINCT FROM NEW.id
      OR OLD.user_id IS DISTINCT FROM NEW.user_id
      OR OLD.name IS DISTINCT FROM NEW.name
      OR OLD.created_at IS DISTINCT FROM NEW.created_at
    )
  THEN
    RAISE EXCEPTION 'archived Learning Plan structure is read-only'
      USING ERRCODE = '23514',
            CONSTRAINT = 'learning_plan_active_structure';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
CREATE TRIGGER learning_plans_archived_name_guard
BEFORE UPDATE OR DELETE ON learning_plans
FOR EACH ROW EXECUTE FUNCTION guard_archived_learning_plan_row();--> statement-breakpoint
CREATE FUNCTION guard_archived_learning_plan_structure()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  archived boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1 FROM learning_plans
      WHERE id = NEW.learning_plan_id AND archived_at IS NOT NULL
    ) INTO archived;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1 FROM learning_plans
      WHERE id = OLD.learning_plan_id AND archived_at IS NOT NULL
    ) INTO archived;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM learning_plans
      WHERE id IN (OLD.learning_plan_id, NEW.learning_plan_id)
        AND archived_at IS NOT NULL
    ) INTO archived;
  END IF;

  IF archived THEN
    RAISE EXCEPTION 'archived Learning Plan structure is read-only'
      USING ERRCODE = '23514',
            CONSTRAINT = 'learning_plan_active_structure';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
CREATE TRIGGER learning_plan_nodes_archived_guard
BEFORE INSERT OR UPDATE OR DELETE ON learning_plan_nodes
FOR EACH ROW EXECUTE FUNCTION guard_archived_learning_plan_structure();--> statement-breakpoint
CREATE TRIGGER stages_archived_guard
BEFORE INSERT OR UPDATE OR DELETE ON stages
FOR EACH ROW EXECUTE FUNCTION guard_archived_learning_plan_structure();--> statement-breakpoint
CREATE TRIGGER learning_plan_item_placements_archived_guard
BEFORE INSERT OR UPDATE OR DELETE ON learning_plan_item_placements
FOR EACH ROW EXECUTE FUNCTION guard_archived_learning_plan_structure();--> statement-breakpoint
CREATE TRIGGER stage_items_archived_guard
BEFORE INSERT OR UPDATE OR DELETE ON stage_items
FOR EACH ROW EXECUTE FUNCTION guard_archived_learning_plan_structure();--> statement-breakpoint
CREATE TRIGGER learning_plan_edges_archived_guard
BEFORE INSERT OR UPDATE OR DELETE ON learning_plan_edges
FOR EACH ROW EXECUTE FUNCTION guard_archived_learning_plan_structure();
