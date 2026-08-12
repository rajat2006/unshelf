import { Link, NavLink, useLocation } from "react-router";
import { UserButton } from "../application-auth/UserButton";
import {
  itemBackgroundSurface,
  readItemBackgroundLocation,
} from "../items/item-route-state";
import { useCapture } from "./useCapture";
import { Wordmark } from "./Wordmark";

/**
 * The four-room top bar, present on every signed-in surface. Left: the Unshelf
 * mark (= Today / home) and the Today, deferred Discover, Library, and Plans
 * rooms. Right: the global Capture action and the account control.
 * Capture opens a non-navigating overlay, so intake is available from every
 * surface without moving the User off the one they are on.
 *
 * The active destination is marked with `aria-current="page"` (NavLink), so the
 * current axis is apparent to sighted and assistive-technology Users alike.
 */

export function TopBar() {
  const { open } = useCapture();
  const location = useLocation();
  const backgroundLocation = location.pathname.startsWith("/items/")
    ? readItemBackgroundLocation(location.state)
    : null;
  const backgroundSurface = itemBackgroundSurface(backgroundLocation);
  const libraryActive =
    location.pathname === "/library" ||
    (location.pathname.startsWith("/items/") &&
      (backgroundSurface.kind === "library" ||
        backgroundSurface.kind === "unknown"));
  const plansActive =
    location.pathname.startsWith("/plans") || backgroundSurface.kind === "plan";
  const todayActive =
    location.pathname.startsWith("/today") ||
    backgroundSurface.kind === "today" ||
    backgroundSurface.kind === "history";

  return (
    <header className="top-bar">
      <NavLink
        to="/today"
        aria-label="Unshelf — go to Today"
        className="top-bar__home"
        end
      >
        <Wordmark />
      </NavLink>
      <nav aria-label="Primary" className="top-bar__nav">
        <RoomLink to="/today" label="Today" active={todayActive} />
        <button
          type="button"
          className="top-bar__door top-bar__door--deferred"
          aria-label="Discover — Coming later"
          disabled
        >
          <span>Discover</span>
          <small>Coming later</small>
        </button>
        <RoomLink to="/library" label="Library" active={libraryActive} />
        <RoomLink to="/plans" label="Plans" active={plansActive} />
      </nav>
      <div className="top-bar__actions">
        <button type="button" onClick={open} className="top-bar__capture">
          Capture
        </button>
        <UserButton />
      </div>
    </header>
  );
}

function RoomLink({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`top-bar__door${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}
