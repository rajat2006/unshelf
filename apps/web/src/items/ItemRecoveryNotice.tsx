import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Alert } from "@/components/ui/alert";
import {
  consumeItemRecoveryNoticeState,
  readItemRecoveryNotice,
  type ItemRecoveryNoticeKind,
} from "./item-route-state";

export function ItemRecoveryNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<ItemRecoveryNoticeKind | null>(null);
  const consuming = useRef(false);

  useEffect(() => {
    const routeNotice = readItemRecoveryNotice(location.state);
    if (routeNotice) {
      consuming.current = true;
      setNotice(routeNotice);
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
      return;
    }
    if (consuming.current) {
      consuming.current = false;
      return;
    }
    setNotice(null);
  }, [
    location.hash,
    location.key,
    location.pathname,
    location.search,
    location.state,
    navigate,
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
