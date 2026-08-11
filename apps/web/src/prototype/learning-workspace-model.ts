export type ItemStatus = "not-started" | "in-progress" | "done";
export type ItemType = "article" | "book" | "text" | "video";
export type CandidateStatus = "new" | "seen" | "kept" | "dismissed";

export interface ItemPart {
  id: string;
  title: string;
  done: boolean;
}

export interface LearningItem {
  id: string;
  title: string;
  type: ItemType;
  source?: string;
  providerIdentity?: string;
  labels: string[];
  status: ItemStatus;
  captured: string;
  parts?: ItemPart[];
}

export interface Candidate {
  id: string;
  title: string;
  channel: string;
  source: string;
  providerIdentity: string;
  status: CandidateStatus;
  linkedItemId?: string;
  history?: string;
}

export type PlanNode =
  | { id: string; kind: "item"; itemId: string }
  | { id: string; kind: "stage"; title: string; itemIds: string[] };

export interface DailyPick {
  itemId: string;
  origin?: string;
}

export interface PrototypeState {
  items: LearningItem[];
  candidates: Candidate[];
  planNodes: PlanNode[];
  dailyPicks: DailyPick[];
  selectedItemId: string;
  selectedCandidateId: string;
  events: string[];
}

export function createInitialState(): PrototypeState {
  return {
    items: [
      {
        id: "dns-video",
        title: "How DNS works",
        type: "video",
        source: "https://youtube.com/watch?v=dns-101",
        providerIdentity: "youtube:video:dns-101",
        labels: ["systems", "web"],
        status: "in-progress",
        captured: "Captured manually · 2 Aug",
      },
      {
        id: "ddia-book",
        title: "Designing Data-Intensive Applications",
        type: "book",
        labels: ["systems", "books"],
        status: "in-progress",
        captured: "Offline book · 24 Jul",
        parts: [
          {
            id: "ddia-1",
            title: "Reliable, scalable, maintainable",
            done: true,
          },
          {
            id: "ddia-2",
            title: "Data models and query languages",
            done: true,
          },
          { id: "ddia-3", title: "Storage and retrieval", done: false },
          { id: "ddia-4", title: "Encoding and evolution", done: false },
          { id: "ddia-5", title: "Replication", done: false },
        ],
      },
      {
        id: "http-article",
        title: "HTTP semantics for application developers",
        type: "article",
        source: "https://httpwg.org/specs/rfc9110.html",
        labels: ["web", "reference"],
        status: "not-started",
        captured: "Captured manually · 30 Jul",
      },
      {
        id: "tcp-article",
        title: "The TCP/IP guide: a gentle chapter",
        type: "article",
        source: "https://example.com/tcp-guide",
        labels: ["systems", "web"],
        status: "done",
        captured: "Captured manually · 19 Jul",
      },
      {
        id: "cache-article",
        title: "Caching is harder than it looks",
        type: "article",
        source: "https://example.com/caching",
        labels: ["systems"],
        status: "not-started",
        captured: "Captured manually · 4 Aug",
      },
      {
        id: "api-questions",
        title: "Questions for the architecture review",
        type: "text",
        labels: ["project-notes"],
        status: "not-started",
        captured: "Custom text · 6 Aug",
      },
    ],
    candidates: [
      {
        id: "react-compiler",
        title: "React Compiler in practice",
        channel: "Jack Herrington · YouTube",
        source: "https://youtube.com/watch?v=react-compiler",
        providerIdentity: "youtube:video:react-compiler",
        status: "new",
      },
      {
        id: "dns-discovery",
        title: "How DNS works",
        channel: "ByteByteGo · YouTube",
        source: "https://youtube.com/watch?v=dns-101",
        providerIdentity: "youtube:video:dns-101",
        status: "new",
        linkedItemId: "dns-video",
        history: "Already in Library from manual Capture",
      },
      {
        id: "distributed-systems",
        title: "Distributed Systems lecture 1",
        channel: "MIT OpenCourseWare · YouTube",
        source: "https://youtube.com/watch?v=distributed-1",
        providerIdentity: "youtube:video:distributed-1",
        status: "new",
        history: "Previously dismissed · 18 Jul",
      },
    ],
    planNodes: [
      {
        id: "stage-foundations",
        kind: "stage",
        title: "1 · Web foundations",
        itemIds: ["dns-video", "tcp-article", "http-article"],
      },
      { id: "direct-cache", kind: "item", itemId: "cache-article" },
      {
        id: "stage-reliability",
        kind: "stage",
        title: "3 · Data and reliability",
        itemIds: ["ddia-book"],
      },
      { id: "direct-questions", kind: "item", itemId: "api-questions" },
    ],
    dailyPicks: [
      { itemId: "dns-video", origin: "Reliable web systems · Web foundations" },
      {
        itemId: "ddia-book",
        origin: "Reliable web systems · Data and reliability",
      },
      { itemId: "cache-article" },
    ],
    selectedItemId: "dns-video",
    selectedCandidateId: "react-compiler",
    events: ["Representative workspace loaded"],
  };
}

export function itemStatusFromParts(parts: ItemPart[]): ItemStatus {
  const completed = parts.filter((part) => part.done).length;
  if (completed === 0) return "not-started";
  if (completed === parts.length) return "done";
  return "in-progress";
}

export function statusLabel(status: ItemStatus): string {
  if (status === "not-started") return "Not started";
  if (status === "in-progress") return "In progress";
  return "Done";
}

export function typeLabel(type: ItemType): string {
  if (type === "text") return "Custom text";
  return type[0].toUpperCase() + type.slice(1);
}
