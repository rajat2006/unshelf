import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ServerCalendar } from "@unshelf/shared";
import { fetchServerCalendar } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";

type ServerCalendarState =
  | { status: "loading" | "unavailable"; today: null; validUntil: null }
  | {
      status: "available";
      today: string;
      validUntil: string;
    };

export type ServerCalendarValue = ServerCalendarState & {
  retry: () => void;
};

const unavailableState: ServerCalendarState = {
  status: "unavailable",
  today: null,
  validUntil: null,
};
const unavailableCalendar: ServerCalendarValue = {
  ...unavailableState,
  retry: () => undefined,
};
const ServerCalendarContext =
  createContext<ServerCalendarValue>(unavailableCalendar);
const maximumTimeout = 2_147_483_647;
const canonicalDate = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Treat the server date as authoritative only until `validUntil`. Requests are
 * shared per User, and switching Users invalidates any response still in flight.
 * After expiry or returning to the tab, hide the old date until a fresh one
 * arrives.
 */
export function ServerCalendarProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [state, setState] = useState<ServerCalendarState>({
    status: "loading",
    today: null,
    validUntil: null,
  });
  const inFlight = useRef<Promise<void> | null>(null);
  const newestRequest = useRef(0);
  const requestUser = useRef(user);

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;

    const requestId = ++newestRequest.current;
    setState({ status: "loading", today: null, validUntil: null });
    const request = fetchServerCalendar(user)
      .then((calendar) => {
        if (requestId !== newestRequest.current) return;
        if (!isCurrentCalendar(calendar)) {
          setState(unavailableState);
          return;
        }
        setState({ status: "available", ...calendar });
      })
      .catch(() => {
        if (requestId === newestRequest.current) {
          setState(unavailableState);
        }
      })
      .finally(() => {
        if (inFlight.current === request) inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [user]);

  useLayoutEffect(() => {
    if (requestUser.current !== user) {
      requestUser.current = user;
      newestRequest.current += 1;
      inFlight.current = null;
    }
    void load();
  }, [load, user]);

  useEffect(() => {
    if (state.status !== "available") return;

    let timeout: number | undefined;
    const refreshAtExpiry = () => {
      const remaining = Date.parse(state.validUntil) - Date.now();
      if (remaining > maximumTimeout) {
        timeout = window.setTimeout(refreshAtExpiry, maximumTimeout);
        return;
      }
      timeout = window.setTimeout(
        () => {
          setState(unavailableState);
          void load();
        },
        Math.max(remaining, 0),
      );
    };
    refreshAtExpiry();
    return () => window.clearTimeout(timeout);
  }, [load, state]);

  useEffect(() => {
    const refreshVisibleDocument = () => {
      if (
        document.visibilityState === "visible" &&
        (state.status !== "available" ||
          Date.parse(state.validUntil) <= Date.now())
      ) {
        void load();
      }
    };
    document.addEventListener("visibilitychange", refreshVisibleDocument);
    return () =>
      document.removeEventListener("visibilitychange", refreshVisibleDocument);
  }, [load, state]);

  return (
    <ServerCalendarContext.Provider
      value={{ ...state, retry: () => void load() }}
    >
      {children}
    </ServerCalendarContext.Provider>
  );
}

/** Read the server calendar owned by the signed-in shell. */
export function useServerCalendar(): ServerCalendarValue {
  return useContext(ServerCalendarContext);
}

function isCurrentCalendar(calendar: ServerCalendar): boolean {
  return (
    canonicalDate.test(calendar.today) &&
    Number.isFinite(Date.parse(calendar.validUntil)) &&
    Date.parse(calendar.validUntil) > Date.now()
  );
}
