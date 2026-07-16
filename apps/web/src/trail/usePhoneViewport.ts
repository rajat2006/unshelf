import { useEffect, useState } from "react";

/** Below this width the Trail is viewed, not authored (US 40, ADR-0008). */
const PHONE_MAX_WIDTH = "(max-width: 640px)";

/**
 * Whether the viewport is phone-width. The Trail is authored on desktop and only
 * viewed on the phone (US 40), so this is the seam that decides which: it drives
 * the canvas `readOnly`, nothing more. It tracks live, so rotating or resizing a
 * device flips authoring on or off without a reload. The first render already
 * reads `matchMedia`, so a phone opens read-only from the very first paint — no
 * flash of authorable controls; only where `matchMedia` is absent (server
 * rendering) does it fall back to the authorable desktop.
 */
const phoneNow = (): boolean =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia(PHONE_MAX_WIDTH).matches;

export function usePhoneViewport(): boolean {
  const [isPhone, setIsPhone] = useState(phoneNow);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(PHONE_MAX_WIDTH);
    const sync = () => setIsPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isPhone;
}
