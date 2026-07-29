/**
 * PROTOTYPE — throwaway. Ticket #212, map #211.
 *
 * In-memory fixtures only: no api, no persistence. The Library is deliberately
 * big (64 Items) because the whole question is what a picker does when N is
 * "every Item the User has ever captured".
 */
import {
  Status,
  Type,
  type Item,
  type ItemId,
  type Label,
  type LabelId,
  type Stop,
  type StopId,
  type UserId,
} from "@unshelf/shared";

const USER = "proto-user" as UserId;

export const LABELS: Label[] = [
  "React",
  "Systems",
  "Design",
  "Rust",
  "Reading",
  "Work",
].map((name, index) => ({
  id: `label-${index}` as LabelId,
  userId: USER,
  name,
}));

const TITLES = [
  "You Might Not Need an Effect",
  "React Server Components, explained",
  "Designing Data-Intensive Applications",
  "A Philosophy of Software Design",
  "The Rust Book — Ownership",
  "Crafting Interpreters",
  "Postgres index internals",
  "What every programmer should know about memory",
  "CSS Grid: the definitive guide",
  "Refactoring UI",
  "Turing Complete (game)",
  "Advanced TypeScript patterns",
  "Effective TypeScript — Item 29",
  "Build your own React",
  "SQLite internals talk",
  "Kent Beck on tidy first",
  "Domain Modelling Made Functional",
  "The Pragmatic Programmer",
  "Zero to Production in Rust",
  "Async Rust, one thread at a time",
  "The Elements of Typographic Style",
  "Shape Up",
  "Accessibility for Everyone",
  "Inclusive Components",
  "Practical UI colour theory",
  "The Grid System handbook",
  "Distributed systems lecture 3",
  "Raft, visually",
  "Kafka in 100 seconds",
  "Event sourcing: the hard parts",
  "CQRS considered",
  "Testing Library best practices",
  "Playwright traces deep dive",
  "Vitest browser mode",
  "The Twelve-Factor App",
  "Container networking from scratch",
  "Traefik routing rules",
  "Drizzle ORM migrations",
  "Zod v4 what changed",
  "ESLint flat config, properly",
  "Prettier vs the world",
  "Turborepo remote caching",
  "pnpm workspaces in anger",
  "Vite plugin authoring",
  "React Router 7 data APIs",
  "Suspense for data fetching",
  "useSyncExternalStore",
  "Concurrent rendering, honestly",
  "Web Components in 2026",
  "View Transitions API",
  "Popover and anchor positioning",
  "Dialog element accessibility",
  "Combobox ARIA pattern",
  "Roving tabindex explained",
  "Virtual lists without tears",
  "Fuzzy search algorithms",
  "Trigram indexes in Postgres",
  "Full-text search on a budget",
  "Debounce vs throttle",
  "Optimistic UI patterns",
  "Undo as a first-class feature",
  "Command palettes everywhere",
  "Keyboard-first interfaces",
  "The cost of a modal",
];

const TYPES = [
  Type.Article,
  Type.Video,
  Type.Book,
  Type.Course,
  Type.Playlist,
  Type.Other,
];
const STATUSES = [
  Status.NotStarted,
  Status.NotStarted,
  Status.NotStarted,
  Status.InProgress,
  Status.Done,
];

export const ITEMS: Item[] = TITLES.map((title, index) => {
  const status = STATUSES[index % STATUSES.length];
  const targetDate =
    index % 7 === 0
      ? `2026-0${(index % 9) + 1}-1${index % 9}`
      : index % 5 === 0
        ? "2026-06-01"
        : null;
  return {
    id: `item-${index}` as ItemId,
    userId: USER,
    title,
    source: index % 3 === 0 ? `https://example.com/${index}` : null,
    type: TYPES[index % TYPES.length],
    status,
    targetDate,
    pastTarget: targetDate === "2026-06-01" && status !== Status.Done,
    completedAt: status === Status.Done ? "2026-05-02T10:00:00.000Z" : null,
    labels:
      index % 4 === 0
        ? [LABELS[index % LABELS.length]]
        : index % 6 === 0
          ? [LABELS[0], LABELS[2]]
          : [],
  } as Item;
});

/**
 * Two Trails, and deliberately two Stops called "Week 2" — the ambiguity the map
 * calls out in door 1. A picker that shows bare Stop names cannot tell them apart.
 */
export const STOPS: (Stop & { trailName: string })[] = [
  { id: "stop-1" as StopId, userId: USER, name: "Week 1", trailName: "React" },
  { id: "stop-2" as StopId, userId: USER, name: "Week 2", trailName: "React" },
  { id: "stop-3" as StopId, userId: USER, name: "Week 2", trailName: "Rust" },
  {
    id: "stop-4" as StopId,
    userId: USER,
    name: "Reading pile",
    trailName: "Rust",
  },
  {
    id: "stop-5" as StopId,
    userId: USER,
    name: "Someday",
    trailName: "React",
  },
];

/** The open Stop both frames point at. */
export const OPEN_STOP = STOPS[1];

/** Items already in the open Stop. */
export const ITEMS_IN_OPEN_STOP = new Set<ItemId>([
  ITEMS[0].id,
  ITEMS[1].id,
  ITEMS[13].id,
]);

/**
 * Where every Item already sits, so a variant can decide whether to mark Items
 * placed in *other* Stops at all. Keyed by Item id.
 */
export const PLACEMENTS = new Map<ItemId, string[]>(
  ITEMS.map((item, index) => {
    const placed: string[] = [];
    if (ITEMS_IN_OPEN_STOP.has(item.id)) placed.push("React · Week 2");
    if (index % 5 === 2) placed.push("React · Week 1");
    if (index % 9 === 4) placed.push("Rust · Reading pile");
    if (index % 11 === 3) placed.push("React · Someday");
    return [item.id, placed] as const;
  }),
);

/** The prototype never calls the api; this satisfies the real leaf controls. */
export const STUB_USER = { getToken: async () => null };

export function matches(item: Item, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    item.type.toLowerCase().includes(q) ||
    item.labels.some((label) => label.name.toLowerCase().includes(q))
  );
}
