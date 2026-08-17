/**
 * PROTOTYPE — Four date-picker treatments, switchable via `?variant=`, in a
 * realistic Item-detail setting. Throw this away after the visual verdict.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sparkles,
  Sun,
  Target,
} from "lucide-react";
import "../styles/globals.css";

type Variant = "A" | "B" | "C" | "D";

const variants: readonly Variant[] = ["A", "B", "C", "D"];
const variantNames: Record<Variant, string> = {
  A: "Warm bookplate",
  B: "Editorial ledger",
  C: "Milestone card",
  D: "Warm milestone hybrid",
};
const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
const days = [
  28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
  19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
];

function DatePickerPolishPrototype() {
  const [variant, setVariant] = useState<Variant>(() => readVariant());
  const [dark, setDark] = useState(() => readDarkAppearance());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function chooseVariant(next: Variant) {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    setVariant(next);
  }

  function chooseAppearance(nextDark: boolean) {
    const url = new URL(window.location.href);
    url.searchParams.set("theme", nextDark ? "dark" : "light");
    window.history.replaceState(null, "", url);
    setDark(nextDark);
  }

  useEffect(() => {
    function cycle(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const index = variants.indexOf(variant);
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      chooseVariant(
        variants[(index + offset + variants.length) % variants.length],
      );
    }
    window.addEventListener("keydown", cycle);
    return () => window.removeEventListener("keydown", cycle);
  }, [variant]);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8 sm:py-12">
      <button
        type="button"
        className="fixed top-4 right-4 z-50 grid size-10 place-items-center rounded-full border bg-card shadow-sm transition hover:bg-accent"
        aria-label={`Use ${dark ? "light" : "dark"} appearance`}
        onClick={() => chooseAppearance(!dark)}
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="hidden rounded-[var(--radius-panel)] border bg-card p-8 shadow-sm lg:block">
          <p className="m-0 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Library · Book
          </p>
          <h1 className="mt-3 mb-0 max-w-xl font-serif text-5xl leading-[0.98] tracking-[-0.035em]">
            Designing Data-Intensive Applications
          </h1>
          <p className="mt-5 max-w-lg leading-7 text-muted-foreground">
            Martin Kleppmann · A practical guide to reliable, scalable, and
            maintainable systems.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 border-t pt-6">
            <ContextStat
              icon={<BookOpen />}
              label="Progress"
              value="In progress"
            />
            <ContextStat
              icon={<Target />}
              label="Learning plan"
              value="System Design"
            />
          </div>
        </section>

        <aside className="min-h-[39rem] rounded-[var(--radius-panel)] border bg-card p-5 shadow-[var(--shadow-floating)] sm:p-7">
          <div className="mb-7 flex items-start justify-between gap-4 border-b pb-5">
            <div>
              <p className="m-0 text-xs font-semibold tracking-[0.13em] text-primary uppercase">
                Item details
              </p>
              <h2 className="mt-2 mb-0 font-serif text-2xl">Plan your pace</h2>
            </div>
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              Soft target
            </span>
          </div>

          {variant === "A" && <WarmBookplate />}
          {variant === "B" && <EditorialLedger />}
          {variant === "C" && <MilestoneCard />}
          {variant === "D" && <WarmMilestoneHybrid />}

          <div className="mt-8 border-t pt-6">
            <p className="m-0 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Status
            </p>
            <button className="mt-2 flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-left text-sm">
              In progress{" "}
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </div>
        </aside>
      </div>

      {import.meta.env.DEV && (
        <PrototypeSwitcher current={variant} onChange={chooseVariant} />
      )}
    </main>
  );
}

function WarmBookplate() {
  return (
    <DatePickerDemo
      variant="A"
      label="Target date"
      hint="A quiet, tactile field with a warm calendar surface."
      fieldClass="rounded-xl border border-primary/25 bg-quiet-panel px-3.5 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-card)_90%,transparent),0_5px_16px_color-mix(in_oklab,var(--color-primary)_8%,transparent)] focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-ring/15"
      inputClass="h-12 font-medium"
      iconClass="rounded-lg bg-primary/10 text-primary"
      panelClass="rounded-xl border-primary/20 bg-popover p-3 shadow-[var(--shadow-floating)]"
      header={
        <div className="mb-3 flex items-center justify-between rounded-lg bg-accent/55 px-2 py-1.5">
          <NavButton>
            <ChevronLeft />
          </NavButton>
          <div className="text-center">
            <p className="m-0 font-serif text-base font-semibold">
              August 2026
            </p>
            <p className="m-0 text-[0.62rem] tracking-[0.12em] text-muted-foreground uppercase">
              Choose a day
            </p>
          </div>
          <NavButton>
            <ChevronRight />
          </NavButton>
        </div>
      }
      dayClass="rounded-lg border border-border/55 hover:border-primary/50 hover:bg-accent"
      selectedClass="!border-primary !bg-primary !font-semibold !text-primary-foreground shadow-sm"
      todayClass="after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary"
      footer={
        <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs">
          <span className="text-muted-foreground">Soft, never a deadline</span>
          <button className="font-semibold text-primary">Today</button>
        </div>
      }
    />
  );
}

function EditorialLedger() {
  return (
    <DatePickerDemo
      variant="B"
      label="Target date"
      hint="Less container, more editorial rhythm and typography."
      fieldClass="border-b-2 border-input px-0 focus-within:border-primary"
      inputClass="h-12 font-serif text-lg"
      iconClass="text-primary"
      panelClass="rounded-sm border-x-0 border-y-2 bg-popover px-4 py-3 shadow-[var(--shadow-floating)]"
      header={
        <div className="mb-3 flex items-end justify-between border-b pb-3">
          <div>
            <p className="m-0 text-[0.62rem] font-semibold tracking-[0.16em] text-primary uppercase">
              Calendar
            </p>
            <p className="mt-1 mb-0 font-serif text-xl">
              August <i className="font-normal">2026</i>
            </p>
          </div>
          <div className="flex gap-1">
            <NavButton>
              <ChevronLeft />
            </NavButton>
            <NavButton>
              <ChevronRight />
            </NavButton>
          </div>
        </div>
      }
      gridClass="gap-y-0"
      weekClass="border-b border-border/55"
      dayClass="rounded-none border-b-2 border-transparent hover:bg-accent"
      selectedClass="!border-primary !font-bold !text-primary"
      todayClass="font-semibold after:absolute after:top-1 after:right-1 after:size-1 after:rounded-full after:bg-primary"
      footer={
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          Type or choose · Enter to save
          <span className="h-px flex-1 bg-border" />
        </div>
      }
    />
  );
}

function MilestoneCard() {
  return (
    <DatePickerDemo
      variant="C"
      label="Target date"
      hint="A more expressive target moment with useful context."
      fieldClass="rounded-xl border border-primary/30 bg-gradient-to-br from-accent/75 to-card px-2.5 py-2 shadow-sm focus-within:ring-3 focus-within:ring-ring/20"
      inputClass="h-12 font-semibold"
      iconClass="rounded-lg bg-primary text-primary-foreground"
      prefix={
        <div className="grid min-w-11 place-items-center self-stretch rounded-lg bg-card/80 px-2 text-center shadow-sm">
          <span className="text-[0.58rem] font-bold tracking-widest text-primary uppercase">
            Aug
          </span>
          <strong className="-mt-1 font-serif text-xl">27</strong>
        </div>
      }
      panelClass="overflow-hidden rounded-2xl border-primary/25 bg-popover p-0 shadow-[var(--shadow-floating)]"
      header={
        <div className="bg-primary px-4 py-3 text-primary-foreground">
          <div className="flex items-center justify-between">
            <NavButton inverse>
              <ChevronLeft />
            </NavButton>
            <p className="m-0 font-serif text-lg font-semibold">August 2026</p>
            <NavButton inverse>
              <ChevronRight />
            </NavButton>
          </div>
          <p className="mt-1 mb-0 text-center text-[0.68rem] opacity-80">
            Choose a gentle target for this Item
          </p>
        </div>
      }
      calendarClass="p-3"
      dayClass="rounded-full hover:bg-accent"
      selectedClass="!bg-primary !font-bold !text-primary-foreground ring-4 ring-primary/12"
      todayClass="border border-primary/45 font-semibold"
      footer={
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-xs text-accent-foreground">
          <Sparkles className="size-3.5 shrink-0" />
          <span>
            <strong>27 August</strong> · 10 days from Today
          </span>
        </div>
      }
    />
  );
}

function WarmMilestoneHybrid() {
  return (
    <DatePickerDemo
      variant="D"
      label="Target date"
      hint="The expressive milestone field, grounded by tactile day tiles."
      fieldClass="rounded-xl border border-primary/35 bg-gradient-to-br from-accent/75 via-card to-quiet-panel px-2.5 py-2 shadow-[0_5px_16px_color-mix(in_oklab,var(--color-primary)_9%,transparent)] focus-within:border-primary/70 focus-within:ring-3 focus-within:ring-ring/20"
      inputClass="h-12 font-semibold"
      iconClass="rounded-lg bg-primary text-primary-foreground shadow-sm"
      prefix={
        <div className="grid min-w-11 place-items-center self-stretch rounded-lg border border-primary/15 bg-card/90 px-2 text-center shadow-sm">
          <span className="text-[0.58rem] font-bold tracking-widest text-primary uppercase">
            Aug
          </span>
          <strong className="-mt-1 font-serif text-xl">27</strong>
        </div>
      }
      panelClass="overflow-hidden rounded-2xl border-primary/25 bg-popover p-0 shadow-[var(--shadow-floating)]"
      header={
        <div className="bg-primary px-3 py-3 text-primary-foreground">
          <div className="flex items-center justify-between">
            <NavButton inverse>
              <ChevronLeft />
            </NavButton>
            <div className="text-center">
              <p className="m-0 font-serif text-lg font-semibold">
                August 2026
              </p>
              <p className="m-0 text-[0.61rem] tracking-[0.13em] opacity-75 uppercase">
                Choose a soft target
              </p>
            </div>
            <NavButton inverse>
              <ChevronRight />
            </NavButton>
          </div>
        </div>
      }
      calendarClass="p-3"
      dayClass="rounded-lg border border-border/60 shadow-[0_1px_0_color-mix(in_oklab,var(--color-border)_32%,transparent)] hover:border-primary/55 hover:bg-accent"
      selectedClass="!border-primary !bg-primary !font-bold !text-primary-foreground ring-3 ring-primary/12"
      todayClass="after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary"
      footer={
        <div className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-lg bg-accent/70 px-3 py-2 text-xs text-accent-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5 shrink-0" />
            <strong>27 August</strong>
          </span>
          <span className="text-muted-foreground">10 days away</span>
        </div>
      }
    />
  );
}

interface DatePickerDemoProps {
  variant: Variant;
  label: string;
  hint: string;
  fieldClass: string;
  inputClass: string;
  iconClass: string;
  panelClass: string;
  header: React.ReactNode;
  dayClass: string;
  selectedClass: string;
  todayClass: string;
  footer: React.ReactNode;
  prefix?: React.ReactNode;
  calendarClass?: string;
  gridClass?: string;
  weekClass?: string;
}

function DatePickerDemo(props: DatePickerDemoProps) {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState(27);
  const [draft, setDraft] = useState("27/08/2026");
  const rootRef = useRef<HTMLDivElement>(null);
  const weeks = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) =>
        days.slice(index * 7, index * 7 + 7),
      ),
    [],
  );

  useEffect(() => {
    function dismiss(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <section>
      <label
        className="text-sm font-semibold"
        htmlFor={`prototype-date-${props.variant}`}
      >
        {props.label}
      </label>
      <p className="mt-1 mb-3 text-xs leading-5 text-muted-foreground">
        {props.hint}
      </p>
      <div ref={rootRef} className="relative">
        <div
          className={`flex items-center gap-2 transition ${props.fieldClass}`}
        >
          {props.prefix}
          <input
            id={`prototype-date-${props.variant}`}
            value={draft}
            inputMode="numeric"
            aria-expanded={open}
            aria-haspopup="dialog"
            className={`min-w-0 flex-1 border-0 bg-transparent px-1 outline-none ${props.inputClass}`}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(event) => setDraft(event.target.value)}
          />
          <span
            className={`grid size-9 shrink-0 place-items-center ${props.iconClass}`}
            aria-hidden="true"
          >
            <CalendarDays className="size-4" />
          </span>
        </div>

        {open && (
          <div
            role="dialog"
            aria-label="Choose date"
            className={`absolute top-[calc(100%+0.5rem)] left-0 z-20 w-[18.5rem] max-w-[calc(100vw-3rem)] border ${props.panelClass}`}
          >
            {props.header}
            <div className={props.calendarClass}>
              <div className="grid grid-cols-7 text-center text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                {weekdays.map((day, index) => (
                  <span key={`${day}-${index}`} className="py-1.5">
                    {day}
                  </span>
                ))}
              </div>
              <div className={`grid gap-1 ${props.gridClass ?? ""}`}>
                {weeks.map((week, weekIndex) => (
                  <div
                    key={weekIndex}
                    className={`grid grid-cols-7 gap-1 py-0.5 ${props.weekClass ?? ""}`}
                  >
                    {week.map((day, dayIndex) => {
                      const outside = weekIndex === 0 && day > 20;
                      const today = day === 17 && !outside;
                      const chosen = day === selected && !outside;
                      return (
                        <button
                          key={`${weekIndex}-${dayIndex}`}
                          type="button"
                          className={`relative grid aspect-square place-items-center text-xs transition ${props.dayClass} ${outside ? "text-muted-foreground/35" : ""} ${today ? props.todayClass : ""} ${chosen ? props.selectedClass : ""}`}
                          onClick={() => {
                            if (outside) return;
                            setSelected(day);
                            setDraft(`${String(day).padStart(2, "0")}/08/2026`);
                            setOpen(false);
                          }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            {props.footer}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="size-3.5 text-primary" /> Click or focus anywhere in
        the field to open
      </div>
    </section>
  );
}

function NavButton({
  children,
  inverse = false,
}: {
  children: React.ReactNode;
  inverse?: boolean;
}) {
  return (
    <button
      type="button"
      className={`grid size-8 place-items-center rounded-lg transition [&_svg]:size-4 ${inverse ? "hover:bg-white/15" : "hover:bg-accent"}`}
    >
      {children}
    </button>
  );
}

function ContextStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 [&_svg]:size-5 [&_svg]:text-primary">
      <span className="grid size-10 place-items-center rounded-full bg-accent">
        {icon}
      </span>
      <div>
        <p className="m-0 text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 mb-0 text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: Variant;
  onChange: (variant: Variant) => void;
}) {
  const index = variants.indexOf(current);
  return (
    <nav
      aria-label="Prototype variants"
      className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-zinc-950 px-2 py-2 text-white shadow-2xl"
    >
      <button
        type="button"
        aria-label="Previous variant"
        className="grid size-8 place-items-center rounded-full hover:bg-white/15"
        onClick={() =>
          onChange(variants[(index - 1 + variants.length) % variants.length])
        }
      >
        <ArrowLeft className="size-4" />
      </button>
      <span className="min-w-44 px-2 text-center text-xs font-semibold">
        {current} — {variantNames[current]}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        className="grid size-8 place-items-center rounded-full hover:bg-white/15"
        onClick={() => onChange(variants[(index + 1) % variants.length])}
      >
        <ArrowRight className="size-4" />
      </button>
    </nav>
  );
}

function readVariant(): Variant {
  const value = new URLSearchParams(window.location.search).get("variant");
  return value === "B" || value === "C" || value === "D" ? value : "A";
}

function readDarkAppearance(): boolean {
  return new URLSearchParams(window.location.search).get("theme") === "dark";
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");
createRoot(rootElement).render(<DatePickerPolishPrototype />);
