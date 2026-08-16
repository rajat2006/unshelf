/**
 * PROTOTYPE — throw away after deciding the Daily Project Digest presentation.
 * Three Discord-message variants, switchable via `?variant=`, with review cases
 * selected by `?day=` and AI/fallback wording selected by `?copy=`.
 */
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  GitPullRequest,
  Link as LinkIcon,
  PackageCheck,
  Rocket,
  Sparkles,
  Wrench,
} from "lucide-react";
import "./daily-project-digest-prototype.css";

const variants = ["A", "B", "C"] as const;
const dayKeys = ["typical", "quiet", "blocked", "released", "volume"] as const;
const copyKeys = ["ai", "fallback"] as const;

type VariantKey = (typeof variants)[number];
type DayKey = (typeof dayKeys)[number];
type CopyKey = (typeof copyKeys)[number];
type Status = "released" | "completed" | "blocked" | "progress" | "maintenance";

type DigestItem = {
  title: string;
  fallback: string;
  url: string;
  status: Status;
  maintenanceStatus?: Exclude<Status, "maintenance">;
};

type DigestDay = {
  label: string;
  date: string;
  window: string;
  items: DigestItem[];
  overflow?: Partial<Record<Status, number>>;
};

const statusMeta = {
  released: {
    label: "Released",
    explanation: "Live in production",
    Icon: Rocket,
    color: "#57f287",
  },
  completed: {
    label: "Completed",
    explanation: "Merged and ready for a release",
    Icon: Check,
    color: "#23a55a",
  },
  blocked: {
    label: "Blocked",
    explanation: "Needs attention before work can continue",
    Icon: AlertTriangle,
    color: "#f0b232",
  },
  progress: {
    label: "In progress",
    explanation: "Actively moving forward",
    Icon: CircleDot,
    color: "#5865f2",
  },
  maintenance: {
    label: "Internal maintenance",
    explanation: "Work that keeps the project healthy",
    Icon: Wrench,
    color: "#949ba4",
  },
} satisfies Record<
  Status,
  { label: string; explanation: string; Icon: typeof Rocket; color: string }
>;

const ai = (
  title: string,
  fallback: string,
  status: Status,
  number: number,
): DigestItem => ({
  title,
  fallback,
  status,
  url: `https://github.com/rajat2006/unshelf/pull/${number}`,
});

const maintenance = (
  title: string,
  fallback: string,
  maintenanceStatus: Exclude<Status, "maintenance">,
  number: number,
): DigestItem => ({
  title,
  fallback,
  status: "maintenance",
  maintenanceStatus,
  url: `https://github.com/rajat2006/unshelf/pull/${number}`,
});

const typicalItems: DigestItem[] = [
  ai(
    "Today view now keeps your confirmed priorities calm and focused.",
    "Calm, selective suggestions in Today was released.",
    "released",
    396,
  ),
  ai(
    "Capture can now start from a source before you decide where it belongs.",
    "Source-first Capture was merged into dev.",
    "completed",
    418,
  ),
  ai(
    "The team is shaping a nightly project update for Discord.",
    "Daily Project Digest planning is in progress.",
    "progress",
    424,
  ),
  maintenance(
    "The API now reports failures consistently without leaking sensitive details.",
    "Production API failure logging was merged into dev.",
    "completed",
    388,
  ),
];

const blockedItems: DigestItem[] = [
  ai(
    "Sign-in work is waiting on a Clerk production-domain decision.",
    "Production authentication is blocked by an open dependency.",
    "blocked",
    421,
  ),
  ai(
    "A quieter daily-focus history is being refined in parallel.",
    "Daily-focus history is in progress.",
    "progress",
    415,
  ),
  maintenance(
    "Deployment automation is paused until registry credentials are provisioned.",
    "Deployment automation is blocked by needs-info.",
    "blocked",
    417,
  ),
];

