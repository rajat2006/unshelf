import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/clerk-react";
import type { ReactNode } from "react";

/**
 * The one place Clerk is imported on the web (ADR-0009 guardrail). Everything the
 * rest of the app needs — the provider, the current-User hook, and the sign-in /
 * signed-in gate primitives — is re-exported from here, so no other module ever
 * touches `@clerk/clerk-react`. Google is the only enabled sign-in method
 * (Clerk-dashboard config, ADR-0001): no password is created or managed.
 */

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** Wrap the app so Clerk's session is available to `useCurrentUser` and the gate. */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!publishableKey) {
    throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required");
  }
  return (
    <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
  );
}

/** The current signed-in User as the app sees it, plus a token getter for the api. */
export interface CurrentUser {
  /** Whether Clerk has finished loading the session. */
  isLoaded: boolean;
  /** Whether a User is signed in. */
  isSignedIn: boolean;
  /** The User's primary email, when signed in. */
  email: string | null;
  /** The User's display name, when signed in. */
  name: string | null;
  /** Fetch a bearer token to authenticate api requests. */
  getToken: () => Promise<string | null>;
}

/** The thin current-User wrapper the app uses instead of importing Clerk. */
export function useCurrentUser(): CurrentUser {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  return {
    isLoaded,
    isSignedIn: isSignedIn ?? false,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    name: user?.fullName ?? null,
    getToken: () => getToken(),
  };
}

export { SignedIn, SignedOut, SignInButton, UserButton };
