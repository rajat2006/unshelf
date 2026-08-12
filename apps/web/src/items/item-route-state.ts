import type { LearningPlanId, StageId } from "@unshelf/shared";
import type { Location } from "react-router";

export type ItemBackgroundLocation = Pick<
  Location,
  "pathname" | "search" | "hash"
>;

export function planItemBackgroundLocation({
  learningPlanId,
  stageId,
}: {
  learningPlanId: LearningPlanId;
  stageId?: StageId;
}): ItemBackgroundLocation {
  return {
    pathname: stageId
      ? `/plans/${learningPlanId}/stages/${stageId}`
      : `/plans/${learningPlanId}`,
    search: "",
    hash: "",
  };
}

export function itemDetailRouteState(
  backgroundLocation: ItemBackgroundLocation,
): { backgroundLocation: ItemBackgroundLocation } {
  return { backgroundLocation };
}

/** Recover the surface kept beneath a canonical Item route, when one exists. */
export function readItemBackgroundLocation(state: unknown): Location | null {
  if (typeof state !== "object" || state === null) return null;
  const candidate = (state as { backgroundLocation?: unknown })
    .backgroundLocation;
  if (typeof candidate !== "object" || candidate === null) return null;
  return typeof (candidate as { pathname?: unknown }).pathname === "string"
    ? (candidate as Location)
    : null;
}
