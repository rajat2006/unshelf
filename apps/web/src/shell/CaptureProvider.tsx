import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { CaptureContext, type CaptureContextValue } from "./capture-context";
import { CaptureOverlay } from "./CaptureOverlay";
import { useCaptureShortcuts } from "./useCaptureShortcuts";

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
export function CaptureProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const listeners = useRef(new Set<() => void>());
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    window.setTimeout(() => returnFocus.current?.focus(), 0);
  }, []);

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
