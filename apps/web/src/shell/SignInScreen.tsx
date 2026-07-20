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
    <main className="sign-in-screen">
      <div className="sign-in-screen__content">
        <Wordmark />
        <SignInButton>
          <button type="button" className="sign-in-action">
            Sign in with Google
          </button>
        </SignInButton>
      </div>
    </main>
  );
}
