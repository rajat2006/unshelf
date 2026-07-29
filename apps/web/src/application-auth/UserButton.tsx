import { useApplicationAuth } from "./useApplicationAuth";

/** Render the configured signed-in User account control. */
export function UserButton() {
  const Button = useApplicationAuth().UserButton;
  return <Button />;
}
