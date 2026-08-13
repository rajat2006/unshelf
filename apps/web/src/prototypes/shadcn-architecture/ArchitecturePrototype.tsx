import { useCallback, useEffect, useMemo, useState } from "react";
import type { Status } from "@unshelf/shared";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";

import { TooltipProvider } from "@/components/ui/tooltip";

import { CaptureDialog } from "./CaptureDialog";
import { ItemDetailSheet } from "./ItemDetailSheet";
import { LibraryValidationSlice } from "./LibraryValidationSlice";
import { PrototypeShell } from "./PrototypeShell";
import { PrototypeWorkbench } from "./PrototypeWorkbench";
import { PROTOTYPE_ITEMS, type PrototypeItem } from "./prototype-data";

export const PROTOTYPE_SCENARIOS = [
  "ready",
  "loading",
  "empty",
  "error",
] as const;

export type PrototypeScenario = (typeof PROTOTYPE_SCENARIOS)[number];
export type PrototypeTheme = "light" | "dark";

/**
 * PROTOTYPE — one architecture, one representative composition, and a URL-
 * controlled state matrix. This intentionally does not compare visual variants:
 * the Wayfinder ticket is deciding whether the selected architecture holds up.
 */
export function ArchitecturePrototype() {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemId } = useParams<{ itemId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState(PROTOTYPE_ITEMS);

  const scenario = prototypeScenario(searchParams.get("state"));
  const theme = prototypeTheme(searchParams.get("theme"));
  const captureOpen = searchParams.get("capture") === "open";
  const openItem = items.find((item) => item.id === itemId);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
  }, [theme]);

  const updateSearch = useCallback(
    ({
      key,
      value,
      replace = true,
    }: {
      key: string;
      value: string | null;
      replace?: boolean;
    }) => {
      const next = new URLSearchParams(searchParams);
      if (value === null) next.delete(key);
      else next.set(key, value);
      setSearchParams(next, { replace });
    },
    [searchParams, setSearchParams],
  );

  const visibleItems = useMemo(
    () => (scenario === "ready" ? items : []),
    [items, scenario],
  );

  const changeItemStatus = useCallback(
    ({ id, status }: { id: string; status: Status }) => {
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, status } : item)),
      );
    },
    [],
  );

  const navigateToItem = useCallback(
    (item: PrototypeItem) => {
      void navigate(
        { pathname: `/items/${item.id}`, search: location.search },
        { state: { background: "/prototype" } },
      );
    },
    [location.search, navigate],
  );

  const closeItem = useCallback(() => {
    void navigate({ pathname: "/", search: location.search });
  }, [location.search, navigate]);

  return (
    <TooltipProvider>
      <PrototypeShell
        theme={theme}
        onThemeChange={(nextTheme) =>
          updateSearch({ key: "theme", value: nextTheme })
        }
        onCapture={() =>
          updateSearch({ key: "capture", value: "open", replace: false })
        }
      >
        <LibraryValidationSlice
          scenario={scenario}
          items={visibleItems}
          onOpenItem={navigateToItem}
          onItemStatusChange={changeItemStatus}
          onCapture={() =>
            updateSearch({ key: "capture", value: "open", replace: false })
          }
          onRetry={() => updateSearch({ key: "state", value: "ready" })}
        />
      </PrototypeShell>

      <ItemDetailSheet
        item={openItem}
        onClose={closeItem}
        onStatusChange={(status) => {
          if (openItem) changeItemStatus({ id: openItem.id, status });
        }}
      />

      <CaptureDialog
        open={captureOpen}
        onOpenChange={(open) =>
          updateSearch({
            key: "capture",
            value: open ? "open" : null,
            replace: !open,
          })
        }
      />

      <PrototypeWorkbench
        scenario={scenario}
        theme={theme}
        onScenarioChange={(nextScenario) =>
          updateSearch({ key: "state", value: nextScenario })
        }
        onThemeChange={(nextTheme) =>
          updateSearch({ key: "theme", value: nextTheme })
        }
      />
    </TooltipProvider>
  );
}

function prototypeScenario(value: string | null): PrototypeScenario {
  return PROTOTYPE_SCENARIOS.find((scenario) => scenario === value) ?? "ready";
}

function prototypeTheme(value: string | null): PrototypeTheme {
  return value === "dark" ? "dark" : "light";
}
