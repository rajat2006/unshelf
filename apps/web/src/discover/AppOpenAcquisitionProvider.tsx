import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";
import { requestAppOpenAcquisition } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { isDiscoverEnabled } from "./feature";

type AppOpenAcquisition =
  | { kind: "idle" }
  | { kind: "pending"; settled: Promise<void> }
  | { kind: "settled" };

const AppOpenAcquisitionContext = createContext<AppOpenAcquisition>({
  kind: "idle",
});
const StartAppOpenAcquisitionContext = createContext<() => void>(
  () => undefined,
);

/**
 * Own the one request-driven acquisition attached to an authenticated shell.
 * The deferred start lets stored application state paint first; keeping this
 * above routed rooms prevents navigation, refocus, or Item return from starting
 * another request.
 */
export function AppOpenAcquisitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const user = useCurrentUser();
  const location = useLocation();
  const started = useRef(false);
  const [acquisition, setAcquisition] = useState<AppOpenAcquisition>({
    kind: "idle",
  });

  const start = useCallback(() => {
    if (!isDiscoverEnabled() || started.current) return;
    started.current = true;
    const settled = requestAppOpenAcquisition(user)
      .then(() => undefined)
      .catch(() => undefined);
    setAcquisition({ kind: "pending", settled });
    void settled.then(() => {
      window.setTimeout(() => setAcquisition({ kind: "settled" }), 0);
    });
  }, [user]);

  useEffect(() => {
    if (/(^|\/)discover(?:\/|$)/.test(location.pathname)) return;
    const afterFirstPaint = window.requestAnimationFrame(start);
    return () => window.cancelAnimationFrame(afterFirstPaint);
  }, [location.pathname, start]);

  return (
    <StartAppOpenAcquisitionContext.Provider value={start}>
      <AppOpenAcquisitionContext.Provider value={acquisition}>
        {children}
      </AppOpenAcquisitionContext.Provider>
    </StartAppOpenAcquisitionContext.Provider>
  );
}

/** Observe an app-open request only while this mounted room can need a reread. */
export function usePendingAppOpenAcquisition(): Promise<void> | null {
  const acquisition = useContext(AppOpenAcquisitionContext);
  return acquisition.kind === "pending" ? acquisition.settled : null;
}

/** Start only after an initially open Discover room has committed stored state. */
export function useStartAppOpenAcquisitionAfterStoredRender(): () => void {
  return useContext(StartAppOpenAcquisitionContext);
}
