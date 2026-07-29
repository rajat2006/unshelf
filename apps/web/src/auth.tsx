import {
  ClerkProvider,
  SignInButton as ClerkSignInButton,
  UserButton as ClerkUserButton,
  useAuth,
} from "@clerk/react";
import { useMemo, type ReactNode } from "react";
import { type ApplicationAuth } from "./application-auth/types";
import { ApplicationAuthProvider } from "./application-auth/ApplicationAuthProvider";

/**
 * The one place Clerk is imported on the web (ADR-0009 guardrail). This adapter
 * translates Clerk's session and controls into the provider-neutral application
 * auth boundary, so no application module touches `@clerk/react` or depends on
 * its component contracts. Google is the only enabled sign-in method
 * (Clerk-dashboard config, ADR-0001 — see docs/clerk-setup.md): no password is
 * created or managed.
 */

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** Wrap the app so Clerk's session is available to `useCurrentUser` and the gate. */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!publishableKey) {
    throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required");
  }
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAuthAdapter>{children}</ClerkAuthAdapter>
    </ClerkProvider>
  );
}

function ClerkAuthAdapter({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const auth = useMemo<ApplicationAuth>(
    () => ({
      status: !isLoaded ? "loading" : isSignedIn ? "signed-in" : "signed-out",
      user: isSignedIn ? { getToken } : null,
      SignInButton: ClerkSignInTrigger,
      UserButton: ClerkUserControl,
    }),
    [getToken, isLoaded, isSignedIn],
  );
  return (
    <ApplicationAuthProvider auth={auth}>{children}</ApplicationAuthProvider>
  );
}

function ClerkSignInTrigger({ children }: { children: ReactNode }) {
  return <ClerkSignInButton mode="modal">{children}</ClerkSignInButton>;
}

function ClerkUserControl() {
  return <ClerkUserButton />;
}
