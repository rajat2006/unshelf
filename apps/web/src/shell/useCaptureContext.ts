import { useContext } from "react";
import { CaptureContext, type CaptureContextValue } from "./capture-context";

export function useCaptureContext(): CaptureContextValue {
  const value = useContext(CaptureContext);
  if (!value) throw new Error("CaptureProvider is required");
  return value;
}
