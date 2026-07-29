import type { ReactNode } from "react";
import { useApplicationAuth } from "./useApplicationAuth";

/** Render children only when a User is signed in. */
export function SignedIn({ children }: { children: ReactNode }) {
  return useApplicationAuth().status === "signed-in" ? children : null;
}
