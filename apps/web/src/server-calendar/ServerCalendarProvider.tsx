import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

const unavailableCalendar: ServerCalendarValue = {
  status: "unavailable",
  today: null,
  validUntil: null,
  retry: () => undefined,
};
const ServerCalendarContext =
  createContext<ServerCalendarValue>(unavailableCalendar);
const maximumTimeout = 2_147_483_647;
const canonicalDate = /^\d{4}-\d{2}-\d{2}$/;

/** Own the signed-in shell's one authoritative PostgreSQL calendar document. */
export function ServerCalendarProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [state, setState] = useState<ServerCalendarState>({
    status: "loading",
    today: null,
    validUntil: null,
  });
  const inFlight = useRef<Promise<void> | null>(null);
  const newestRequest = useRef(0);

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;

    const requestId = ++newestRequest.current;
    setState({ status: "loading", today: null, validUntil: null });
    const request = fetchServerCalendar(user)
      .then((calendar) => {
        if (requestId !== newestRequest.current) return;
        if (!isCurrentCalendar(calendar)) {
          setState({
            status: "unavailable",
            today: null,
            validUntil: null,
          });
          return;
        }
        setState({ status: "available", ...calendar });
      })
      .catch(() => {
        if (requestId === newestRequest.current) {
          setState({
            status: "unavailable",
            today: null,
            validUntil: null,
          });
        }
      })
      .finally(() => {
        if (inFlight.current === request) inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

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
          setState({ status: "unavailable", today: null, validUntil: null });
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
