import { useCaptureContext } from "./useCaptureContext";

/** The top-bar action's handle: how to open the global Capture composer. */
export function useCapture(): { open: () => void } {
  const { open } = useCaptureContext();
  return { open };
}
