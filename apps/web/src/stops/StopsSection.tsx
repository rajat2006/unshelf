import { useState } from "react";
import type { Item, Stop, StopDetail, StopId } from "@unshelf/shared";
import { fetchStop } from "../api";
import type { CurrentUser } from "../application-auth";
import { StopView } from "./StopView";

interface StopsSectionProps {
  stops: Stop[] | null;
  openStop: StopDetail | null;
  error: string | null;
  user: CurrentUser;
  onStopOpened: (stop: StopDetail | null) => void;
  onStopChanged: (stop: StopDetail) => void;
  onItemChanged: (item: Item) => void;
}

/**
 * Stops: create them, list them, open one to see what is in it.
 *
 * The list and the open Stop are one section rather than two screens, because
 * v1's whole organising surface is "your Stops, and the one you are looking at".
 * Opening a Stop replaces the list in place, so the phone gets the same flow as
 * the desktop with nothing extra to reflow (ADR-0008).
 *
 * Stops are *created* on a Trail now (ADR-0014, #94), not here — this transitional
 * Library view only lists the User's Stops and opens one; sequencing and authoring
 * live on the Trail canvas.
 */
export function StopsSection({
  stops,
  openStop,
  error,
  user,
  onStopOpened,
  onStopChanged,
  onItemChanged,
}: StopsSectionProps) {
  const [opening, setOpening] = useState<StopId | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  async function open(stopId: StopId) {
    setOpening(stopId);
    setOpenError(null);
    try {
      onStopOpened(await fetchStop(user, stopId));
    } catch (caught: unknown) {
      setOpenError(String(caught));
    } finally {
      setOpening(null);
    }
  }

  return (
    <section className="stops-section">
      <h2>Stops</h2>
      {error && (
        <p className="surface-error">Could not reach your stops: {error}</p>
      )}

      {openStop ? (
        <StopView
          stop={openStop}
          user={user}
          onStopChanged={onStopChanged}
          onItemChanged={onItemChanged}
          onClose={() => onStopOpened(null)}
        />
      ) : (
        <>
          {!stops && !error && <p>Loading your stops…</p>}
          {stops && stops.length === 0 && (
            <p className="quiet-copy">
              No stops yet — open a Trail to add stops and arrange them.
            </p>
          )}
          {stops && stops.length > 0 && (
            <ul className="stops-list">
              {stops.map((stop) => (
                <li key={stop.id}>
                  <button
                    type="button"
                    disabled={opening !== null}
                    onClick={() => void open(stop.id)}
                    className="stops-list__button"
                  >
                    {stop.name}
                    {opening === stop.id && (
                      <span className="quiet-copy"> — opening…</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {openError && (
            <div role="alert" className="surface-error">
              Could not open the stop: {openError}
            </div>
          )}
        </>
      )}
    </section>
  );
}
