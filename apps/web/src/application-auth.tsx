import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";

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

const AuthContext = createContext<ApplicationAuth | null>(null);

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

/** The whole application-auth handle: status plus the provider's controls. */
export function useApplicationAuth(): ApplicationAuth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("ApplicationAuthProvider is required");
  return auth;
}

/** The sole app-facing current-User hook. */
export function useCurrentUser(): CurrentUser {
  const { user } = useApplicationAuth();
  if (!user) throw new Error("a signed-in User is required");
  return user;
}

/** Render children only when a User is signed in. */
export function SignedIn({ children }: { children: ReactNode }) {
  return useApplicationAuth().status === "signed-in" ? children : null;
}

/** Render children only when authentication resolved without a User. */
export function SignedOut({ children }: { children: ReactNode }) {
  return useApplicationAuth().status === "signed-out" ? children : null;
}

/** Open the configured sign-in flow from `children`. */
export function SignInButton({ children }: { children: ReactNode }) {
  const Button = useApplicationAuth().SignInButton;
  return <Button>{children}</Button>;
}

/** Render the configured signed-in User account control. */
export function UserButton() {
  const Button = useApplicationAuth().UserButton;
  return <Button />;
}
