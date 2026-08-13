import { useEffect } from "react";
import { ArrowLeft, ArrowRight, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isEditableTarget } from "@/shell/isEditableTarget";

import {
  PROTOTYPE_SCENARIOS,
  type PrototypeScenario,
  type PrototypeTheme,
} from "./ArchitecturePrototype";

const SCENARIO_LABELS: Record<PrototypeScenario, string> = {
  ready: "Ready · populated",
  loading: "Loading · preserved",
  empty: "Empty · next action",
  error: "Error · recovery",
};

const isProductionBuild = import.meta.env?.PROD ?? false;

export function PrototypeWorkbench({
  scenario,
  theme,
  onScenarioChange,
  onThemeChange,
}: {
  scenario: PrototypeScenario;
  theme: PrototypeTheme;
  onScenarioChange: (scenario: PrototypeScenario) => void;
  onThemeChange: (theme: PrototypeTheme) => void;
}) {
  useEffect(() => {
    if (isProductionBuild) return;

    function cycleWithKeyboard(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        isCompositeControl(event.target)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") cycle(-1);
      else if (event.key === "ArrowRight") cycle(1);
      else return;
      event.preventDefault();
    }

    function cycle(direction: -1 | 1) {
      const currentIndex = PROTOTYPE_SCENARIOS.indexOf(scenario);
      const nextIndex =
        (currentIndex + direction + PROTOTYPE_SCENARIOS.length) %
        PROTOTYPE_SCENARIOS.length;
      onScenarioChange(PROTOTYPE_SCENARIOS[nextIndex]);
    }

    window.addEventListener("keydown", cycleWithKeyboard);
    return () => window.removeEventListener("keydown", cycleWithKeyboard);
  }, [onScenarioChange, scenario]);

  if (isProductionBuild) return null;

  function cycle(direction: -1 | 1) {
    const currentIndex = PROTOTYPE_SCENARIOS.indexOf(scenario);
    const nextIndex =
      (currentIndex + direction + PROTOTYPE_SCENARIOS.length) %
      PROTOTYPE_SCENARIOS.length;
    onScenarioChange(PROTOTYPE_SCENARIOS[nextIndex]);
  }

  return (
    <aside
      aria-label="Prototype controls"
      className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-[var(--radius-panel)] border border-primary/25 bg-foreground p-2 text-background shadow-lg"
    >
      <span className="hidden px-2 text-xs font-bold tracking-[0.12em] uppercase sm:inline">
        Prototype
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-background hover:bg-background/15 hover:text-background"
        aria-label="Previous presentation state"
        aria-keyshortcuts="ArrowLeft"
        onClick={() => cycle(-1)}
      >
        <ArrowLeft aria-hidden="true" />
      </Button>

      <Select
        value={scenario}
        onValueChange={(value) => onScenarioChange(value as PrototypeScenario)}
      >
        <SelectTrigger
          size="sm"
          className="w-44 border-background/25 bg-foreground text-background focus-visible:border-background focus-visible:ring-background/35"
          aria-label="Presentation state"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROTOTYPE_SCENARIOS.map((candidate) => (
            <SelectItem key={candidate} value={candidate}>
              {SCENARIO_LABELS[candidate]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-background hover:bg-background/15 hover:text-background"
        aria-label="Next presentation state"
        aria-keyshortcuts="ArrowRight"
        onClick={() => cycle(1)}
      >
        <ArrowRight aria-hidden="true" />
      </Button>

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-background hover:bg-background/15 hover:text-background"
        aria-label={`Switch to ${theme === "light" ? "Dark" : "Light"}`}
        onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
      >
        {theme === "light" ? (
          <Moon aria-hidden="true" />
        ) : (
          <Sun aria-hidden="true" />
        )}
      </Button>
    </aside>
  );
}

function isCompositeControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('[role="combobox"], [role="listbox"], [role="dialog"]') !==
      null
  );
}
