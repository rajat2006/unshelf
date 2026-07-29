import type { ComponentType, ReactNode } from "react";

/** The current signed-in User as the app sees it: a token getter for the api. */
export interface CurrentUser {
  /** Fetch a bearer token to authenticate api requests. */
  getToken: () => Promise<string | null>;
}

type AuthStatus = "loading" | "signed-in" | "signed-out";

export interface ApplicationAuth {
  status: AuthStatus;
  user: CurrentUser | null;
  SignInButton: ComponentType<{ children: ReactNode }>;
  UserButton: ComponentType;
}
