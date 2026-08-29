import { useEffect, useRef } from "react";
import {
  NavigationType,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router";
import { Alert } from "@/components/ui/alert";
import {
  consumeItemRecoveryNoticeState,
  readItemRecoveryNotice,
} from "./item-route-state";

export function ItemRecoveryNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const routeNotice = readItemRecoveryNotice(location.state);
  const initialNotice = useRef(routeNotice).current;
  const notice =
    routeNotice ??
    (navigationType === NavigationType.Replace ? initialNotice : null);
  const consumed = useRef(false);

  useEffect(() => {
    if (!notice || consumed.current) return;
    consumed.current = true;
    void navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state: consumeItemRecoveryNoticeState(location.state),
      },
    );
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
    notice,
  ]);

  if (!notice) return null;
  return (
    <Alert className="border-primary/30 bg-primary/6 text-foreground">
      {notice === "deleted"
        ? "Item deleted."
        : "That Item is no longer in your Library."}
    </Alert>
  );
}