const releasedItems: DigestItem[] = [
  ai(
    "You can now capture an idea before deciding which plan should hold it.",
    "Source-first Capture was released.",
    "released",
    418,
  ),
  ai(
    "Today now protects confirmed priorities from suggestion churn.",
    "Calm, selective suggestions in Today was released.",
    "released",
    396,
  ),
  ai(
    "Learning plans now make the next useful action easier to spot.",
    "Learning-plan action cues were released.",
    "released",
    382,
  ),
  maintenance(
    "Production diagnostics now make failed requests easier to trace safely.",
    "Production diagnostics were released.",
    "released",
    388,
  ),
];

const volumeItems: DigestItem[] = [
  ...Array.from({ length: 10 }, (_, index) =>
    ai(
      `Project improvement ${index + 1} is now ready for the next release.`,
      `Project improvement ${index + 1} was merged into dev.`,
      "completed",
      501 + index,
    ),
  ),
  ...Array.from({ length: 10 }, (_, index) =>
    ai(
      `Active workstream ${index + 1} is moving toward its next decision.`,
      `Active workstream ${index + 1} is in progress.`,
      "progress",
      521 + index,
    ),
  ),
  ...Array.from({ length: 4 }, (_, index) =>
    maintenance(
      `Maintenance improvement ${index + 1} keeps delivery predictable.`,
      `Maintenance improvement ${index + 1} is in progress.`,
      "progress",
      541 + index,
    ),
  ),
];

const days: Record<DayKey, DigestDay> = {
  typical: {
    label: "Typical day",
    date: "Sunday, 16 August",
    window: "Since yesterday’s successful update",
    items: typicalItems,
  },
  quiet: {
    label: "Quiet day",
    date: "Monday, 17 August",
    window: "Since yesterday’s successful update",
    items: [],
  },
  blocked: {
    label: "Blocked day",
    date: "Tuesday, 18 August",
    window: "Since yesterday’s successful update",
    items: blockedItems,
  },
  released: {
    label: "Release day",
    date: "Wednesday, 19 August",
    window: "Since yesterday’s successful update",
    items: releasedItems,
  },
  volume: {
    label: "High-volume day",
    date: "Thursday, 20 August",
    window: "Since yesterday’s successful update",
    items: volumeItems,
    overflow: { completed: 4, progress: 7 },
  },
};

const variantNames: Record<VariantKey, string> = {
  A: "Lifecycle briefing",
  B: "Status stack",
  C: "Human-first pulse",
};

const statusOrder: Status[] = [
  "released",
  "completed",
  "blocked",
  "progress",
  "maintenance",
];

function authoritativeStatus(item: DigestItem): Exclude<Status, "maintenance"> {
  return item.status === "maintenance"
    ? (item.maintenanceStatus ?? "progress")
    : item.status;
}

function digestHeadline(day: DigestDay) {
  const count = (statuses: Array<Exclude<Status, "maintenance">>) =>
    day.items.filter((item) => statuses.includes(authoritativeStatus(item)))
      .length +
    statuses.reduce(
      (total, status) => total + (day.overflow?.[status] ?? 0),
      0,
    );
  const blocked = count(["blocked"]);
  const changed = count(["released", "completed"]);
  const moving = count(["progress"]);

  if (blocked > 0) {
    return `${blocked} item${blocked === 1 ? " needs" : "s need"} attention; ${moving} ${moving === 1 ? "effort is" : "efforts are"} still moving.`;
  }
  if (changed > 0) {
    return `${changed} meaningful change${changed === 1 ? "" : "s"} landed; ${moving} ${moving === 1 ? "effort is" : "efforts are"} underway.`;
  }
  return `${moving} ${moving === 1 ? "effort is" : "efforts are"} moving forward.`;
}

function getParam<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = new URLSearchParams(window.location.search).get(name);
  return allowed.includes(candidate as T) ? (candidate as T) : fallback;
}

function updateParams(next: Record<string, string>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(next)) {
    url.searchParams.set(key, value);
  }
  window.history.replaceState({}, "", url);
}

function itemCopy(item: DigestItem, copy: CopyKey) {
  return copy === "ai" ? item.title : item.fallback;
}

function effectiveStatus(item: DigestItem, copy: CopyKey): Status {
  if (copy === "fallback" && item.status === "maintenance") {
    return item.maintenanceStatus ?? "progress";
  }
  return item.status;
}

