import { useEffect, useState } from "react";
import type { User } from "@unshelf/shared";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useCurrentUser,
} from "./auth";

/**
 * The v1 shell, gated by Google sign-in. A signed-out visitor sees only the
 * sign-in call to action (Clerk's allowlist + invitations decide whether that
 * sign-in is admitted); a signed-in User sees their space, proving the tenancy
 * round-trip: the app calls `/api/me` with a Clerk token and the api answers with
 * *this* User's own `users` row. The layout reflows to phone width (ADR-0008).
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
          <p>An invite-only place to organise your learning. Sign in to begin.</p>
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

/** The signed-in view: fetch and show the current User from the api. */
function CurrentSpace() {
  const { getToken } = useCurrentUser();
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/me", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error(`api responded ${res.status}`);
        }
        const body = (await res.json()) as User;
        if (!cancelled) setMe(body);
      } catch (e: unknown) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return (
    <section style={{ marginTop: "2rem" }}>
      {error && <p>Could not reach your space: {error}</p>}
      {!me && !error && <p>Loading your space…</p>}
      {me && (
        <ul>
          <li>You are signed in.</li>
          <li>User id: {me.id}</li>
        </ul>
      )}
    </section>
  );
}
