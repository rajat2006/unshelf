import { useState } from "react";
import type { Item, Stop, StopDetail, StopId } from "@unshelf/shared";
import { fetchStop } from "../api";
import type { CurrentUser } from "../auth";
import { AddStopForm } from "./AddStopForm";
import { StopView } from "./StopView";

interface StopsSectionProps {
  stops: Stop[] | null;
  openStop: StopDetail | null;
  error: string | null;
  user: CurrentUser;
  onStopsChanged: () => Promise<void>;
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
 */
export function StopsSection({
  stops,
  openStop,
  error,
  user,
  onStopsChanged,
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
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1.2rem" }}>Stops</h2>
      {error && (
        <p style={{ color: "crimson" }}>Could not reach your stops: {error}</p>
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
          <AddStopForm user={user} onCreated={onStopsChanged} />
          {!stops && !error && <p>Loading your stops…</p>}
          {stops && stops.length === 0 && (
            <p style={{ opacity: 0.7 }}>
              No stops yet — name one above to start grouping your items.
            </p>
          )}
          {stops && stops.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}>
              {stops.map((stop) => (
                <li
                  key={stop.id}
                  style={{ borderTop: "1px solid rgba(0,0,0,0.1)" }}
                >
                  <button
                    type="button"
                    disabled={opening !== null}
                    onClick={() => void open(stop.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      font: "inherit",
                      fontWeight: 600,
                      padding: "0.75rem 0",
                      minHeight: "44px",
                      cursor: opening ? "wait" : "pointer",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {stop.name}
                    {opening === stop.id && (
                      <span style={{ fontWeight: 400, opacity: 0.7 }}>
                        {" "}
                        — opening…
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {openError && (
            <div role="alert" style={{ color: "crimson", fontSize: "0.85rem" }}>
              Could not open the stop: {openError}
            </div>
          )}
        </>
      )}
    </section>
  );
}
