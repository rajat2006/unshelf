import type { ReactNode } from "react";
import { useApplicationAuth } from "./useApplicationAuth";

/** Open the configured sign-in flow from `children`. */
export function SignInButton({ children }: { children: ReactNode }) {
  const Button = useApplicationAuth().SignInButton;
  return <Button>{children}</Button>;
}
