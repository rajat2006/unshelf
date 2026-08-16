/**
 * PROTOTYPE — throw away after issue #417 is resolved.
 * Five compact variations of the selected Bookplate direction, switchable via
 * `?variant=`, mounted in a representative Item / Daily Focus composition.
 */
import {
  StrictMode,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { format, isMatch, isValid, parse } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  Moon,
  Sun,
} from "lucide-react";
import { DayPicker, type DropdownProps } from "react-day-picker";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import "@/styles/globals.css";

type VariantKey = "A" | "B" | "C" | "D" | "E";
type FeatureKey = "target" | "history";
type Treatment = "circle" | "tiles" | "ledger" | "underline" | "soft-square";

interface VariantDefinition {
  key: VariantKey;
  name: string;
  treatment: Treatment;
  summary: string;
}

const VARIANTS: readonly VariantDefinition[] = [
  {
    key: "A",
    name: "Ink circle",
    treatment: "circle",
    summary:
      "The original Bookplate direction with one quiet circular selection.",
  },
  {
    key: "B",
    name: "Separate tiles",
    treatment: "tiles",
    summary:
      "Every date is a discrete square tile with visible breathing room.",
  },
  {
    key: "C",
    name: "Ledger grid",
    treatment: "ledger",
    summary:
      "Continuous hairline boxes make the month read like a compact ledger.",
  },
  {
    key: "D",
    name: "Editorial underline",
    treatment: "underline",
    summary:
      "No enclosing shape: selection is carried by type, ink and an underline.",
  },
  {
    key: "E",
    name: "Soft square",
    treatment: "soft-square",
    summary:
      "A restrained rounded square sits between the circle and boxed grid.",
  },
];

const TODAY = new Date(2026, 7, 16);
const INITIAL_DATE = new Date(2026, 7, 22);
const START_MONTH = new Date(2021, 0, 1);
const END_MONTH = new Date(2036, 11, 1);
const DATE_PATTERN = "dd/MM/yyyy";

function parseVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get("variant");
  return value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D" ||
    value === "E"
    ? value
    : "B";
}

