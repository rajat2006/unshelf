import { useEffect } from "react";
import { isEditableTarget } from "./isEditableTarget";

/**
 * Command/Ctrl+K and the bare `c` open Capture — but only when focus is not in an
 * editable control, so typing a `c` into a field or using the browser's own
 * Ctrl+K is never hijacked. We only claim the event (preventing the default) when
 * we actually open the composer, leaving every other key to browser and
 * assistive-technology conventions untouched.
 */
export function useCaptureShortcuts(open: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.repeat) return;
      if (isEditableTarget(event.target)) return;

      const commandK =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k";
      const bareC =
        event.key === "c" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;

      if (commandK || bareC) {
        event.preventDefault();
        open();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
}
