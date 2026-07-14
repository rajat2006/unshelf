import {
  ClerkProvider,
  Show,
  SignInButton as ClerkSignInButton,
  UserButton as ClerkUserButton,
  useAuth,
} from "@clerk/react";
import { useMemo, type ReactNode } from "react";

/**
 * The one place Clerk is imported on the web (ADR-0009 guardrail). Everything the
 * rest of the app needs — the provider, the current-User hook, and the sign-in /
 * signed-in gate primitives — is defined here with our own props, so no other
 * module touches `@clerk/react` or depends on its component contracts. Google is
 * the only enabled sign-in method (Clerk-dashboard config, ADR-0001 — see
 * docs/clerk-setup.md): no password is created or managed.
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

/** The current signed-in User as the app sees it: a token getter for the api. */
export interface CurrentUser {
  /** Fetch a bearer token to authenticate api requests. */
  getToken: () => Promise<string | null>;
}

/** The thin current-User wrapper the app uses instead of importing Clerk. */
export function useCurrentUser(): CurrentUser {
  const { getToken } = useAuth();
  // Consumers hang effects off this object — `getToken` goes through untouched
  // (Clerk keeps it stable across renders) and the object is memoized, so a
  // render never mints fresh identities that would re-fire those effects forever.
  return useMemo(() => ({ getToken }), [getToken]);
}

/** Render children only when a User is signed in. */
export function SignedIn({ children }: { children: ReactNode }) {
  return <Show when="signed-in">{children}</Show>;
}

/** Render children only when no User is signed in. */
export function SignedOut({ children }: { children: ReactNode }) {
  return <Show when="signed-out">{children}</Show>;
}

/** Open the sign-in flow from `children`, our own trigger element. */
export function SignInButton({ children }: { children: ReactNode }) {
  return <ClerkSignInButton mode="modal">{children}</ClerkSignInButton>;
}

/** The signed-in User's account menu: manage account, sign out. */
export function UserButton() {
  return <ClerkUserButton />;
}
