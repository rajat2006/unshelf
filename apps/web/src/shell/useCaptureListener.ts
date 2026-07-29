import { useEffect } from "react";
import { useCaptureContext } from "./useCaptureContext";

/**
 * Refresh a surface's Library state after a capture lands elsewhere. The callback
 * should be stable (memoise it) so the subscription is not torn down every render.
 */
export function useCaptureListener(onCaptured: () => void): void {
  const { subscribe } = useCaptureContext();
  useEffect(() => subscribe(onCaptured), [subscribe, onCaptured]);
}
