import { useContext } from "react";
import { AuthContext } from "./AuthContext";
import type { ApplicationAuth } from "./types";

/** The whole application-auth handle: status plus the provider's controls. */
export function useApplicationAuth(): ApplicationAuth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("ApplicationAuthProvider is required");
  return auth;
}
