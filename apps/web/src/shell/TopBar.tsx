import { NavLink } from "react-router";
import { UserButton } from "../application-auth";
import { Wordmark } from "./Wordmark";

/**
 * The slim two-door top bar (design spec §3), present on every signed-in surface.
 * Left: the Unshelf mark (= Trails / home) and the two named doors, Trails and
 * Library — the two organising axes, named so neither reads as filtering the
 * other. Right: the account control. Capture joins the right group in a later
 * slice (#92); until then intake stays on the surface it lives on today.
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
        <NavLink to="/library" style={doorStyle}>
          Library
        </NavLink>
      </nav>
      <div style={{ marginLeft: "auto" }}>
        <UserButton />
      </div>
    </header>
  );
}
