import type { CurrentUser } from "./types";
import { useApplicationAuth } from "./useApplicationAuth";

/** The sole app-facing current-User hook. */
export function useCurrentUser(): CurrentUser {
  const { user } = useApplicationAuth();
  if (!user) throw new Error("a signed-in User is required");
  return user;
}
