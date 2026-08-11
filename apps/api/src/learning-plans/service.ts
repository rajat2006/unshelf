import type {
  ConnectLearningPlanNodesRequest,
  CreateLearningPlanRequest,
  CreateStageRequest,
  LearningPlanId,
  StageId,
  UpdateLearningPlanRequest,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import * as topologyRepository from "../learning-plan/repository";
import * as stagesRepository from "../stages/repository";
import * as learningPlansRepository from "./repository";

interface OwnedLearningPlansInput {
  db: Database;
  userId: UserId;
}

interface OwnedLearningPlanInput extends OwnedLearningPlansInput {
  learningPlanId: LearningPlanId;
}

interface OwnedStageInput extends OwnedLearningPlanInput {
  stageId: StageId;
}

export const listLearningPlans = ({ db, userId }: OwnedLearningPlansInput) =>
  learningPlansRepository.listLearningPlans(db, userId);

export const getLearningPlan = ({
  db,
  userId,
  learningPlanId,
}: OwnedLearningPlanInput) =>
  learningPlansRepository.getLearningPlan(db, userId, learningPlanId);

export const createLearningPlan = ({
  db,
  userId,
  request,
}: OwnedLearningPlansInput & { request: CreateLearningPlanRequest }) =>
  learningPlansRepository.createLearningPlan(db, userId, request);

export const updateLearningPlan = ({
  db,
  userId,
  learningPlanId,
  request,
}: OwnedLearningPlanInput & { request: UpdateLearningPlanRequest }) =>
  learningPlansRepository.updateLearningPlan(
    db,
    userId,
    learningPlanId,
    request,
  );

export const createStage = ({
  db,
  userId,
  learningPlanId,
  request,
}: OwnedLearningPlanInput & { request: CreateStageRequest }) =>
  stagesRepository.createStage(db, userId, learningPlanId, request);

export const getStage = ({
  db,
  userId,
  learningPlanId,
  stageId,
}: OwnedStageInput) =>
  stagesRepository.getStageOnLearningPlan(db, userId, learningPlanId, stageId);

export const getTopology = ({
  db,
  userId,
  learningPlanId,
}: OwnedLearningPlanInput) =>
  topologyRepository.getLearningPlan(db, userId, learningPlanId);

export type ConnectLearningPlanResult =
  | {
      ok: true;
      learningPlan: NonNullable<Awaited<ReturnType<typeof getTopology>>>;
    }
  | { ok: false; error: "self_edge" | "not_found" | "cycle" };

export const connectNodes = async ({
  db,
  userId,
  learningPlanId,
  endpoints,
}: OwnedLearningPlanInput & {
  endpoints: ConnectLearningPlanNodesRequest;
}): Promise<ConnectLearningPlanResult> => {
  if (endpoints.fromNodeId === endpoints.toNodeId) {
    return { ok: false, error: "self_edge" };
  }
  const result = await topologyRepository.connectLearningPlanNodes(
    db,
    userId,
    learningPlanId,
    endpoints,
  );
  return result.kind === "ok"
    ? { ok: true, learningPlan: result.learningPlan }
    : { ok: false, error: result.kind };
};

export const disconnectNodes = ({
  db,
  userId,
  learningPlanId,
  endpoints,
}: OwnedLearningPlanInput & {
  endpoints: ConnectLearningPlanNodesRequest;
}) =>
  topologyRepository.disconnectLearningPlanNodes(
    db,
    userId,
    learningPlanId,
    endpoints,
  );
