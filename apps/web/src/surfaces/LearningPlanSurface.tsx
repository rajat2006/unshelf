import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type {
  LearningPlan,
  LearningPlanId,
  LearningPlanView,
  StageLearningPlanNode,
  StageId,
} from "@unshelf/shared";
import { PlanNodeKind } from "@unshelf/shared";
import {
  fetchLearningPlan,
  fetchLearningPlanRecord,
  updateLearningPlan,
} from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { LearningPlanCanvas } from "../learning-plan/LearningPlanCanvas";
import { PlanLibraryDrawer } from "../learning-plan/PlanLibraryDrawer";
import { PlanTodaySidecar } from "../learning-plan/PlanTodaySidecar";
import { usePhoneViewport } from "../learning-plan/usePhoneViewport";
import { StageSidebar } from "../stages/StageSidebar";

/**
 * A single LearningPlan's canvas (design spec §2, #94). The `:learningPlanId` from the URL is
 * the durable, opaque identity; this surface reads only *that* LearningPlan's topology —
 * its Stages as nodes with derived progress and the edges between them — and hands
 * it to the canvas, which derives the layout (never stored, ADR-0010) and, on
 * desktop, authors it: adding the first Stage, extending, forking, rejoining, and
 * removing links, each scoped to this one LearningPlan (ADR-0014).
 *
 * The fetch resolves from the authenticated User, so a foreign or unknown LearningPlan
 * reads back as not found rather than confirming the id. A failure is contained
 * here with a Retry — the signed-in chrome around it stays. Authoring is desktop
 * only; at phone width the canvas is view-only (US 40, ADR-0008). A nested Stage
 * route docks its detail beside this live surface; both reads remain scoped to
 * the Learning Plan named by the URL (#95).
 */
interface LearningPlanSurfaceProps {
  learningPlanId?: LearningPlanId;
  stageId?: StageId;
}

export function LearningPlanSurface({
  learningPlanId: selectedLearningPlanId,
  stageId: selectedStageId,
}: LearningPlanSurfaceProps = {}) {
  const params = useParams();
  const learningPlanId = selectedLearningPlanId ?? params.learningPlanId;
  const stageId = selectedStageId ?? params.stageId;
  const navigate = useNavigate();
  const user = useCurrentUser();
  const phoneReadOnly = usePhoneViewport();
  const [learningPlan, setLearningPlan] = useState<LearningPlanView | null>(
    null,
  );
  const [record, setRecord] = useState<LearningPlan | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = record?.archivedAt != null;
  const readOnly = phoneReadOnly || archived;

  const refresh = useCallback(async () => {
    if (!learningPlanId) return;
    setError(null);
    try {
      const [nextRecord, nextTopology] = await Promise.all([
        fetchLearningPlanRecord(user, learningPlanId as LearningPlanId),
        fetchLearningPlan(user, learningPlanId as LearningPlanId),
      ]);
      setRecord(nextRecord);
      setName(nextRecord.name);
      setLearningPlan(nextTopology);
    } catch (caught: unknown) {
      setError(String(caught));
    }
  }, [user, learningPlanId]);

  useEffect(() => {
    setLearningPlan(null);
    void refresh();
  }, [refresh]);

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!learningPlanId || !trimmed || renaming) return;
    setRenaming(true);
    setError(null);
    try {
      const updated = await updateLearningPlan(
        user,
        learningPlanId as LearningPlanId,
        { name: trimmed },
      );
      setRecord(updated);
      setName(updated.name);
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className={stageId ? "learning-plan-detail-layout" : undefined}>
      <section
        aria-labelledby="learning-plan-heading"
        className="learning-plan-surface"
      >
        <header className="learning-plan-studio-header">
          <div>
            <Link to="/plans" className="learning-plan-studio-header__back">
              ← All Learning Plans
            </Link>
            <p className="editorial-eyebrow">Plan studio</p>
            <h1 id="learning-plan-heading">
              {record?.name ?? "Learning Plan"}
            </h1>
            <p className="quiet-copy">
              {archived
                ? "Archived · read-only"
                : "Arrange the path, draw from the Library, and choose what belongs in Today."}
            </p>
          </div>
          {record && (
            <div className="learning-plan-studio-header__progress">
              <strong>
                {record.total === 0
                  ? "—"
                  : `${Math.round((record.done / record.total) * 100)}%`}
              </strong>
              <span>
                {record.done} of {record.total} Items done
              </span>
              <div aria-hidden="true">
                <span
                  style={{
                    width: `${record.total === 0 ? 0 : (record.done / record.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </header>
        {record && !archived && (
          <form
            className="learning-plan-rename"
            onSubmit={(event) => void rename(event)}
          >
            <label htmlFor="rename-learning-plan">Rename Learning Plan</label>
            <input
              id="rename-learning-plan"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" disabled={!name.trim() || renaming}>
              Rename Learning Plan
            </button>
          </form>
        )}
        {error && (
          <div role="alert">
            <p className="quiet-copy">
              Could not load this Learning Plan: {error}
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="quiet-button"
            >
              Retry
            </button>
          </div>
        )}
        {!learningPlan && !error && (
          <div
            className="learning-plan-skeleton"
            role="status"
            aria-label="Loading Learning Plan canvas"
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </div>
        )}
        {learningPlan &&
          learningPlanId &&
          (readOnly && stageId ? (
            <div
              className="learning-plan-phone-context"
              aria-label="Learning Plan context"
            >
              <span>Open Stage</span>
              <strong>
                {learningPlan.nodes.find(
                  (node): node is StageLearningPlanNode =>
                    node.kind === PlanNodeKind.Stage && node.id === stageId,
                )?.name ?? "Stage details"}
              </strong>
            </div>
          ) : (
            <div
              className={`learning-plan-studio${stageId ? " learning-plan-studio--with-detail" : ""}`}
            >
              {!readOnly && (
                <PlanLibraryDrawer
                  learningPlanId={learningPlanId as LearningPlanId}
                  user={user}
                  onLearningPlanChanged={setLearningPlan}
                />
              )}
              <LearningPlanCanvas
                learningPlanId={learningPlanId as LearningPlanId}
                learningPlan={learningPlan}
                user={user}
                onLearningPlanChanged={setLearningPlan}
                onRefresh={refresh}
                onOpenStage={(selectedStageId) => {
                  void navigate(
                    `/plans/${learningPlanId}/stages/${selectedStageId}`,
                  );
                }}
                readOnly={readOnly}
              />
              {record && (
                <PlanTodaySidecar
                  learningPlan={record}
                  topology={learningPlan}
                  user={user}
                />
              )}
            </div>
          ))}
      </section>
      {stageId && learningPlanId && (
        <StageSidebar
          stageId={stageId as StageId}
          learningPlanId={learningPlanId as LearningPlanId}
          user={user}
          onClose={() => void navigate(`/plans/${learningPlanId}`)}
          onLearningPlanChanged={refresh}
          structuralReadOnly={readOnly}
        />
      )}
    </div>
  );
}
