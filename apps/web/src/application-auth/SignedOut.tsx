import type { ReactNode } from "react";
import { useApplicationAuth } from "./useApplicationAuth";

/** Render children only when authentication resolved without a User. */
export function SignedOut({ children }: { children: ReactNode }) {
  return useApplicationAuth().status === "signed-out" ? children : null;
}
