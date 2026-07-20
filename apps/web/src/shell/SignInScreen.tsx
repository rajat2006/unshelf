import { SignInButton } from "../application-auth";
import { Wordmark } from "./Wordmark";

/**
 * The dedicated, chrome-less signed-out screen (design spec §5): the centred
 * Unshelf wordmark and the single "Sign in with Google" action on the Quiet
 * Focus background. No marketing copy, no top bar — authentication stays
 * visually distinct from the User's private space. The button opens the
 * provider's sign-in flow through the application-auth boundary (Clerk's modal
 * in production); this screen never touches the identity provider directly.
 */
export function SignInScreen() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-5)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-5)",
        }}
      >
        <Wordmark />
        <SignInButton>
          <button
            type="button"
            style={{
              font: "inherit",
              fontWeight: 550,
              padding: "var(--space-3) var(--space-5)",
              minHeight: "44px",
              cursor: "pointer",
              color: "var(--on-accent)",
              background: "var(--accent)",
              border: "none",
              borderRadius: "var(--radius-2)",
            }}
          >
            Sign in with Google
          </button>
        </SignInButton>
      </div>
    </main>
  );
}
