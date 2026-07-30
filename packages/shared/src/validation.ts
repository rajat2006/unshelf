import { z } from "zod";
import type { ItemId, LabelId, StopId, TrailId, UserId } from "./index";
import { Status, Type } from "./index";

/** A User-chosen record name, normalized only at its outer boundaries. */
export const nameSchema = z.string().trim().min(1);

/** An Item's identity, normalized only at its outer boundaries. */
export const titleSchema = z.string().trim().min(1);

const identifierSchema = <Identifier extends string>() =>
  z.uuid().transform((value): Identifier => value as Identifier);

export const userIdSchema = identifierSchema<UserId>();
export const itemIdSchema = identifierSchema<ItemId>();
export const stopIdSchema = identifierSchema<StopId>();
export const trailIdSchema = identifierSchema<TrailId>();
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

export const createStopRequestSchema = z.strictObject({ name: nameSchema });

export const createTrailRequestSchema = z.strictObject({ name: nameSchema });

export const addStopItemRequestSchema = z.strictObject({
  itemId: itemIdSchema,
});

export const createStopWithItemRequestSchema = z.strictObject({
  trailId: trailIdSchema,
  name: nameSchema,
});

export const connectStopsRequestSchema = z.strictObject({
  fromStopId: stopIdSchema,
  toStopId: stopIdSchema,
});

export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;
export type UpdateItemStatusRequest = z.infer<
  typeof updateItemStatusRequestSchema
>;
export type UpdateItemTargetDateRequest = z.infer<
  typeof updateItemTargetDateRequestSchema
>;
export type CreateLabelRequest = z.infer<typeof createLabelRequestSchema>;
export type CreateStopRequest = z.infer<typeof createStopRequestSchema>;
export type CreateTrailRequest = z.infer<typeof createTrailRequestSchema>;
export type AddStopItemRequest = z.infer<typeof addStopItemRequestSchema>;
export type CreateStopWithItemRequest = z.infer<
  typeof createStopWithItemRequestSchema
>;
export type ConnectStopsRequest = z.infer<typeof connectStopsRequestSchema>;
