import type {
  CreatePartsRequest,
  ItemId,
  PartId,
  ReorderPartsRequest,
  UpdatePartCompletionRequest,
  UpdatePartRequest,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import * as partsRepository from "./repository";

export const createParts = (input: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
  request: CreatePartsRequest;
}) => partsRepository.createParts(input.db, input);

export const updatePartCompletion = (input: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
  partId: PartId;
  request: UpdatePartCompletionRequest;
}) => partsRepository.updatePartCompletion(input.db, input);

export const updatePart = (input: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
  partId: PartId;
  request: UpdatePartRequest;
}) => partsRepository.updatePart(input.db, input);

export const removePart = (input: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
  partId: PartId;
}) => partsRepository.removePart(input.db, input);

export async function reorderParts(input: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
  request: ReorderPartsRequest;
}) {
  const outcome = await partsRepository.reorderParts(input.db, input);
  if (outcome !== "ok") return { ok: false as const, error: outcome };
  const item = await partsRepository.getStructuredItem(input.db, input);
  return item
    ? { ok: true as const, item }
    : { ok: false as const, error: "not_found" as const };
}