function itemsFor(day: DigestDay, status: Status, copy: CopyKey) {
  return day.items.filter((item) => effectiveStatus(item, copy) === status);
}

function SourceItem({
  item,
  copy,
  compact = false,
}: {
  item: DigestItem;
  copy: CopyKey;
  compact?: boolean;
}) {
  return (
    <li
      className={compact ? "source-item source-item--compact" : "source-item"}
    >
      {copy === "ai" && item.maintenanceStatus ? (
        <span className={`mini-status mini-status--${item.maintenanceStatus}`}>
          {statusMeta[item.maintenanceStatus].label}
        </span>
      ) : null}
      <a href={item.url} target="_blank" rel="noreferrer">
        {itemCopy(item, copy)} <ExternalLink aria-hidden="true" size={12} />
      </a>
    </li>
  );
}

function Overflow({ count, status }: { count: number; status: Status }) {
  return (
    <a
      className="overflow-link"
      href={`https://github.com/rajat2006/unshelf/pulls?q=is%3Apr+${status}`}
      target="_blank"
      rel="noreferrer"
    >
      + {count} more on GitHub <ArrowRight aria-hidden="true" size={12} />
    </a>
  );
}

function QuietMessage({
  day,
  compact = false,
}: {
  day: DigestDay;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact ? "quiet-message quiet-message--compact" : "quiet-message"
      }
    >
      <span aria-hidden="true">🌙</span>
      <div>
        <strong>Quiet day for Unshelf</strong>
        <p>No project updates to report {day.window.toLowerCase()}.</p>
      </div>
    </div>
  );
}

function VariantA({ day, copy }: { day: DigestDay; copy: CopyKey }) {
  if (day.items.length === 0) return <QuietMessage day={day} />;

  return (
    <div className="embed embed--briefing">
      <div className="embed-accent" />
      <div className="embed-body">
        <header className="briefing-header">
          <div className="digest-mark">
            <Bot aria-hidden="true" size={18} />
          </div>
          <div>
            <h2>Daily Project Digest</h2>
            <p>
              {day.date} · {day.window}
            </p>
          </div>
        </header>
        <p className="briefing-headline">{digestHeadline(day)}</p>
        <div className="briefing-grid">
          {statusOrder.map((status) => {
            const items = itemsFor(day, status, copy);
            if (items.length === 0) return null;
            const meta = statusMeta[status];
            return (
              <section className="briefing-section" key={status}>
                <h3 style={{ color: meta.color }}>
                  <meta.Icon aria-hidden="true" size={15} /> {meta.label}
                </h3>
                <p className="section-explanation">{meta.explanation}</p>
                <ul>
                  {items.map((item) => (
                    <SourceItem item={item} copy={copy} key={item.url} />
                  ))}
                </ul>
                {day.overflow?.[status] ? (
                  <Overflow count={day.overflow[status]} status={status} />
                ) : null}
              </section>
            );
          })}
        </div>
        <footer>
          <GitPullRequest aria-hidden="true" size={13} /> Updates are based on
          authoritative GitHub activity.
        </footer>
      </div>
    </div>
  );
}

function VariantB({ day, copy }: { day: DigestDay; copy: CopyKey }) {
  if (day.items.length === 0) return <QuietMessage day={day} />;

  const activeStatuses = statusOrder.filter(
    (status) => itemsFor(day, status, copy).length > 0,
  );
  return (
    <div className="stack-layout">
      <div className="stack-intro">
        <strong>Unshelf · daily digest</strong>
        <span>{day.date}</span>
      </div>
      {activeStatuses.map((status) => {
        const meta = statusMeta[status];
        const items = itemsFor(day, status, copy);
        return (
          <section
            className={`embed status-card status-card--${status}`}
            key={status}
          >
            <div className="embed-accent" style={{ background: meta.color }} />
            <div className="embed-body">
              <header>
                <span className="status-icon" style={{ color: meta.color }}>
                  <meta.Icon aria-hidden="true" size={18} />
                </span>
                <div>
                  <h3>{meta.label}</h3>
                  <p>{meta.explanation}</p>
                </div>
                <span className="count-badge">
                  {items.length}
                  {day.overflow?.[status] ? `+${day.overflow[status]}` : ""}
                </span>
              </header>
              <ul>
                {items.map((item) => (
                  <SourceItem compact item={item} copy={copy} key={item.url} />
                ))}
              </ul>
              {day.overflow?.[status] ? (
                <Overflow count={day.overflow[status]} status={status} />
              ) : null}
            </div>
          </section>
        );
      })}
      <p className="stack-footer">
        <LinkIcon aria-hidden="true" size={13} /> Every update opens its GitHub
        source.
      </p>
    </div>
  );
}

