import type {
  ConnectLearningPlanNodesRequest,
  CreateLearningPlanRequest,
  CreateStageRequest,
  ItemId,
  LearningPlanId,
  MoveLearningPlanItemRequest,
  StageId,
  UpdateLearningPlanRequest,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import * as topologyRepository from "../learning-plan/repository";
import * as itemPlacementsRepository from "./item-placements-repository";
import * as stagesRepository from "../stages/repository";
import * as learningPlansRepository from "./repository";
import { moveLearningPlanItem } from "../placements/service";

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

interface OwnedItemInput extends OwnedLearningPlanInput {
  itemId: ItemId;
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

export const placeDirectItem = ({
  db,
  userId,
  learningPlanId,
  itemId,
}: OwnedItemInput) =>
  itemPlacementsRepository.placeDirectItem({
    db,
    userId,
    learningPlanId,
    itemId,
  });

export const searchItemCandidates = ({
  db,
  userId,
  learningPlanId,
  query,
}: OwnedLearningPlanInput & { query: string }) =>
  itemPlacementsRepository.searchItemCandidates({
    db,
    userId,
    learningPlanId,
    query,
  });

export const removeDirectItem = ({
  db,
  userId,
  learningPlanId,
  itemId,
}: OwnedItemInput) =>
  itemPlacementsRepository.removeDirectItem({
    db,
    userId,
    learningPlanId,
    itemId,
  });

export const moveItem = ({
  db,
  userId,
  learningPlanId,
  itemId,
  request,
}: OwnedItemInput & { request: MoveLearningPlanItemRequest }) =>
  moveLearningPlanItem(db, {
    userId,
    learningPlanId,
    itemId,
    stageId: request.stageId,
  });

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
