import { Wordmark } from "./Wordmark";

/**
 * The first-load hold (design spec §5): a neutral, wordmark-only screen shown
 * while authentication resolves. It carries no signed-out content and no chrome,
 * so a returning User never sees a sign-in wall flash before their space appears.
 */
export function AuthPlaceholder() {
  return (
    <div
      role="status"
      aria-label="Loading Unshelf"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-5)",
      }}
    >
      <Wordmark />
    </div>
  );
}
