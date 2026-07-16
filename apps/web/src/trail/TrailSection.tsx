import type { Stop, TrailView } from "@unshelf/shared";
import type { CurrentUser } from "../auth";
import { TrailCanvas } from "./TrailCanvas";
import { usePhoneViewport } from "./usePhoneViewport";

interface TrailSectionProps {
  stops: Stop[] | null;
  trail: TrailView | null;
  error: string | null;
  user: CurrentUser;
  onTrailChanged: (trail: TrailView) => void;
}

/**
 * The Trail: arrange the User's Stops into a topology of sequence and forks
 * (ADR-0004, ADR-0010). It reads the same Stops the Stops section lists — the
 * Trail's nodes *are* those Stops — and the edges between them, deriving the
 * layout on the fly. Whether it can be authored is the one thing that changes
 * with the screen: full drag-and-fork on desktop, read-only on the phone (US 40,
 * ADR-0008), decided by `usePhoneViewport`.
 */
export function TrailSection({
  stops,
  trail,
  error,
  user,
  onTrailChanged,
}: TrailSectionProps) {
  const readOnly = usePhoneViewport();

  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1.2rem" }}>Trail</h2>
      {error && (
        <p style={{ color: "crimson" }}>Could not reach your trail: {error}</p>
      )}
      {(!stops || !trail) && !error && <p>Loading your trail…</p>}
      {stops && trail && (
        <TrailCanvas
          stops={stops}
          trail={trail}
          user={user}
          onTrailChanged={onTrailChanged}
          readOnly={readOnly}
        />
      )}
    </section>
  );
}
