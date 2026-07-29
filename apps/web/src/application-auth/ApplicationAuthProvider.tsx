import type { ReactNode } from "react";
import { AuthContext } from "./AuthContext";
import type { ApplicationAuth } from "./types";

/** Supply authentication to the application independently of its identity provider. */
export function ApplicationAuthProvider({
  auth,
  children,
}: {
  auth: ApplicationAuth;
  children: ReactNode;
}) {
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