function VariantC({ day, copy }: { day: DigestDay; copy: CopyKey }) {
  if (day.items.length === 0) return <QuietMessage day={day} compact />;

  const blocked = itemsFor(day, "blocked", copy);
  const changed = [
    ...itemsFor(day, "released", copy),
    ...itemsFor(day, "completed", copy),
  ];
  const moving = itemsFor(day, "progress", copy);
  const upkeep = itemsFor(day, "maintenance", copy);
  const headline = digestHeadline(day);

  const groups = [
    {
      title: "Needs attention",
      subtitle: "Blocked",
      items: blocked,
      icon: AlertTriangle,
      color: statusMeta.blocked.color,
    },
    {
      title: "What changed",
      subtitle: "Released · Completed",
      items: changed,
      icon: Sparkles,
      color: statusMeta.released.color,
    },
    {
      title: "What’s moving",
      subtitle: "In progress",
      items: moving,
      icon: CircleDot,
      color: statusMeta.progress.color,
    },
    {
      title: "Behind the scenes",
      subtitle: "Internal maintenance",
      items: upkeep,
      icon: Wrench,
      color: statusMeta.maintenance.color,
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="embed pulse-card">
      <div className="embed-body">
        <header className="pulse-header">
          <div>
            <span className="eyebrow">DAILY PROJECT DIGEST</span>
            <h2>{headline}</h2>
          </div>
          <span className="pulse-date">{day.date}</span>
        </header>
        <div className="pulse-groups">
          {groups.map((group) => (
            <section className="pulse-group" key={group.title}>
              <div className="pulse-group-label" style={{ color: group.color }}>
                <group.icon aria-hidden="true" size={17} />
                <div>
                  <h3>{group.title}</h3>
                  <span>{group.subtitle}</span>
                </div>
              </div>
              <ul>
                {group.items.map((item) => (
                  <SourceItem compact item={item} copy={copy} key={item.url} />
                ))}
              </ul>
              {group.items.some((item) => day.overflow?.[item.status]) ? (
                <Overflow
                  count={[
                    ...new Set(
                      group.items.map((item) => effectiveStatus(item, copy)),
                    ),
                  ].reduce(
                    (sum, status) => sum + (day.overflow?.[status] ?? 0),
                    0,
                  )}
                  status={effectiveStatus(group.items[0], copy)}
                />
              ) : null}
            </section>
          ))}
        </div>
        <footer>
          {day.window} ·{" "}
          <a
            href="https://github.com/rajat2006/unshelf"
            target="_blank"
            rel="noreferrer"
          >
            View project on GitHub
          </a>
        </footer>
      </div>
    </div>
  );
}

function DiscordMessage({
  day,
  copy,
  variant,
}: {
  day: DigestDay;
  copy: CopyKey;
  variant: VariantKey;
}) {
  return (
    <div className="discord-message">
      <div className="avatar">
        <Bot aria-hidden="true" size={24} />
      </div>
      <div className="message-content">
        <div className="message-author">
          <strong>Unshelf</strong>
          <span className="app-badge">APP</span>
          <span>Today at 11:00 PM</span>
        </div>
        {variant === "A" ? <VariantA day={day} copy={copy} /> : null}
        {variant === "B" ? <VariantB day={day} copy={copy} /> : null}
        {variant === "C" ? <VariantC day={day} copy={copy} /> : null}
      </div>
    </div>
  );
}

function ReviewControls({
  dayKey,
  copy,
  onDay,
  onCopy,
}: {
  dayKey: DayKey;
  copy: CopyKey;
  onDay: (day: DayKey) => void;
  onCopy: (copy: CopyKey) => void;
}) {
  return (
    <div className="review-controls" aria-label="Prototype review controls">
      <label>
        <span>Review case</span>
        <span className="select-wrap">
          <select
            value={dayKey}
            onChange={(event) => onDay(event.target.value as DayKey)}
          >
            {dayKeys.map((key) => (
              <option value={key} key={key}>
                {days[key].label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" size={15} />
        </span>
      </label>
      <fieldset>
        <legend>Wording</legend>
        {copyKeys.map((key) => (
          <button
            type="button"
            className={copy === key ? "is-selected" : ""}
            onClick={() => onCopy(key)}
            key={key}
          >
            {key === "ai" ? (
              <Sparkles aria-hidden="true" size={14} />
            ) : (
              <PackageCheck aria-hidden="true" size={14} />
            )}
            {key === "ai" ? "AI" : "Fallback"}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function VariantSwitcher({
  variant,
  onChange,
}: {
  variant: VariantKey;
  onChange: (variant: VariantKey) => void;
}) {
  const index = variants.indexOf(variant);
  const cycle = (offset: number) =>
    onChange(variants[(index + offset + variants.length) % variants.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <nav className="variant-switcher" aria-label="Message variants">
      <button
        type="button"
        onClick={() => cycle(-1)}
        aria-label="Previous variant"
      >
        <ArrowLeft aria-hidden="true" size={18} />
      </button>
      <span>
        <b>{variant}</b>
        <span>{variantNames[variant]}</span>
      </span>
      <button type="button" onClick={() => cycle(1)} aria-label="Next variant">
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    </nav>
  );
}

function Prototype() {
  const [variant, setVariant] = useState(() =>
    getParam("variant", variants, "A"),
  );
  const [dayKey, setDayKey] = useState(() =>
    getParam("day", dayKeys, "typical"),
  );
  const [copy, setCopy] = useState(() => getParam("copy", copyKeys, "ai"));
  const day = useMemo(() => days[dayKey], [dayKey]);

  const chooseVariant = (next: VariantKey) => {
    setVariant(next);
    updateParams({ variant: next });
  };
  const chooseDay = (next: DayKey) => {
    setDayKey(next);
    updateParams({ day: next });
  };
  const chooseCopy = (next: CopyKey) => {
    setCopy(next);
    updateParams({ copy: next });
  };

  return (
    <main className="prototype-shell">
      <header className="prototype-header">
        <div>
          <span className="prototype-kicker">THROWAWAY PROTOTYPE</span>
          <h1>How should the Daily Project Digest read in Discord?</h1>
        </div>
        <ReviewControls
          dayKey={dayKey}
          copy={copy}
          onDay={chooseDay}
          onCopy={chooseCopy}
        />
      </header>
      <section
        className="discord-window"
        aria-label={`Discord preview: ${variantNames[variant]}, ${day.label}`}
      >
        <aside className="server-rail" aria-hidden="true">
          <div>U</div>
          <span />
          <span />
          <span />
        </aside>
        <aside className="channel-rail" aria-hidden="true">
          <strong>UNSHELF</strong>
          <p>TEXT CHANNELS</p>
          <span># general</span>
          <span className="active"># project-updates</span>
          <span># ideas</span>
        </aside>
        <div className="channel">
          <header>
            <span>#</span>
            <strong>project-updates</strong>
            <i />
            Daily progress without the GitHub archaeology
          </header>
          <div className="message-list">
            <div className="history-rule">
              <span>August 2026</span>
            </div>
            <DiscordMessage day={day} copy={copy} variant={variant} />
          </div>
        </div>
      </section>
      <div className="review-note">
        <span>Try every review case.</span> Source links, lifecycle meaning,
        maintenance grouping, overflow, and fallback copy are all visible in the
        mock.
      </div>
      <VariantSwitcher variant={variant} onChange={chooseVariant} />
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <Prototype />
  </StrictMode>,
);
