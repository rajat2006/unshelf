import { z } from "zod";
import type {
  AddStopItemRequest,
  ConnectStopsRequest,
  CreateItemRequest,
  CreateLabelRequest,
  CreateStopRequest,
  CreateTrailRequest,
  ItemId,
  LabelId,
  StopId,
  TrailId,
  UpdateItemStatusRequest,
  UpdateItemTargetDateRequest,
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
export const stopIdSchema = identifierSchema<StopId>();
export const trailIdSchema = identifierSchema<TrailId>();
export const labelIdSchema = identifierSchema<LabelId>();

export const createItemRequestSchema = z.strictObject({
  title: titleSchema,
  type: z.enum(Type),
  source: z.string().nullable().optional(),
}) satisfies z.ZodType<CreateItemRequest>;

export const updateItemStatusRequestSchema = z.strictObject({
  status: z.enum(Status),
}) satisfies z.ZodType<UpdateItemStatusRequest>;

/** A real proleptic-Gregorian calendar date accepted by the API and Postgres. */
export const targetDateSchema = z.iso
  .date()
  .refine((value) => !value.startsWith("0000-"));

export const updateItemTargetDateRequestSchema = z.strictObject({
  targetDate: targetDateSchema.nullable(),
}) satisfies z.ZodType<UpdateItemTargetDateRequest>;

export const createLabelRequestSchema =
  z.strictObject({ name: nameSchema }) satisfies z.ZodType<CreateLabelRequest>;

export const createStopRequestSchema =
  z.strictObject({ name: nameSchema }) satisfies z.ZodType<CreateStopRequest>;

export const createTrailRequestSchema =
  z.strictObject({ name: nameSchema }) satisfies z.ZodType<CreateTrailRequest>;

export const addStopItemRequestSchema = z.strictObject({
  itemId: itemIdSchema,
}) satisfies z.ZodType<AddStopItemRequest>;

export const connectStopsRequestSchema = z.strictObject({
  fromStopId: stopIdSchema,
  toStopId: stopIdSchema,
}) satisfies z.ZodType<ConnectStopsRequest>;
