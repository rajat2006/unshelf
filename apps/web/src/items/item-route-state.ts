import type { Location } from "react-router";

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
