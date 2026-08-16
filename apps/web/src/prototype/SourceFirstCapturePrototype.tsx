/**
 * PROTOTYPE — throw away after issue #402 is resolved.
 * Three Source-first Capture treatments, switchable via `?variant=`, in the
 * existing global non-navigating overlay frame.
 */
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileText,
  Link2,
  LoaderCircle,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "@/styles/globals.css";

type VariantKey = "A" | "B" | "C";
type ScenarioKey =
  "fast" | "partial" | "slow" | "failure" | "edit" | "replace" | "offline";
type ItemType = "article" | "video" | "playlist" | "course" | "book" | "other";
type FieldOrigin = "empty" | "suggested" | "user";
type InspectionStatus = "idle" | "inspecting" | "ready" | "partial" | "failed";

interface CaptureState {
  source: string;
  title: string;
  type: ItemType | "";
  titleOrigin: FieldOrigin;
  typeOrigin: FieldOrigin;
  status: InspectionStatus;
  progress: number;
  generation: number;
  ignoredResponse: string | null;
  submitted: boolean;
}

interface InspectionResult {
  delay: number;
  title?: string;
  type?: ItemType;
  fails?: boolean;
}

interface CaptureModel {
  state: CaptureState;
  scenario: ScenarioKey;
  setScenario: (scenario: ScenarioKey) => void;
  setSource: (source: string) => void;
  setTitle: (title: string) => void;
  setType: (type: ItemType) => void;
  retry: () => void;
  submit: () => void;
  reset: () => void;
}

const VARIANTS: ReadonlyArray<{ key: VariantKey; name: string }> = [
  { key: "A", name: "Quiet inline" },
  { key: "B", name: "Inspection receipt" },
  { key: "C", name: "Progressive composer" },
];

const SCENARIOS: ReadonlyArray<{
  key: ScenarioKey;
  label: string;
  instruction: string;
}> = [
  {
    key: "fast",
    label: "Fast complete",
    instruction: "A generic page returns a confident title and Type quickly.",
  },
  {
    key: "partial",
    label: "Type only",
    instruction: "A YouTube URL supplies only the strongly evidenced Type.",
  },
  {
    key: "slow",
    label: "Near deadline",
    instruction:
      "Inspection remains quiet and editable for almost three seconds.",
  },
  {
    key: "failure",
    label: "Failure + Retry",
    instruction:
      "The Source survives failure; Retry succeeds in this simulation.",
  },
  {
    key: "edit",
    label: "Edit in flight",
    instruction:
      "Edit the title while inspecting; the late suggestion must not overwrite it.",
  },
  {
    key: "replace",
    label: "Replace Source",
    instruction:
      "A second Source wins; the first Source's late response is ignored.",
  },
  {
    key: "offline",
    label: "Title only / offline",
    instruction:
      "No Source and no inspection: ordinary manual Capture stays intact.",
  },
];

const ITEM_TYPES: ReadonlyArray<{ value: ItemType; label: string }> = [
  { value: "article", label: "Article" },
  { value: "video", label: "Video" },
  { value: "playlist", label: "Playlist" },
  { value: "course", label: "Course" },
  { value: "book", label: "Book" },
  { value: "other", label: "Other" },
];

const EMPTY_STATE: CaptureState = {
  source: "",
  title: "",
  type: "",
  titleOrigin: "empty",
  typeOrigin: "empty",
  status: "idle",
  progress: 0,
  generation: 0,
  ignoredResponse: null,
  submitted: false,
};

