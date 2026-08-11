import { z } from "zod";
import type {
  ItemId,
  LabelId,
  LearningPlanId,
  PlanNodeId,
  StageId,
  UserId,
} from "./index";
import { Status, Type } from "./index";

/** A User-chosen record name, normalized only at its outer boundaries. */
export const nameSchema = z.string().trim().min(1);

/** An Item's identity, normalized only at its outer boundaries. */
export const titleSchema = z.string().trim().min(1);

const identifierSchema = <Identifier extends string>() =>
  z.uuid().transform((value): Identifier => value as Identifier);

export const userIdSchema = identifierSchema<UserId>();
export const itemIdSchema = identifierSchema<ItemId>();
export const stageIdSchema = identifierSchema<StageId>();
export const learningPlanIdSchema = identifierSchema<LearningPlanId>();
export const planNodeIdSchema = identifierSchema<PlanNodeId>();
export const labelIdSchema = identifierSchema<LabelId>();

export const createItemRequestSchema = z.strictObject({
  title: titleSchema,
  type: z.enum(Type),
  source: z.string().nullable().optional(),
});

export const updateItemStatusRequestSchema = z.strictObject({
  status: z.enum(Status),
});

/** A real proleptic-Gregorian calendar date accepted by the API and Postgres. */
export const targetDateSchema = z.iso
  .date()
  .refine((value) => !value.startsWith("0000-"));

export const updateItemTargetDateRequestSchema = z.strictObject({
  targetDate: targetDateSchema.nullable(),
});

export const createLabelRequestSchema = z.strictObject({ name: nameSchema });

export const createStageRequestSchema = z.strictObject({ name: nameSchema });

export const updateStageRequestSchema = createStageRequestSchema;

export const createLearningPlanRequestSchema = z.strictObject({
  name: nameSchema,
});

export const updateLearningPlanRequestSchema = createLearningPlanRequestSchema;

export const addStageItemRequestSchema = z.strictObject({
  itemId: itemIdSchema,
});

export const stageItemSearchQuerySchema = z.strictObject({
  query: z.string().optional(),
});

export const createStageWithItemRequestSchema = z.strictObject({
  learningPlanId: learningPlanIdSchema,
  name: nameSchema,
});

export const connectLearningPlanNodesRequestSchema = z.strictObject({
  fromNodeId: planNodeIdSchema,
  toNodeId: planNodeIdSchema,
});

export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;
export type UpdateItemStatusRequest = z.infer<
  typeof updateItemStatusRequestSchema
>;
export type UpdateItemTargetDateRequest = z.infer<
  typeof updateItemTargetDateRequestSchema
>;
export type CreateLabelRequest = z.infer<typeof createLabelRequestSchema>;
export type CreateStageRequest = z.infer<typeof createStageRequestSchema>;
export type UpdateStageRequest = z.infer<typeof updateStageRequestSchema>;
export type CreateLearningPlanRequest = z.infer<
  typeof createLearningPlanRequestSchema
>;
export type UpdateLearningPlanRequest = z.infer<
  typeof updateLearningPlanRequestSchema
>;
export type AddStageItemRequest = z.infer<typeof addStageItemRequestSchema>;
export type StageItemSearchQuery = z.infer<typeof stageItemSearchQuerySchema>;
export type CreateStageWithItemRequest = z.infer<
  typeof createStageWithItemRequestSchema
>;
export type ConnectLearningPlanNodesRequest = z.infer<
  typeof connectLearningPlanNodesRequestSchema
>;
