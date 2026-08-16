import type { LearningPlanId, StageId } from "@unshelf/shared";
import type { Location } from "react-router";

export type ItemBackgroundLocation = Pick<
  Location,
  "pathname" | "search" | "hash"
>;

export type ItemBackgroundSurface =
  | { kind: "library" }
  | { kind: "today" }
  | { kind: "history"; date: string }
  | { kind: "discover" }
  | { kind: "plan"; learningPlanId: LearningPlanId }
  | { kind: "unknown" };

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
export function readItemBackgroundLocation(
  state: unknown,
): ItemBackgroundLocation | null {
  if (typeof state !== "object" || state === null) return null;
  const candidate = (state as { backgroundLocation?: unknown })
    .backgroundLocation;
  if (typeof candidate !== "object" || candidate === null) return null;
  return typeof (candidate as { pathname?: unknown }).pathname === "string"
    ? (candidate as ItemBackgroundLocation)
    : null;
}

/** Resolve the surface an Item link should retain beneath canonical detail. */
export function itemLinkBackgroundLocation(
  location: Pick<Location, "pathname" | "search" | "hash" | "state">,
  explicitBackground?: ItemBackgroundLocation,
): ItemBackgroundLocation {
  if (explicitBackground) return explicitBackground;
  if (!location.pathname.startsWith("/items/")) return location;

  return (
    readItemBackgroundLocation(location.state) ?? {
      pathname: "/library",
      search: "",
      hash: "",
    }
  );
}

/** Classify the room retained beneath canonical Item detail in one place. */
export function itemBackgroundSurface(
  backgroundLocation: ItemBackgroundLocation | null,
): ItemBackgroundSurface {
  if (!backgroundLocation) return { kind: "unknown" };
  if (backgroundLocation.pathname === "/library") return { kind: "library" };
  if (backgroundLocation.pathname === "/today") return { kind: "today" };
  if (backgroundLocation.pathname === "/discover") {
    return { kind: "discover" };
  }
  const history = /^\/today\/(\d{4}-\d{2}-\d{2})$/.exec(
    backgroundLocation.pathname,
  );
  if (history) return { kind: "history", date: history[1] };
  const plan = /^\/plans\/([^/]+)(?:\/stages\/[^/]+)?$/.exec(
    backgroundLocation.pathname,
  );
  return plan
    ? { kind: "plan", learningPlanId: plan[1] as LearningPlanId }
    : { kind: "unknown" };
}
