import { z } from "zod";
import type {
  DailyFocusId,
  ItemId,
  LabelId,
  LearningPlanId,
  PlanNodeId,
  PartId,
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
export const partIdSchema = identifierSchema<PartId>();
export const stageIdSchema = identifierSchema<StageId>();
export const learningPlanIdSchema = identifierSchema<LearningPlanId>();
export const planNodeIdSchema = identifierSchema<PlanNodeId>();
export const labelIdSchema = identifierSchema<LabelId>();
export const dailyFocusIdSchema = identifierSchema<DailyFocusId>();

export const createItemRequestSchema = z.strictObject({
  title: titleSchema,
  type: z.enum(Type),
  source: z.string().nullable().optional(),
});

export const sourceInspectionRequestSchema = z.strictObject({
  source: z.string(),
});

export const updateItemStatusRequestSchema = z.strictObject({
  status: z.enum(Status),
});

/** A real proleptic-Gregorian calendar date accepted by the API and Postgres. */
export const targetDateSchema = z.iso
  .date()
  .refine((value) => !value.startsWith("0000-"));

/** A dated Daily Focus path uses the same real calendar-date contract. */
export const dailyFocusDateSchema = targetDateSchema;

export const updateItemTargetDateRequestSchema = z.strictObject({
  targetDate: targetDateSchema.nullable(),
});

export const addDailyFocusItemRequestSchema = z.strictObject({
  itemId: itemIdSchema,
  origin: z
    .strictObject({
      learningPlanId: learningPlanIdSchema,
      stageId: stageIdSchema.optional(),
    })
    .optional(),
});

export const dailyPlanningQuerySchema = z.strictObject({
  query: z.string().trim().optional(),
});

export const suppressDailyPlanningItemRequestSchema = z.strictObject({
  itemId: itemIdSchema,
});

export const createPartsRequestSchema = z.strictObject({
  titles: z
    .array(z.string())
    .transform((titles) => titles.map((title) => title.trim()).filter(Boolean))
    .refine((titles) => titles.length > 0, {
      message: "Must contain at least one nonblank title",
    }),
});

export const updatePartRequestSchema = z.strictObject({ title: titleSchema });

export const updatePartCompletionRequestSchema = z.strictObject({
  completed: z.boolean(),
});

export const reorderPartsRequestSchema = z.strictObject({
  partIds: z
    .array(partIdSchema)
    .refine((partIds) => new Set(partIds).size === partIds.length, {
      message: "Part ids must be unique",
    }),
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

export const reorderStageItemsRequestSchema = z.strictObject({
  itemIds: z
    .array(itemIdSchema)
    .refine((itemIds) => new Set(itemIds).size === itemIds.length, {
      message: "Item ids must be unique",
    }),
});

export const removeStageRequestSchema = z.strictObject({
  itemDisposition: z.enum(["place_directly", "remove_from_plan"]),
});

export const placeLearningPlanItemRequestSchema = addStageItemRequestSchema;

export const moveLearningPlanItemRequestSchema = z.strictObject({
  stageId: stageIdSchema.nullable(),
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
export type SourceInspectionRequest = z.infer<
  typeof sourceInspectionRequestSchema
>;
export type UpdateItemStatusRequest = z.infer<
  typeof updateItemStatusRequestSchema
>;
export type UpdateItemTargetDateRequest = z.infer<
  typeof updateItemTargetDateRequestSchema
>;
export type AddDailyFocusItemRequest = z.infer<
  typeof addDailyFocusItemRequestSchema
>;
export type DailyPlanningQuery = z.infer<typeof dailyPlanningQuerySchema>;
export type SuppressDailyPlanningItemRequest = z.infer<
  typeof suppressDailyPlanningItemRequestSchema
>;
export type CreatePartsRequest = z.infer<typeof createPartsRequestSchema>;
export type UpdatePartRequest = z.infer<typeof updatePartRequestSchema>;
export type UpdatePartCompletionRequest = z.infer<
  typeof updatePartCompletionRequestSchema
>;
export type ReorderPartsRequest = z.infer<typeof reorderPartsRequestSchema>;
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
export type ReorderStageItemsRequest = z.infer<
  typeof reorderStageItemsRequestSchema
>;
export type RemoveStageRequest = z.infer<typeof removeStageRequestSchema>;
export type StageItemDisposition = RemoveStageRequest["itemDisposition"];
export type PlaceLearningPlanItemRequest = z.infer<
  typeof placeLearningPlanItemRequestSchema
>;
export type MoveLearningPlanItemRequest = z.infer<
  typeof moveLearningPlanItemRequestSchema
>;
export type StageItemSearchQuery = z.infer<typeof stageItemSearchQuerySchema>;
export type CreateStageWithItemRequest = z.infer<
  typeof createStageWithItemRequestSchema
>;
export type ConnectLearningPlanNodesRequest = z.infer<
  typeof connectLearningPlanNodesRequestSchema
>;