function CalendarTreatmentPrototype() {
  const [variant, setVariant] = useState<VariantKey>(parseVariant);
  const [feature, setFeature] = useState<FeatureKey>("target");
  const [dark, setDark] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const definition = VARIANTS.find((item) => item.key === variant)!;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function chooseVariant(next: VariantKey) {
    const params = new URLSearchParams(window.location.search);
    params.set("variant", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
    setVariant(next);
  }

  useEffect(() => {
    function cycle(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const index = VARIANTS.findIndex((item) => item.key === variant);
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next =
        VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
      chooseVariant(next.key);
    }
    window.addEventListener("keydown", cycle);
    return () => window.removeEventListener("keydown", cycle);
  }, [variant]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-card/90 px-5 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <BookOpen className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="m-0 font-serif text-lg font-semibold">Unshelf</p>
              <p className="m-0 text-xs text-muted-foreground">
                Calendar treatment prototype · issue 417
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="quiet"
            size="icon"
            onClick={() => setDark((current) => !current)}
            aria-label={`Use ${dark ? "Light" : "Dark"} appearance`}
          >
            {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-5 pt-8 pb-32 sm:px-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid min-w-0 content-start gap-6">
          <header className="grid gap-2 border-b pb-6">
            <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
              Interactive comparison
            </p>
            <h1 className="m-0 max-w-3xl font-serif text-4xl leading-none font-medium tracking-[-0.025em] sm:text-5xl">
              {definition.name}
            </h1>
            <p className="m-0 max-w-2xl leading-relaxed text-muted-foreground">
              {definition.summary} Open the picker, type a date, use its month
              and year menus, and move through the grid with the keyboard.
            </p>
          </header>

          <div className="grid gap-5 rounded-[var(--radius-panel)] border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="m-0 font-serif text-2xl font-medium">
                  {feature === "target"
                    ? "How to Read a Book"
                    : "Daily Focus history"}
                </p>
                <p className="mt-1 mb-0 text-sm text-muted-foreground">
                  {feature === "target"
                    ? "Item details · In progress"
                    : "Browse a frozen record without editing it"}
                </p>
              </div>
              <div
                className="flex rounded-[var(--radius-control)] bg-muted p-1"
                aria-label="Feature context"
              >
                <Button
                  type="button"
                  variant={feature === "target" ? "secondary" : "quiet"}
                  size="compact"
                  onClick={() => setFeature("target")}
                >
                  Target date
                </Button>
                <Button
                  type="button"
                  variant={feature === "history" ? "secondary" : "quiet"}
                  size="compact"
                  onClick={() => setFeature("history")}
                >
                  Daily Focus
                </Button>
              </div>
            </div>

            <div className="border-t pt-5">
              <DateFieldDemo
                key={`${variant}-${feature}`}
                treatment={definition.treatment}
                feature={feature}
                disabled={disabled}
              />
            </div>
          </div>

          <StateLegend treatment={definition.treatment} />
        </section>

        <aside className="grid content-start gap-4 lg:sticky lg:top-6">
          <div className="rounded-[var(--radius-panel)] border bg-quiet-panel p-5">
            <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
              Try the contract
            </p>
            <h2 className="mt-2 mb-0 font-serif text-2xl font-medium">
              Same behavior, new treatment
            </h2>
            <ul className="mt-4 grid gap-3 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>
                Type an invalid date, then press Enter or leave the field.
              </li>
              <li>Use month/year selects without dismissing the calendar.</li>
              <li>Use arrows, Home/End, Page Up/Down, Enter and Escape.</li>
              <li>
                Compare Target date’s immediate commit with Daily Focus staging.
              </li>
              <li>Toggle Dark and the simulated async-disabled state.</li>
            </ul>
            <Button
              type="button"
              variant={disabled ? "primary" : "secondary"}
              className="mt-5 w-full"
              onClick={() => setDisabled((current) => !current)}
            >
              {disabled ? (
                <Check aria-hidden="true" />
              ) : (
                <Clock3 aria-hidden="true" />
              )}
              {disabled ? "Restore ready state" : "Simulate saving state"}
            </Button>
          </div>

          <div className="rounded-[var(--radius-panel)] border border-dashed p-5 text-sm leading-relaxed text-muted-foreground">
            <p className="m-0 font-semibold text-foreground">
              Prototype boundary
            </p>
            <p className="mt-2 mb-0">
              Desktop interaction only. The production control will retain the
              native mobile date input and exchange timezone-free YYYY-MM-DD
              strings at its boundary.
            </p>
          </div>
        </aside>
      </main>

      {import.meta.env.DEV && (
        <PrototypeSwitcher current={variant} onChange={chooseVariant} />
      )}
    </div>
  );
}

function DateFieldDemo({
  treatment,
  feature,
  disabled,
}: {
  treatment: Treatment;
  feature: FeatureKey;
  disabled: boolean;
}) {
  const inputId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Date | undefined>(INITIAL_DATE);
  const [committed, setCommitted] = useState<Date | undefined>(INITIAL_DATE);
  const [month, setMonth] = useState(INITIAL_DATE);
  const [draft, setDraft] = useState(format(INITIAL_DATE, DATE_PATTERN));
  const [error, setError] = useState<string>();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function commit(next: Date | undefined) {
    setSelected(next);
    setDraft(next ? format(next, DATE_PATTERN) : "");
    setError(undefined);
    if (feature === "target") setCommitted(next);
  }

  function validateDraft() {
    if (!draft.trim()) {
      setError("Enter a date in DD/MM/YYYY format.");
      return false;
    }
    if (!isMatch(draft, DATE_PATTERN)) {
      setError("Use DD/MM/YYYY, for example 22/08/2026.");
      return false;
    }
    const parsed = parse(draft, DATE_PATTERN, TODAY);
    if (!isValid(parsed) || format(parsed, DATE_PATTERN) !== draft) {
      setError("That date does not exist. Check the day, month and year.");
      return false;
    }
    commit(parsed);
    setMonth(parsed);
    return true;
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") validateDraft();
  }

  function selectDay(next: Date | undefined) {
    if (!next) return;
    commit(next);
    setOpen(false);
  }

  function today() {
    commit(TODAY);
    setMonth(TODAY);
    setOpen(false);
  }

  function clear() {
    commit(undefined);
    if (feature === "history") setCommitted(undefined);
    setOpen(false);
  }

  function viewDate() {
    if (selected) setCommitted(selected);
  }

  const field = (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={inputId} className="text-sm font-semibold">
        {feature === "target" ? "Target date" : "Daily Focus date"}
      </label>
      <div className="flex max-w-xs min-w-0 items-stretch rounded-[var(--radius-control)] border border-input bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
        <Input
          id={inputId}
          value={draft}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder="DD/MM/YYYY"
          inputMode="numeric"
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onBlur={validateDraft}
          onKeyDown={handleInputKeyDown}
          className="h-8 min-w-0 flex-1 border-0 shadow-none focus-visible:ring-0"
        />
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
          <PopoverPrimitive.Trigger asChild>
            <Button
              ref={triggerRef}
              type="button"
              variant="quiet"
              size="icon-compact"
              disabled={disabled}
              aria-label="Open calendar"
              className="rounded-l-none border-l border-input"
            >
              <CalendarDays aria-hidden="true" />
            </Button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              sideOffset={8}
              align="start"
              collisionPadding={16}
              onOpenAutoFocus={(event) => event.preventDefault()}
              className={cn(
                "z-40 border bg-popover text-popover-foreground shadow-[var(--shadow-floating)] outline-none",
                "data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
                "w-[15.75rem] rounded-[var(--radius-card)] p-2.5",
              )}
            >
              <CalendarPopover
                treatment={treatment}
                selected={selected}
                month={month}
                disabled={disabled}
                onMonthChange={setMonth}
                onSelect={selectDay}
                onToday={today}
                onClear={clear}
              />
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      </div>
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs">
        {error ? (
          <p
            id={errorId}
            role="alert"
            className="m-0 flex items-center gap-1.5 text-destructive"
          >
            <CircleAlert className="size-3.5" aria-hidden="true" />
            {error}
          </p>
        ) : (
          <p className="m-0 text-muted-foreground">
            DD/MM/YYYY · calendar date, no time zone
          </p>
        )}
        {disabled && <span role="status">Saving…</span>}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4">
      <div
        className={cn(
          feature === "history" &&
            "grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end",
        )}
      >
        {field}
        {feature === "history" && (
          <Button
            type="button"
            variant="secondary"
            disabled={!selected || disabled}
            onClick={viewDate}
          >
            <CalendarDays aria-hidden="true" />
            View date
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-card)] bg-muted px-3 py-2 text-xs">
        <span>
          <span className="text-muted-foreground">Current field </span>
          <strong>{selected ? format(selected, "yyyy-MM-dd") : "null"}</strong>
        </span>
        <span>
          <span className="text-muted-foreground">
            {feature === "target" ? "Saved Item value " : "Loaded route "}
          </span>
          <strong>
            {committed ? format(committed, "yyyy-MM-dd") : "null"}
          </strong>
        </span>
        {feature === "history" &&
          selected?.getTime() !== committed?.getTime() && (
            <span className="font-semibold text-primary">
              Staged until View date
            </span>
          )}
      </div>
    </div>
  );
}

function CalendarPopover({
  treatment,
  selected,
  month,
  disabled,
  onMonthChange,
  onSelect,
  onToday,
  onClear,
}: {
  treatment: Treatment;
  selected: Date | undefined;
  month: Date;
  disabled: boolean;
  onMonthChange: (month: Date) => void;
  onSelect: (date: Date | undefined) => void;
  onToday: () => void;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-2">
      <DayPicker
        mode="single"
        required
        autoFocus
        showOutsideDays
        captionLayout="dropdown"
        navLayout="around"
        startMonth={START_MONTH}
        endMonth={END_MONTH}
        today={TODAY}
        month={month}
        selected={selected}
        disabled={disabled}
        onMonthChange={onMonthChange}
        onSelect={onSelect}
        components={{ Dropdown: CalendarDropdown }}
        className="w-full"
        classNames={calendarClassNames(treatment)}
      />
      <CalendarActions onToday={onToday} onClear={onClear} />
    </div>
  );
}

function CalendarDropdown({
  options,
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: DropdownProps) {
  function change(next: string) {
    onChange?.({ target: { value: next } } as ChangeEvent<HTMLSelectElement>);
  }

  return (
    <Select value={String(value)} onValueChange={change} disabled={disabled}>
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className="h-7 min-w-14 max-w-20 border-0 bg-transparent px-1 font-serif text-xs shadow-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="z-[60] max-h-72 min-w-28">
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={String(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function calendarClassNames(treatment: Treatment) {
  const base = {
    months: "w-full",
    month: "relative grid w-full gap-1.5",
    month_caption: "flex h-7 items-center justify-center px-8",
    dropdowns: "flex items-center justify-center gap-0.5",
    nav: "flex items-center justify-between",
    button_previous:
      "absolute left-0 top-0 z-10 grid size-7 place-items-center rounded-[var(--radius-small)] text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-35",
    button_next:
      "absolute right-0 top-0 z-10 grid size-7 place-items-center rounded-[var(--radius-small)] text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-35",
    chevron: "size-3.5 fill-current",
    month_grid: "w-full border-collapse table-fixed",
    weekdays: "grid grid-cols-7",
    weekday:
      "grid h-5 place-items-center text-[0.58rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase",
    weeks: "grid",
    week: "grid grid-cols-7",
    day: "relative aspect-square min-w-0 p-0 text-center data-[outside=true]:opacity-35 data-[disabled=true]:opacity-25 data-[disabled=true]:line-through data-[focused=true]:z-10 data-[focused=true]:[&>button]:ring-2 data-[focused=true]:[&>button]:ring-ring data-[focused=true]:[&>button]:ring-offset-2 data-[focused=true]:[&>button]:ring-offset-popover",
    day_button:
      "relative grid size-full min-h-7 place-items-center text-[0.7rem] outline-none transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed",
    today:
      "[&>button]:after:absolute [&>button]:after:bottom-1 [&>button]:after:left-1/2 [&>button]:after:size-1 [&>button]:after:-translate-x-1/2 [&>button]:after:rounded-full [&>button]:after:bg-primary",
  };

  if (treatment === "tiles") {
    return {
      ...base,
      week: "grid grid-cols-7 gap-0.5",
      weeks: "grid gap-0.5",
      day: `${base.day} data-[selected=true]:[&>button]:border-primary data-[selected=true]:[&>button]:bg-accent data-[selected=true]:[&>button]:font-bold data-[selected=true]:[&>button]:text-accent-foreground data-[selected=true]:[&>button]:after:bg-accent-foreground`,
      day_button: `${base.day_button} rounded-sm border border-border/70`,
    };
  }

  if (treatment === "ledger") {
    return {
      ...base,
      month_grid: `${base.month_grid} border border-border/75`,
      weekdays: "grid grid-cols-7 border-b border-border/75 bg-muted/65",
      week: "grid grid-cols-7 border-b border-border/75 last:border-b-0",
      day: `${base.day} border-r border-border/75 last:border-r-0 data-[selected=true]:[&>button]:bg-foreground data-[selected=true]:[&>button]:font-semibold data-[selected=true]:[&>button]:text-background data-[selected=true]:[&>button]:after:bg-background`,
      day_button: `${base.day_button} rounded-none font-serif text-xs`,
    };
  }

  if (treatment === "underline") {
    return {
      ...base,
      today:
        "[&>button]:before:absolute [&>button]:before:top-0.5 [&>button]:before:left-1/2 [&>button]:before:size-1 [&>button]:before:-translate-x-1/2 [&>button]:before:rounded-full [&>button]:before:bg-primary",
      day: `${base.day} data-[selected=true]:[&>button]:font-bold data-[selected=true]:[&>button]:text-primary data-[selected=true]:[&>button]:after:absolute data-[selected=true]:[&>button]:after:bottom-1 data-[selected=true]:[&>button]:after:left-1/2 data-[selected=true]:[&>button]:after:h-0.5 data-[selected=true]:[&>button]:after:w-4 data-[selected=true]:[&>button]:after:-translate-x-1/2 data-[selected=true]:[&>button]:after:bg-primary`,
      day_button: `${base.day_button} rounded-none`,
    };
  }

  if (treatment === "soft-square") {
    return {
      ...base,
      day: `${base.day} data-[selected=true]:[&>button]:bg-primary data-[selected=true]:[&>button]:font-semibold data-[selected=true]:[&>button]:text-primary-foreground data-[selected=true]:[&>button]:after:bg-primary-foreground`,
      day_button: `${base.day_button} rounded-[var(--radius-small)]`,
    };
  }

  return {
    ...base,
    day: `${base.day} data-[selected=true]:[&>button]:bg-primary data-[selected=true]:[&>button]:font-semibold data-[selected=true]:[&>button]:text-primary-foreground data-[selected=true]:[&>button]:after:bg-primary-foreground`,
    day_button: `${base.day_button} rounded-full`,
  };
}

function CalendarActions({
  onToday,
  onClear,
}: {
  onToday: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex justify-end gap-1 border-t pt-2">
      <Button
        type="button"
        variant="secondary"
        size="compact"
        onClick={onToday}
      >
        Today
      </Button>
      <Button type="button" variant="quiet" size="compact" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

function StateLegend({ treatment }: { treatment: Treatment }) {
  return (
    <section className="grid gap-3" aria-labelledby="state-legend-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            Visual vocabulary
          </p>
          <h2
            id="state-legend-title"
            className="mt-1 mb-0 font-serif text-2xl font-medium"
          >
            Calendar states stay distinct
          </h2>
        </div>
        <p className="m-0 text-xs text-muted-foreground">Light and Dark</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StateSample label="Default" day="18" treatment={treatment} />
        <StateSample label="Today" day="16" treatment={treatment} today />
        <StateSample label="Selected" day="22" treatment={treatment} selected />
        <StateSample
          label="Keyboard focus"
          day="23"
          treatment={treatment}
          focused
        />
        <StateSample label="Disabled" day="24" treatment={treatment} disabled />
      </div>
    </section>
  );
}

function StateSample({
  label,
  day,
  treatment,
  today,
  selected,
  focused,
  disabled,
}: {
  label: string;
  day: string;
  treatment: Treatment;
  today?: boolean;
  selected?: boolean;
  focused?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="grid place-items-center gap-2 rounded-[var(--radius-card)] border bg-card p-3">
      <span
        className={cn(
          "relative grid size-9 place-items-center text-xs",
          treatment === "circle" && "rounded-full",
          treatment === "tiles" && "rounded-sm border border-border/70",
          treatment === "ledger" &&
            "rounded-none border border-border/75 font-serif",
          treatment === "underline" && "rounded-none",
          treatment === "soft-square" && "rounded-[var(--radius-small)]",
          selected &&
            treatment === "circle" &&
            "bg-primary font-semibold text-primary-foreground",
          selected &&
            treatment === "tiles" &&
            "border-primary bg-accent font-bold text-accent-foreground",
          selected &&
            treatment === "ledger" &&
            "bg-foreground font-semibold text-background",
          selected &&
            treatment === "underline" &&
            "font-bold text-primary after:absolute after:bottom-1 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:bg-primary",
          selected &&
            treatment === "soft-square" &&
            "bg-primary font-semibold text-primary-foreground",
          focused && "ring-2 ring-ring ring-offset-2 ring-offset-card",
          disabled && "opacity-30 line-through",
          today &&
            "after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
        )}
      >
        {day}
      </span>
      <span className="text-center text-[0.68rem] font-semibold text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: VariantKey;
  onChange: (variant: VariantKey) => void;
}) {
  const index = VARIANTS.findIndex((item) => item.key === current);
  const selected = VARIANTS[index];
  function cycle(delta: number) {
    onChange(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length].key);
  }

  return (
    <nav
      className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-foreground/15 bg-foreground px-2 py-2 text-background shadow-[var(--shadow-floating)]"
      aria-label="Prototype variants"
    >
      <button
        type="button"
        className="grid size-9 place-items-center rounded-full hover:bg-background/15 focus-visible:outline-2 focus-visible:outline-background"
        onClick={() => cycle(-1)}
        aria-label="Previous calendar treatment"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
      </button>
      <div className="min-w-40 px-2 text-center">
        <p className="m-0 text-xs font-bold">
          {selected.key} — {selected.name}
        </p>
        <p className="m-0 text-[0.62rem] text-background/70">← → to compare</p>
      </div>
      <button
        type="button"
        className="grid size-9 place-items-center rounded-full hover:bg-background/15 focus-visible:outline-2 focus-visible:outline-background"
        onClick={() => cycle(1)}
        aria-label="Next calendar treatment"
      >
        <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </nav>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CalendarTreatmentPrototype />
  </StrictMode>,
);
