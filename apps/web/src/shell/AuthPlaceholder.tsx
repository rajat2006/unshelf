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
      className="grid min-h-svh place-items-center p-6"
    >
      <Wordmark />
    </div>
  );
}
