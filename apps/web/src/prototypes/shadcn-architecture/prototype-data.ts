import { Status, Type } from "@unshelf/shared";

export interface PrototypeItem {
  id: string;
  title: string;
  type: Type;
  status: Status;
  source: string;
  sourceLabel: string;
  targetDate?: string;
  pastTarget?: boolean;
  planned: boolean;
  labels: string[];
  note: string;
}

export const PROTOTYPE_ITEMS: PrototypeItem[] = [
  {
    id: "designing-data-intensive-applications",
    title: "Designing Data-Intensive Applications",
    type: Type.Book,
    status: Status.InProgress,
    source: "https://dataintensive.net/",
    sourceLabel: "dataintensive.net",
    targetDate: "22 Aug",
    planned: true,
    labels: ["Systems", "Architecture"],
    note: "Return to the chapters on streams, derived data, and the limits of distributed transactions.",
  },
  {
    id: "quiet-design-systems",
    title: "Building quiet design systems",
    type: Type.Article,
    status: Status.NotStarted,
    source: "https://example.com/quiet-design-systems",
    sourceLabel: "example.com",
    planned: false,
    labels: ["Design systems"],
    note: "A practical argument for making the paved road easier to find than one-off visual choices.",
  },
  {
    id: "maintainable-interfaces",
    title: "The maintenance cost of an interface",
    type: Type.Other,
    status: Status.Done,
    source: "https://example.com/maintainable-interfaces",
    sourceLabel: "example.com",
    planned: true,
    labels: ["Product craft"],
    note: "Completed; keep for the discussion about consistency as an operational concern.",
  },
  {
    id: "css-for-the-long-haul",
    title: "CSS for the long haul",
    type: Type.Course,
    status: Status.NotStarted,
    source: "https://example.com/css-long-haul",
    sourceLabel: "example.com",
    targetDate: "9 Aug",
    pastTarget: true,
    planned: true,
    labels: ["CSS", "Frontend"],
    note: "The target passed quietly. Decide whether this still belongs in the current learning plan.",
  },
  {
    id: "accessible-overlays",
    title: "Accessible overlays without surprises",
    type: Type.Video,
    status: Status.NotStarted,
    source: "https://example.com/accessible-overlays",
    sourceLabel: "example.com",
    planned: false,
    labels: ["Accessibility"],
    note: "Compare native dialog behavior with headless primitives and route-owned side panels.",
  },
  {
    id: "semantic-color-systems",
    title: "Semantic color systems in practice",
    type: Type.Article,
    status: Status.InProgress,
    source: "https://example.com/semantic-color",
    sourceLabel: "example.com",
    targetDate: "29 Aug",
    planned: true,
    labels: ["Design systems", "Color"],
    note: "Focus on role naming and peer dark themes rather than mechanical palette inversion.",
  },
];
