import { CurrentSpace } from "./items/CurrentSpace";
import { SignedIn, SignedOut, SignInButton, UserButton } from "./auth";

/**
 * The v1 shell, gated by Google sign-in. A signed-out visitor sees only the
 * sign-in call to action (sign-up *is* sign-in — the first Google sign-in
 * creates the User, ADR-0001); a signed-in User sees their space: capture an Item,
 * browse All (issue #17), and group Items into Stops (issue #20). Everything
 * reflows to phone width so an Item can be captured the moment it is found
 * (ADR-0008).
 */
export function App() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: "40rem",
        margin: "0 auto",
        padding: "clamp(1rem, 4vw, 2rem)",
        boxSizing: "border-box",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1 style={{ margin: 0 }}>Unshelf</h1>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <SignedOut>
        <section style={{ marginTop: "2rem" }}>
          <p>A place to organise your learning. Sign in to begin.</p>
          <SignInButton>
            <button
              type="button"
              style={{
                fontSize: "1rem",
                padding: "0.75rem 1.25rem",
                minHeight: "44px",
                cursor: "pointer",
              }}
            >
              Sign in with Google
            </button>
          </SignInButton>
        </section>
      </SignedOut>

      <SignedIn>
        <CurrentSpace />
      </SignedIn>
    </main>
  );
}
