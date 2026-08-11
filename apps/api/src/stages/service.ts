import type {
  AddStageItemRequest,
  ItemId,
  ReorderStageItemsRequest,
  RemoveStageRequest,
  StageId,
  UpdateStageRequest,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import {
  placeItemInStage,
  reorderStageItems,
  removeStageWithDisposition,
  removeItemFromStage,
  searchStageItemCandidates,
} from "../placements/service";
import * as stagesRepository from "./repository";

interface OwnedStagesInput {
  db: Database;
  userId: UserId;
}

interface OwnedStageInput extends OwnedStagesInput {
  stageId: StageId;
}

export const listStages = ({ db, userId }: OwnedStagesInput) =>
  stagesRepository.listStages(db, userId);

export const getStage = ({ db, userId, stageId }: OwnedStageInput) =>
  stagesRepository.getStage(db, userId, stageId);

export const updateStage = ({
  db,
  userId,
  stageId,
  request,
}: OwnedStageInput & { request: UpdateStageRequest }) =>
  stagesRepository.updateStage(db, userId, stageId, request);

export const addItem = ({
  db,
  userId,
  stageId,
  request,
}: OwnedStageInput & { request: AddStageItemRequest }) =>
  placeItemInStage(db, { userId, stageId, itemId: request.itemId });

export const searchItemCandidates = ({
  db,
  userId,
  stageId,
  query,
}: OwnedStageInput & { query: string }) =>
  searchStageItemCandidates(db, { userId, stageId, query });

export const reorderItems = ({
  db,
  userId,
  stageId,
  request,
}: OwnedStageInput & { request: ReorderStageItemsRequest }) =>
  reorderStageItems(db, { userId, stageId, itemIds: request.itemIds });

export const removeStage = ({
  db,
  userId,
  stageId,
  request,
}: OwnedStageInput & { request: RemoveStageRequest }) =>
  removeStageWithDisposition(db, {
    userId,
    stageId,
    itemDisposition: request.itemDisposition,
  });

export const removeItem = ({
  db,
  userId,
  stageId,
  itemId,
}: OwnedStageInput & { itemId: ItemId }) =>
  removeItemFromStage(db, { userId, stageId, itemId });
