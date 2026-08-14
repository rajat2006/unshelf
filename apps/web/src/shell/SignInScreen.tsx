import { SignInButton } from "../application-auth/SignInButton";
import { Button } from "../components/ui/button";
import { Wordmark } from "./Wordmark";

/**
 * The dedicated, chrome-less signed-out screen (design spec §5): the centred
 * Unshelf wordmark and the single "Sign in with Google" action on the warm
 * page ground. No marketing copy, no top bar — authentication stays
 * visually distinct from the User's private space. The button opens the
 * provider's sign-in flow through the application-auth boundary (Clerk's modal
 * in production); this screen never touches the identity provider directly.
 */
export function SignInScreen() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="flex flex-col items-center gap-8 rounded-[var(--radius-panel)] border bg-card px-8 py-10 text-card-foreground sm:px-12">
        <Wordmark />
        <SignInButton>
          <Button type="button" size="touch">
            Sign in with Google
          </Button>
        </SignInButton>
      </div>
    </main>
  );
}
