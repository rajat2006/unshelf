import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import type { TrailId, TrailView } from "@unshelf/shared";
import { fetchTrail } from "../api";
import { useCurrentUser } from "../application-auth";
import { TrailCanvas } from "../trail/TrailCanvas";
import { usePhoneViewport } from "../trail/usePhoneViewport";

/**
 * A single Trail's canvas (design spec §2, #94). The `:trailId` from the URL is
 * the durable, opaque identity; this surface reads only *that* Trail's topology —
 * its Stops as nodes with derived progress and the edges between them — and hands
 * it to the canvas, which derives the layout (never stored, ADR-0010) and, on
 * desktop, authors it: adding the first Stop, extending, forking, rejoining, and
 * removing links, each scoped to this one Trail (ADR-0014).
 *
 * The fetch resolves from the authenticated User, so a foreign or unknown Trail
 * reads back as not found rather than confirming the id. A failure is contained
 * here with a Retry — the signed-in chrome around it stays. Authoring is desktop
 * only; at phone width the canvas is view-only (US 40, ADR-0008). Opening a Stop
 * in a sidebar (`/stops/:stopId`) is a later slice (#95); the id is carried in the
 * URL but not yet acted on.
 */
export function TrailSurface() {
  const { trailId } = useParams();
  const user = useCurrentUser();
  const readOnly = usePhoneViewport();
  const [trail, setTrail] = useState<TrailView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!trailId) return;
    setError(null);
    try {
      setTrail(await fetchTrail(user, trailId as TrailId));
    } catch (caught: unknown) {
      setError(String(caught));
    }
  }, [user, trailId]);

  useEffect(() => {
    setTrail(null);
    void refresh();
  }, [refresh]);

  return (
    <section aria-labelledby="trail-heading">
      <h1 id="trail-heading">Trail</h1>
      {error && (
        <div role="alert">
          <p style={{ color: "var(--muted)" }}>
            Could not load this Trail: {error}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            style={{ minHeight: "44px", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      )}
      {!trail && !error && (
        <p style={{ color: "var(--muted)" }}>Loading this Trail…</p>
      )}
      {trail && trailId && (
        <TrailCanvas
          trailId={trailId as TrailId}
          trail={trail}
          user={user}
          onTrailChanged={setTrail}
          onRefresh={refresh}
          readOnly={readOnly}
        />
      )}
    </section>
  );
}
