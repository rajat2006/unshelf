import { Link, NavLink, useLocation } from "react-router";
import { UserButton } from "../application-auth";
import { useCapture } from "./CaptureController";
import { Wordmark } from "./Wordmark";

/**
 * The slim two-door top bar (design spec §3), present on every signed-in surface.
 * Left: the Unshelf mark (= Trails / home) and the two named doors, Trails and
 * Library — the two organising axes, named so neither reads as filtering the
 * other. Right: the global Capture action and the account control (ADR-0014).
 * Capture opens a non-navigating overlay, so intake is available from every
 * surface without moving the User off the one they are on.
 *
 * The active destination is marked with `aria-current="page"` (NavLink), so the
 * current axis is apparent to sighted and assistive-technology Users alike.
 */

const doorStyle = ({ isActive }: { isActive: boolean }) => ({
  textDecoration: "none",
  color: isActive ? "var(--ink)" : "var(--muted)",
  fontWeight: isActive ? 600 : 500,
  padding: "var(--space-1) var(--space-2)",
  borderRadius: "var(--radius-1)",
});

export function TopBar() {
  const { open } = useCapture();
  const location = useLocation();
  const libraryActive =
    location.pathname === "/library" || location.pathname.startsWith("/items/");

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        padding: "var(--space-3) var(--space-4)",
        borderBottom: "1px solid var(--line)",
        background: "var(--surface)",
      }}
    >
      <NavLink
        to="/"
        aria-label="Unshelf — go to Trails"
        style={{ display: "inline-flex", textDecoration: "none" }}
        end
      >
        <Wordmark />
      </NavLink>
      <nav
        aria-label="Primary"
        style={{ display: "flex", gap: "var(--space-2)" }}
      >
        <NavLink to="/" end style={doorStyle}>
          Trails
        </NavLink>
        <Link
          to="/library"
          style={doorStyle({ isActive: libraryActive })}
          aria-current={libraryActive ? "page" : undefined}
        >
          Library
        </Link>
      </nav>
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
        }}
      >
        <button
          type="button"
          onClick={open}
          style={{
            font: "inherit",
            fontWeight: 550,
            color: "var(--on-accent)",
            background: "var(--accent)",
            border: "none",
            borderRadius: "var(--radius-2)",
            padding: "var(--space-2) var(--space-4)",
            minHeight: "40px",
            cursor: "pointer",
          }}
        >
          Capture
        </button>
        <UserButton />
      </div>
    </header>
  );
}
