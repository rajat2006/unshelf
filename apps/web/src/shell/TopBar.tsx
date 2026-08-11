import { Link, NavLink, useLocation } from "react-router";
import { UserButton } from "../application-auth/UserButton";
import { useCapture } from "./useCapture";
import { Wordmark } from "./Wordmark";

/**
 * The slim two-door top bar (design spec §3), present on every signed-in surface.
 * Left: the Unshelf mark (= Learning Plans / home) and the two named doors, Learning Plans and
 * Library — the two organising axes, named so neither reads as filtering the
 * other. Right: the global Capture action and the account control (ADR-0014).
 * Capture opens a non-navigating overlay, so intake is available from every
 * surface without moving the User off the one they are on.
 *
 * The active destination is marked with `aria-current="page"` (NavLink), so the
 * current axis is apparent to sighted and assistive-technology Users alike.
 */

export function TopBar() {
  const { open } = useCapture();
  const location = useLocation();
  const libraryActive =
    location.pathname === "/library" || location.pathname.startsWith("/items/");
  const plansActive = location.pathname.startsWith("/plans");

  return (
    <header className="top-bar">
      <NavLink
        to="/plans"
        aria-label="Unshelf — go to Learning Plans"
        className="top-bar__home"
        end
      >
        <Wordmark />
      </NavLink>
      <nav aria-label="Primary" className="top-bar__nav">
        <Link
          to="/plans"
          className={`top-bar__door${plansActive ? " active" : ""}`}
          aria-current={plansActive ? "page" : undefined}
        >
          Learning Plans
        </Link>
        <Link
          to="/library"
          className={`top-bar__door${libraryActive ? " active" : ""}`}
          aria-current={libraryActive ? "page" : undefined}
        >
          Library
        </Link>
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
