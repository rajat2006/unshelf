import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CaptureOverlay } from "./CaptureOverlay";

/**
 * Capture as global chrome (ADR-0014, design spec §3). Capture is deliberately
 * *not* a route: it is a non-navigating overlay opened from the top bar or by
 * keyboard, present on every signed-in surface and nowhere else. This controller
 * owns the overlay's open state and installs the shortcuts, so the top bar only
 * has to ask it to `open()` and a surface only has to say what to refresh once an
 * Item lands.
 *
 * A surface that shows Library state subscribes with `useCaptureListener`; on a
 * successful capture the controller fans the event out to every listener, which
 * is how the store the new Item joined refreshes without Capture navigating there.
 */

interface CaptureContextValue {
  /** Open the Capture composer over the current surface. */
  open: () => void;
  /** Register a callback fired after each successful capture. Returns an unsubscribe. */
  subscribe: (onCaptured: () => void) => () => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

function useCaptureContext(): CaptureContextValue {
  const value = useContext(CaptureContext);
  if (!value) throw new Error("CaptureProvider is required");
  return value;
}

/** The top-bar action's handle: how to open the global Capture composer. */
export function useCapture(): { open: () => void } {
  const { open } = useCaptureContext();
  return { open };
}

/**
 * Refresh a surface's Library state after a capture lands elsewhere. The callback
 * should be stable (memoise it) so the subscription is not torn down every render.
 */
export function useCaptureListener(onCaptured: () => void): void {
  const { subscribe } = useCaptureContext();
  useEffect(() => subscribe(onCaptured), [subscribe, onCaptured]);
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const listeners = useRef(new Set<() => void>());

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const subscribe = useCallback((onCaptured: () => void) => {
    listeners.current.add(onCaptured);
    return () => {
      listeners.current.delete(onCaptured);
    };
  }, []);

  const notifyCaptured = useCallback(() => {
    for (const onCaptured of listeners.current) onCaptured();
  }, []);

  useCaptureShortcuts(open);

  const value = useMemo<CaptureContextValue>(
    () => ({ open, subscribe }),
    [open, subscribe],
  );

  return (
    <CaptureContext.Provider value={value}>
      {children}
      <CaptureOverlay
        isOpen={isOpen}
        onClose={close}
        onCaptured={notifyCaptured}
      />
    </CaptureContext.Provider>
  );
}

/**
 * Command/Ctrl+K and the bare `c` open Capture — but only when focus is not in an
 * editable control, so typing a `c` into a field or using the browser's own
 * Ctrl+K is never hijacked. We only claim the event (preventing the default) when
 * we actually open the composer, leaving every other key to browser and
 * assistive-technology conventions untouched.
 */
function useCaptureShortcuts(open: () => void): void {
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

/** Is the event aimed at a control where a keystroke means text, not a shortcut? */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
