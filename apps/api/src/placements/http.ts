import type { Response } from "express";

interface PlacementFailure {
  ok: false;
  error: "not_found" | "conflict";
}

interface RespondToPlacementFailureInput {
  response: Response;
  failure: PlacementFailure;
  notFoundMessage: string;
}

/** Keep the placement service's two domain failures consistent at HTTP seams. */
export function respondToPlacementFailure({
  response,
  failure,
  notFoundMessage,
}: RespondToPlacementFailureInput): void {
  switch (failure.error) {
    case "not_found":
      response.status(404).json({ error: notFoundMessage });
      return;
    case "conflict":
      response.status(409).json({
        error: "item already placed on this learning plan",
      });
  }
}
