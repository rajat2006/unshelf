import { z } from "zod";
import type {
  DailyFocusId,
  DiscoveryId,
  FollowId,
  FollowPreviewId,
  IdempotencyKey,
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
export const followPreviewIdSchema = identifierSchema<FollowPreviewId>();
export const followIdSchema = identifierSchema<FollowId>();
export const discoveryIdSchema = identifierSchema<DiscoveryId>();

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

/** The only Follow target admitted by the first Discover slice. */
export const prepareFollowRequestSchema = z.strictObject({
  provider: z.literal("youtube"),
  target: z.strictObject({
    kind: z.literal("channel"),
    url: z.url(),
  }),
});

/** Consume only the opaque preview receipt issued by Unshelf. */
export const confirmFollowRequestSchema = z.strictObject({
  previewId: followPreviewIdSchema,
});

/** Acquisition scope is explicit so a Follow id cannot leak into workspace refresh. */
export const acquireAndApplyRequestSchema = z.discriminatedUnion("trigger", [
  z.strictObject({
    trigger: z.literal("manual_follow"),
    followId: followIdSchema,
  }),
  z.strictObject({ trigger: z.literal("manual_workspace") }),
]);

/** Follow lifecycle remains independent from acquisition health. */
export const setFollowLifecycleRequestSchema = z.strictObject({
  lifecycle: z.enum(["active", "paused", "removed"]),
});

/** Decide one exact, non-empty set of unresolved Discovery occurrences. */
export const decideDiscoveriesRequestSchema = z.strictObject({
  discoveryIds: z
    .array(discoveryIdSchema)
    .min(1)
    .refine(
      (discoveryIds) => new Set(discoveryIds).size === discoveryIds.length,
      {
        message: "Discovery ids must be unique",
      },
    ),
  decision: z.enum(["seen", "dismissed"]),
});

/** History paging is server-bounded; the client may return only an opaque cursor. */
export const discoverHistoryQuerySchema = z.strictObject({
  cursor: z.string().min(1).optional(),
});

/** Mutation replays are scoped by a client-generated UUID. */
export const idempotencyKeySchema = identifierSchema<IdempotencyKey>();

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
export type PrepareFollowRequest = z.infer<typeof prepareFollowRequestSchema>;
export type ConfirmFollowRequest = z.infer<typeof confirmFollowRequestSchema>;
export type AcquireAndApplyRequest = z.infer<
  typeof acquireAndApplyRequestSchema
>;
export type SetFollowLifecycleRequest = z.infer<
  typeof setFollowLifecycleRequestSchema
>;
export type DecideDiscoveriesRequest = z.infer<
  typeof decideDiscoveriesRequestSchema
>;
export type DiscoverHistoryQuery = z.infer<typeof discoverHistoryQuerySchema>;
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
