import type { TrailView } from "@unshelf/shared";
import type { CurrentUser } from "../auth";
import { TrailCanvas } from "./TrailCanvas";
import { usePhoneViewport } from "./usePhoneViewport";

interface TrailSectionProps {
  trail: TrailView | null;
  error: string | null;
  user: CurrentUser;
  onTrailChanged: (trail: TrailView) => void;
  onRefresh: () => Promise<void>;
}

/**
 * The Trail: arrange the User's Stops into a topology of sequence and forks
 * (ADR-0004, ADR-0010), drawn as the Adventure map. Its nodes *are* the User's
 * Stops — read with the edges as one Trail view — and the layout is derived on the
 * fly. Whether it can be authored is the one thing that changes with the screen:
 * full arranging on desktop, read-only on the phone (US 40, ADR-0008), decided by
 * `usePhoneViewport`.
 */
export function TrailSection({
  trail,
  error,
  user,
  onTrailChanged,
  onRefresh,
}: TrailSectionProps) {
  const readOnly = usePhoneViewport();

  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1.2rem" }}>Trail</h2>
      {error && (
        <p style={{ color: "crimson" }}>Could not reach your trail: {error}</p>
      )}
      {!trail && !error && <p>Loading your trail…</p>}
      {trail && (
        <TrailCanvas
          trail={trail}
          user={user}
          onTrailChanged={onTrailChanged}
          onRefresh={onRefresh}
          readOnly={readOnly}
        />
      )}
    </section>
  );
}