function isHttpSource(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resultFor(source: string, retry = false): InspectionResult {
  if (source.includes("youtube.com")) return { delay: 620, type: "video" };
  if (source.includes("deadline")) {
    return {
      delay: 2850,
      title: "Attention Is a Skill You Can Practice",
      type: "article",
    };
  }
  if (source.includes("blocked") && !retry) return { delay: 1050, fails: true };
  if (source.includes("blocked") && retry) {
    return {
      delay: 760,
      title: "A Field Guide to Deep Reading",
      type: "article",
    };
  }
  if (source.includes("edit-in-flight")) {
    return {
      delay: 2600,
      title: "The Machine Stops — annotated edition",
      type: "article",
    };
  }
  if (source.includes("old-source")) {
    return { delay: 2400, title: "Old response", type: "course" };
  }
  if (source.includes("new-source")) {
    return { delay: 580, title: "How to Read a Paper", type: "article" };
  }
  return {
    delay: 520,
    title: "A Calm System for Capturing What You Learn",
    type: "article",
  };
}

function useCaptureModel(): CaptureModel {
  const [state, setState] = useState<CaptureState>(EMPTY_STATE);
  const [scenario, setScenarioState] = useState<ScenarioKey>("fast");
  const generationRef = useRef(0);
  const timers = useRef<Set<number>>(new Set());

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      callback();
    }, delay);
    timers.current.add(timer);
    return timer;
  }, []);

  const startInspection = useCallback(
    (source: string, options: { retry?: boolean } = {}) => {
      const generation = ++generationRef.current;
      const result = resultFor(source, options.retry);
      setState((current) => ({
        ...current,
        source,
        title: current.titleOrigin === "suggested" ? "" : current.title,
        type: current.typeOrigin === "suggested" ? "" : current.type,
        titleOrigin:
          current.titleOrigin === "suggested" ? "empty" : current.titleOrigin,
        typeOrigin:
          current.typeOrigin === "suggested" ? "empty" : current.typeOrigin,
        status: "inspecting",
        progress: 4,
        generation,
        ignoredResponse: null,
        submitted: false,
      }));

      const startedAt = performance.now();
      const tick = () => {
        if (generation !== generationRef.current) return;
        const elapsed = performance.now() - startedAt;
        setState((current) => ({
          ...current,
          progress: Math.min(
            96,
            Math.max(current.progress, (elapsed / 3000) * 100),
          ),
        }));
        if (elapsed < result.delay) schedule(tick, 90);
      };
      schedule(tick, 90);

      schedule(() => {
        if (generation !== generationRef.current) {
          setState((current) => ({
            ...current,
            ignoredResponse: `Ignored late response for ${source}`,
          }));
          return;
        }
        if (result.fails) {
          setState((current) => ({
            ...current,
            status: "failed",
            progress: 100,
          }));
          return;
        }
        setState((current) => {
          const canSuggestTitle =
            Boolean(result.title) && current.titleOrigin !== "user";
          const canSuggestType =
            Boolean(result.type) && current.typeOrigin !== "user";
          const nextTitle = canSuggestTitle
            ? (result.title ?? "")
            : current.title;
          const nextType = canSuggestType ? (result.type ?? "") : current.type;
          return {
            ...current,
            title: nextTitle,
            type: nextType,
            titleOrigin: canSuggestTitle ? "suggested" : current.titleOrigin,
            typeOrigin: canSuggestType ? "suggested" : current.typeOrigin,
            status: result.title && result.type ? "ready" : "partial",
            progress: 100,
          };
        });
      }, result.delay);
    },
    [schedule],
  );

  const replaceSource = useCallback(
    (source: string) => {
      ++generationRef.current;
      setState((current) => ({
        ...current,
        source,
        status: "idle",
        progress: 0,
        generation: generationRef.current,
        submitted: false,
      }));
      if (isHttpSource(source)) {
        schedule(() => startInspection(source), 80);
      }
    },
    [schedule, startInspection],
  );

  const chooseScenario = useCallback(
    (nextScenario: ScenarioKey) => {
      ++generationRef.current;
      setScenarioState(nextScenario);
      setState({ ...EMPTY_STATE, generation: generationRef.current });

      if (nextScenario === "offline") {
        schedule(() => {
          setState((current) => ({
            ...current,
            title: "The Design of Everyday Things",
            type: "book",
            titleOrigin: "user",
            typeOrigin: "user",
          }));
        }, 40);
        return;
      }

      const sources: Record<
        Exclude<ScenarioKey, "offline" | "replace">,
        string
      > = {
        fast: "https://example.com/calm-capture",
        partial: "https://www.youtube.com/watch?v=source-first",
        slow: "https://longreads.example/deadline",
        failure: "https://blocked.example/field-guide",
        edit: "https://slow.example/edit-in-flight",
      };

      if (nextScenario === "replace") {
        const oldSource = "https://slow.example/old-source";
        const newSource = "https://example.com/new-source";
        schedule(() => startInspection(oldSource), 40);
        schedule(() => startInspection(newSource), 620);
        return;
      }

      schedule(() => startInspection(sources[nextScenario]), 40);
    },
    [schedule, startInspection],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    chooseScenario("fast");
    return () => {
      for (const timer of activeTimers) window.clearTimeout(timer);
      activeTimers.clear();
    };
  }, [chooseScenario]);

  return {
    state,
    scenario,
    setScenario: chooseScenario,
    setSource: replaceSource,
    setTitle: (title) => {
      setState((current) => ({
        ...current,
        title,
        titleOrigin: title ? "user" : "empty",
        submitted: false,
      }));
    },
    setType: (type) => {
      setState((current) => ({
        ...current,
        type,
        typeOrigin: "user",
        submitted: false,
      }));
    },
    retry: () => startInspection(state.source, { retry: true }),
    submit: () => setState((current) => ({ ...current, submitted: true })),
    reset: () => chooseScenario(scenario),
  };
}

function readVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get("variant");
  return value === "B" || value === "C" ? value : "A";
}

function PrototypeApp() {
  const [variant, setVariantState] = useState<VariantKey>(readVariant);
  const [isOpen, setIsOpen] = useState(true);
  const model = useCaptureModel();

  const setVariant = useCallback((next: VariantKey) => {
    const search = new URLSearchParams(window.location.search);
    search.set("variant", next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${search}`,
    );
    setVariantState(next);
  }, []);

  const cycleVariant = useCallback(
    (direction: -1 | 1) => {
      const index = VARIANTS.findIndex(
        (candidate) => candidate.key === variant,
      );
      const next =
        VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length];
      if (next) setVariant(next.key);
    },
    [setVariant, variant],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") cycleVariant(-1);
      if (event.key === "ArrowRight") cycleVariant(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleVariant]);

  return (
    <div className="min-h-svh bg-background text-foreground">
      <ScenarioRail model={model} />
      <MockLibrary onCapture={() => setIsOpen(true)} />
      {isOpen && (
        <CaptureFrame onClose={() => setIsOpen(false)}>
          {variant === "A" && <VariantA model={model} />}
          {variant === "B" && <VariantB model={model} />}
          {variant === "C" && <VariantC model={model} />}
        </CaptureFrame>
      )}
      <PrototypeSwitcher
        variant={variant}
        onPrevious={() => cycleVariant(-1)}
        onNext={() => cycleVariant(1)}
      />
    </div>
  );
}

function ScenarioRail({ model }: { model: CaptureModel }) {
  const current = SCENARIOS.find((scenario) => scenario.key === model.scenario);
  return (
    <aside className="fixed inset-x-0 top-0 z-[90] border-b border-white/15 bg-foreground text-background shadow-lg">
      <div className="mx-auto flex min-h-12 max-w-[90rem] items-center gap-3 overflow-x-auto px-3 py-2 sm:px-5">
        <span className="shrink-0 text-[0.68rem] font-bold tracking-[0.14em] uppercase opacity-65">
          Prototype
        </span>
        <label className="sr-only" htmlFor="prototype-scenario">
          Scenario
        </label>
        <div className="relative shrink-0">
          <select
            id="prototype-scenario"
            value={model.scenario}
            onChange={(event) =>
              model.setScenario(event.target.value as ScenarioKey)
            }
            className="h-8 appearance-none rounded-md border border-white/20 bg-white/10 pr-8 pl-3 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {SCENARIOS.map((scenario) => (
              <option
                key={scenario.key}
                value={scenario.key}
                className="text-black"
              >
                {scenario.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-2 right-2 size-4" />
        </div>
        <p className="m-0 min-w-[17rem] flex-1 truncate text-xs opacity-75 sm:text-sm">
          {current?.instruction}
        </p>
        <details className="group relative shrink-0">
          <summary className="cursor-pointer list-none rounded px-2 py-1 text-xs font-semibold hover:bg-white/10">
            State
          </summary>
          <pre className="absolute top-9 right-0 max-h-[70dvh] w-[min(28rem,calc(100vw-1.5rem))] overflow-auto rounded-lg border border-white/20 bg-foreground p-3 text-[0.68rem] leading-relaxed text-background shadow-2xl">
            {JSON.stringify(model.state, null, 2)}
          </pre>
        </details>
      </div>
    </aside>
  );
}

function MockLibrary({ onCapture }: { onCapture: () => void }) {
  return (
    <div className="pt-12" aria-hidden="true">
      <header className="sticky top-12 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[80rem] items-center gap-5 px-4 md:px-6">
          <span className="font-serif text-xl font-bold">unshelf</span>
          <nav className="hidden gap-1 text-sm text-muted-foreground sm:flex">
            <span className="rounded px-3 py-2">Today</span>
            <span className="rounded px-3 py-2">Discover</span>
            <span className="rounded bg-accent px-3 py-2 font-semibold text-accent-foreground">
              Library
            </span>
            <span className="rounded px-3 py-2">Plans</span>
          </nav>
          <Button className="ml-auto" size="compact" onClick={onCapture}>
            <Plus /> Capture
          </Button>
          <span className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-bold">
            RG
          </span>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:px-6">
        <div className="border-b pb-6">
          <p className="mb-1 text-xs font-bold tracking-[0.12em] text-primary uppercase">
            Your collection
          </p>
          <h1 className="m-0 font-serif text-4xl font-semibold">Library</h1>
          <p className="mt-2 text-muted-foreground">
            A passive catalog of every Item, whether committed or not.
          </p>
        </div>
        <div className="grid gap-3 opacity-70">
          {[
            "Designing Data-Intensive Applications",
            "How to Take Smart Notes",
            "The Art of Learning",
          ].map((title, index) => (
            <div
              key={title}
              className="flex items-center gap-4 rounded-xl border bg-card p-4"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-muted">
                {index === 1 ? (
                  <FileText className="size-4" />
                ) : (
                  <BookOpen className="size-4" />
                )}
              </span>
              <div>
                <p className="m-0 font-semibold">{title}</p>
                <p className="m-0 text-sm text-muted-foreground">Not started</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function CaptureFrame({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/25 px-4 pt-20 pb-24 backdrop-blur-[1px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="prototype-capture-title"
        className="relative my-auto max-h-[calc(100dvh-11rem)] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-panel)] border bg-popover text-popover-foreground shadow-[var(--shadow-floating)]"
      >
        <Button
          type="button"
          variant="quiet"
          size="icon"
          onClick={onClose}
          className="absolute top-3 right-3 z-10"
        >
          <X /> <span className="sr-only">Close Capture</span>
        </Button>
        {children}
      </section>
    </div>
  );
}

function VariantA({ model }: { model: CaptureModel }) {
  const { state } = model;
  return (
    <div className="grid gap-5 p-5 sm:p-7">
      <CaptureHeading eyebrow="A · Quiet inline" />
      <div className="grid gap-5">
        <div className="rounded-xl border-2 border-primary/25 bg-card p-3 shadow-sm focus-within:border-primary/60">
          <SourceField model={model} autoFocus />
        </div>
        <InlineInspectionStatus model={model} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <TitleField model={model} />
          <TypeSelect model={model} />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <AddButton model={model} />
          <p className="m-0 text-xs text-muted-foreground">
            Suggestions stay editable. Source is stored exactly as pasted.
          </p>
        </div>
        {state.submitted && <SubmittedNotice />}
      </div>
    </div>
  );
}

function VariantB({ model }: { model: CaptureModel }) {
  const { state } = model;
  return (
    <div className="grid sm:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
      <div className="grid content-start gap-5 border-b p-5 sm:border-r sm:border-b-0 sm:p-7">
        <CaptureHeading eyebrow="B · Inspection receipt" />
        <SourceField model={model} autoFocus />
        <InspectionReceipt model={model} />
      </div>
      <div className="grid content-start gap-5 bg-quiet-panel/55 p-5 sm:p-7">
        <div>
          <p className="m-0 text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Confirm Item
          </p>
          <p className="mt-1 mb-0 text-sm text-muted-foreground">
            One final look before it joins the Library.
          </p>
        </div>
        <TitleField model={model} />
        <TypeSelect model={model} />
        <AddButton model={model} className="w-full" />
        {state.submitted && <SubmittedNotice />}
      </div>
    </div>
  );
}

function VariantC({ model }: { model: CaptureModel }) {
  const { state } = model;
  const hasSource = state.source.length > 0;
  return (
    <div className="grid gap-0">
      <div className="grid gap-5 p-5 sm:p-7">
        <CaptureHeading eyebrow="C · Progressive composer" />
        <div className="rounded-xl border-2 border-primary/25 bg-card p-3 shadow-sm focus-within:border-primary/60">
          <label
            className="flex items-center gap-2 text-xs font-bold tracking-[0.1em] text-primary uppercase"
            htmlFor="capture-source-c"
          >
            <Link2 className="size-4" /> Start with a Source
          </label>
          <Input
            id="capture-source-c"
            value={state.source}
            onChange={(event) => model.setSource(event.target.value)}
            placeholder="Paste a public link"
            autoFocus
            className="mt-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          />
          {!hasSource && (
            <p className="mt-1 mb-0 text-xs text-muted-foreground">
              No link? Keep going below for a book or other offline Item.
            </p>
          )}
          {hasSource && <CompactInspectionLine model={model} />}
        </div>
      </div>
      <div className="grid gap-5 border-t bg-quiet-panel/45 p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <PencilLine className="size-4 text-muted-foreground" />
          <p className="m-0 text-sm font-semibold">Review the Item</p>
          {state.status === "ready" && (
            <Badge variant="current">Suggested</Badge>
          )}
        </div>
        <TitleField model={model} />
        <TypePills model={model} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="quiet"
            size="compact"
            onClick={model.reset}
          >
            Clear
          </Button>
          <AddButton model={model} />
        </div>
        {state.submitted && <SubmittedNotice />}
      </div>
    </div>
  );
}

function CaptureHeading({ eyebrow }: { eyebrow: string }) {
  return (
    <header className="pr-10">
      <p className="m-0 text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
        {eyebrow}
      </p>
      <h1
        id="prototype-capture-title"
        className="mt-1 mb-0 font-serif text-2xl font-semibold"
      >
        Capture
      </h1>
      <p className="mt-1 mb-0 text-sm leading-relaxed text-muted-foreground">
        New Items land in your Library — never directly in a Learning Plan.
      </p>
    </header>
  );
}

function SourceField({
  model,
  autoFocus = false,
}: {
  model: CaptureModel;
  autoFocus?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span className="flex items-center gap-2">
        Source{" "}
        <span className="font-normal text-muted-foreground">Optional</span>
      </span>
      <Input
        value={model.state.source}
        onChange={(event) => model.setSource(event.target.value)}
        placeholder="Paste a public link"
        autoFocus={autoFocus}
      />
      <span className="text-xs leading-relaxed font-normal text-muted-foreground">
        Inspection begins when the Source is a public HTTP(S) link.
      </span>
    </label>
  );
}

function TitleField({ model }: { model: CaptureModel }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span className="flex items-center gap-2">
        Title
        {model.state.titleOrigin === "suggested" && (
          <span className="text-xs font-normal text-primary">Suggested</span>
        )}
        {model.state.titleOrigin === "user" &&
          model.state.status === "inspecting" && (
            <span className="text-xs font-normal text-muted-foreground">
              Your edit is safe
            </span>
          )}
      </span>
      <Input
        value={model.state.title}
        onChange={(event) => model.setTitle(event.target.value)}
        placeholder="What did you find?"
      />
    </label>
  );
}

function TypeSelect({ model }: { model: CaptureModel }) {
  return (
    <label className="grid content-start gap-1.5 text-sm font-semibold">
      <span className="flex items-center gap-2">
        Type
        {model.state.typeOrigin === "suggested" && (
          <span className="text-xs font-normal text-primary">Suggested</span>
        )}
      </span>
      <Select
        value={model.state.type}
        onValueChange={(value) => model.setType(value as ItemType)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a Type…" />
        </SelectTrigger>
        <SelectContent>
          {ITEM_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function TypePills({ model }: { model: CaptureModel }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold">
        Type{" "}
        {model.state.typeOrigin === "suggested" && (
          <span className="font-normal text-primary">· Suggested</span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">
        {ITEM_TYPES.map((type) => {
          const active = model.state.type === type.value;
          return (
            <button
              key={type.value}
              type="button"
              aria-pressed={active}
              onClick={() => model.setType(type.value)}
              className={`min-h-10 rounded-full border px-3 text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {active && <Check className="mr-1 inline size-3.5" />}
              {type.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function InlineInspectionStatus({ model }: { model: CaptureModel }) {
  const { state } = model;
  if (state.status === "idle") return null;
  return (
    <div className="grid gap-2 rounded-lg bg-quiet-panel px-3 py-2.5 text-sm">
      <CompactInspectionLine model={model} />
      {state.status === "inspecting" && <Progress value={state.progress} />}
    </div>
  );
}

function CompactInspectionLine({ model }: { model: CaptureModel }) {
  const { state } = model;
  if (state.status === "inspecting") {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        Inspecting Source…{" "}
        <span className="ml-auto tabular-nums">
          {Math.min(3, state.progress * 0.03).toFixed(1)}s
        </span>
      </div>
    );
  }
  if (state.status === "failed") {
    return (
      <div
        className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <CircleAlert className="size-4" /> Couldn&apos;t inspect this Source.
        <Button
          type="button"
          variant="quiet"
          size="compact"
          className="h-auto p-0 underline underline-offset-4"
          onClick={model.retry}
        >
          <RefreshCw className="size-3.5" /> Retry
        </Button>
      </div>
    );
  }
  if (state.status === "partial") {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Check className="size-4 text-primary" /> Added what we could find.
        Complete the rest.
      </div>
    );
  }
  if (state.status === "ready") {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Sparkles className="size-4 text-primary" /> Title and Type suggested.
        Edit anything.
      </div>
    );
  }
  return null;
}

function InspectionReceipt({ model }: { model: CaptureModel }) {
  const { state } = model;
  const ready = state.status === "ready" || state.status === "partial";
  return (
    <div className="grid min-h-36 content-start gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">
          Source inspection
        </span>
        {state.status === "inspecting" && (
          <Badge variant="progress">
            <Clock3 /> Up to 3s
          </Badge>
        )}
        {ready && (
          <Badge variant="completed">
            <Check /> Complete
          </Badge>
        )}
        {state.status === "failed" && (
          <Badge>
            <CircleAlert /> Unavailable
          </Badge>
        )}
      </div>
      {state.status === "idle" && (
        <p className="m-0 text-sm text-muted-foreground">
          Paste a Source, or fill the Item manually.
        </p>
      )}
      {state.status === "inspecting" && (
        <>
          <p className="m-0 text-sm">
            Looking for a useful title and strong Type evidence…
          </p>
          <Progress value={state.progress} />
          <p className="m-0 text-xs text-muted-foreground">
            You can edit the Item while this runs.
          </p>
        </>
      )}
      {ready && (
        <div className="grid gap-2 text-sm">
          <p className="m-0 text-muted-foreground">
            {state.status === "partial"
              ? "Some details need you."
              : "Suggestions are already in the confirmation fields."}
          </p>
          {state.title && <p className="m-0 font-semibold">{state.title}</p>}
          {state.type && <Badge variant="current">{state.type}</Badge>}
        </div>
      )}
      {state.status === "failed" && (
        <div className="grid justify-items-start gap-2">
          <p className="m-0 text-sm text-muted-foreground">
            Nothing was changed. Manual Capture is ready.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={model.retry}
          >
            <RefreshCw /> Retry inspection
          </Button>
        </div>
      )}
    </div>
  );
}

function AddButton({
  model,
  className,
}: {
  model: CaptureModel;
  className?: string;
}) {
  const disabled =
    model.state.title.trim().length === 0 || model.state.type === "";
  return (
    <Button
      type="button"
      size="touch"
      disabled={disabled}
      onClick={model.submit}
      className={className}
    >
      Add to Library
    </Button>
  );
}

function SubmittedNotice() {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-status-completed/40 bg-status-completed/10 px-3 py-2 text-sm"
      role="status"
    >
      <Check className="size-4 text-status-completed" /> Prototype confirmation:
      this Item would now join the Library.
    </div>
  );
}

function PrototypeSwitcher({
  variant,
  onPrevious,
  onNext,
}: {
  variant: VariantKey;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const current = VARIANTS.find((candidate) => candidate.key === variant);
  return (
    <nav
      aria-label="Prototype variants"
      className="fixed bottom-4 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-foreground px-2 py-1.5 text-background shadow-2xl"
    >
      <button
        type="button"
        onClick={onPrevious}
        className="grid size-9 place-items-center rounded-full hover:bg-white/10"
      >
        <ArrowLeft className="size-4" />{" "}
        <span className="sr-only">Previous variant</span>
      </button>
      <span className="min-w-40 text-center text-sm font-semibold">
        {current?.key} — {current?.name}
      </span>
      <button
        type="button"
        onClick={onNext}
        className="grid size-9 place-items-center rounded-full hover:bg-white/10"
      >
        <ArrowRight className="size-4" />{" "}
        <span className="sr-only">Next variant</span>
      </button>
    </nav>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Prototype root was not found");

createRoot(root).render(
  <StrictMode>
    <PrototypeApp />
  </StrictMode>,
);
