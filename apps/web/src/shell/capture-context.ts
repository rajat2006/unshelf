import { createContext } from "react";

export interface CaptureContextValue {
  /** Open the Capture composer over the current surface. */
  open: () => void;
  /** Register a callback fired after each successful capture. Returns an unsubscribe. */
  subscribe: (onCaptured: () => void) => () => void;
}

export const CaptureContext = createContext<CaptureContextValue | null>(null);
