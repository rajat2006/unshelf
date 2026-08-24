/**
 * The shared API contract, imported by both `apps/web` and `apps/api` so the two
 * ends can never drift. In v1 this holds the walking-skeleton health contract,
 * the `Item` spine (ADR-0003), the `Stage` / `StageItem` organisation model
 * (ADR-0004) and the `LearningPlanEdge` topology (ADR-0010).
 */

/**
 * The kind of material an Item is — chosen by the User at capture, no default
 * (ADR-0003, CONTEXT.md *Type*). A label on the Item, not a separate record. The
 * enum is the single source of truth: both ends iterate its values to render
 * choices and validate input so the two never drift.
 */
export enum Type {
  Article = "article",
  Video = "video",
  Playlist = "playlist",
  Course = "course",
  Book = "book",
  Other = "other",
}

export const ITEM_TYPES = Object.values(Type);

/**
 * An Item's item-level progress (ADR-0003, CONTEXT.md *Status*). One Status per
 * Item, shared across every Stage it appears in. A fresh capture lands *not
 * started*; the Status API owns its transitions.
 */
export enum Status {
  NotStarted = "not_started",
  InProgress = "in_progress",
  Done = "done",
}

export const ITEM_STATUSES = Object.values(Status);

/** Whether a Structured Item's Status is chosen or follows its Parts. */
export enum StatusMode {
  Manual = "manual",
  Automatic = "automatic",
}

export const ITEM_STATUS_MODES = Object.values(StatusMode);

/** The internal topology-node variants currently supported by Learning Plans. */
export enum PlanNodeKind {
  Item = "item",
  Stage = "stage",
}

export const PLAN_NODE_KINDS = Object.values(PlanNodeKind);

declare const identifierBrand: unique symbol;

export type UserId = string & {
  readonly [identifierBrand]: "UserId";
};

export type ClerkUserId = string & {
  readonly [identifierBrand]: "ClerkUserId";
};

export type ItemId = string & {
  readonly [identifierBrand]: "ItemId";
};

export type PartId = string & {
  readonly [identifierBrand]: "PartId";
};

export type StageId = string & {
  readonly [identifierBrand]: "StageId";
};

/** Stable topology-node identity of a direct Item placement in one Learning Plan. */
export type DirectItemNodeId = string & {
  readonly [identifierBrand]: "DirectItemNodeId";
};

/** Opaque topology identity shared by Stage and direct-Item node variants. */
export type PlanNodeId = StageId | DirectItemNodeId;

export type LearningPlanId = string & {
  readonly [identifierBrand]: "LearningPlanId";
};

export type LabelId = string & {
  readonly [identifierBrand]: "LabelId";
};

export type DailyFocusId = string & {
  readonly [identifierBrand]: "DailyFocusId";
};

export type DiscoverProviderTargetId = string & {
  readonly [identifierBrand]: "DiscoverProviderTargetId";
};

export type DiscoverFollowId = string & {
  readonly [identifierBrand]: "DiscoverFollowId";
};

export type DiscoverCandidateId = string & {
  readonly [identifierBrand]: "DiscoverCandidateId";
};

export enum CandidateState {
  Pending = "pending",
  Kept = "kept",
  Rejected = "rejected",
}

export const CANDIDATE_STATES = Object.values(CandidateState);

/** Shared public YouTube channel facts returned by a transient preview. */
export interface DiscoverPreviewChannel {
  externalId: string;
  title: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;
}

/** Shared public YouTube video facts used by preview and later Candidate cards. */
export interface DiscoverPreviewVideo {
  externalId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number;
  source: string;
  channelExternalId: string;
  channelTitle: string;
}

export interface DiscoverPreview {
  targetId: DiscoverProviderTargetId;
  channel: DiscoverPreviewChannel;
  videos: DiscoverPreviewVideo[];
}

/** One active private relationship between the current User and a channel. */
export interface DiscoverFollow {
  id: DiscoverFollowId;
  targetId: DiscoverProviderTargetId;
  channel: DiscoverPreviewChannel;
}

/** One pending private decision backed by current shared video metadata. */
export interface DiscoverCandidate {
  id: DiscoverCandidateId;
  state: CandidateState;
  video: DiscoverPreviewVideo;
  libraryItem: Pick<Item, "id" | "title"> | null;
}

export interface KeepDiscoverCandidateResult {
  candidate: DiscoverCandidate;
  item: Item;
}

export interface DiscoverWorkspace {
  follows: DiscoverFollow[];
  candidates: DiscoverCandidate[];
}

/** The authenticated database calendar document used for Today-dependent UI. */
export interface ServerCalendar {
  /** Canonical calendar date in the explicitly configured database timezone. */
  today: string;
  /** ISO instant at which `today` ceases to be authoritative. */
  validUntil: string;
}

/**
 * API request types are inferred from the canonical runtime schemas. This
 * type-only facade keeps existing `@unshelf/shared` consumers runtime-free.
 */
export type {
  AddStageItemRequest,
  CreatePartsRequest,
  ConnectLearningPlanNodesRequest,
  CreateItemRequest,
  CreateLabelRequest,
  CreateStageRequest,
  CreateStageWithItemRequest,
  CreateLearningPlanRequest,
  PlaceLearningPlanItemRequest,
  MoveLearningPlanItemRequest,
  ReorderPartsRequest,
  ReorderStageItemsRequest,
  RemoveStageRequest,
  StageItemDisposition,
  UpdateLearningPlanRequest,
  UpdateStageRequest,
  UpdateItemStatusRequest,
  UpdateItemTargetDateRequest,
  UpdatePartCompletionRequest,
  UpdatePartRequest,
  AddDailyFocusItemRequest,
  DailyPlanningQuery,
  SuppressDailyPlanningItemRequest,
  DiscoverPreviewRequest,
  CreateDiscoverFollowRequest,
  DiscoverWorkspaceQuery,
  KeepDiscoverCandidateRequest,
} from "./validation";

/** A private, free-text marker the User applies across Library Items. */
export interface Label {
  id: LabelId;
  userId: UserId;
  name: string;
}

/**
 * A single captured piece of learning material — the shared spine every later
 * concept (Stage, Learning Plan) references (ADR-0003). Scoped to a User (`userId`,
 * ADR-0001). `source` is the optional link, stored verbatim and unvalidated
 * (ADR-0007); `targetDate` is the soft "by when" the Target date API owns.
 * `completedAt` is deliberately returned by the API contract for persistence
 * verification but never rendered by the v1 web app (ADR-0005).
 */
export interface Item {
  /** This Item's id (uuid). */
  id: ItemId;
  /** The owning User — the tenancy anchor this Item is scoped to. */
  userId: UserId;
  /** The Item's identity — required, edge-trimmed with internal space preserved. */
  title: string;
  /** Optional link to where the Item lives; verbatim, unvalidated (ADR-0007). */
  source: string | null;
  /** When Capture created the Item, as a database-owned ISO-8601 timestamp. */
  createdAt: string;
  /** The kind of material, chosen at capture. */
  type: Type;
  /** Item-level progress; a fresh capture is *not started*. */
  status: Status;
  /** Whether Status is manually chosen or automatically derived from Parts. */
  statusMode: StatusMode;
  /**
   * The User's optional soft "by when" as a calendar date (`YYYY-MM-DD`), or
   * null. One value per Item, shared across every Stage it appears in.
   */
  targetDate: string | null;
  /**
   * Whether the target date has passed while the Item is not yet done — read
   * only, and *derived* on every read from (`targetDate` is past AND `status` is
   * not done). There is no stored flag and no job behind it (ADR-0005), and
   * nothing ever reaches out about it: the User consults this, never the reverse.
   * Clears once the Item is done, while `targetDate` stays as history.
   */
  pastTarget: boolean;
  /** When the Item entered *done*, ISO-8601, or null while not done. */
  completedAt: string | null;
  /** The private Labels currently applied to this Item. */
  labels: Label[];
  /** Derived completion percentage for a Structured Item, or null without Parts. */
  partPercentage: number | null;
}

/** One lightweight checklist entry owned by an Item. */
export interface Part {
  id: PartId;
  itemId: ItemId;
  title: string;
  position: number;
  completed: boolean;
}

/** Canonical Item detail, including structure that is not a Library row. */
export interface ItemDetail extends Item {
  parts: Part[];
}

/** Derive completion for any current selection of shared Items. */
export function deriveItemCompletion(items: readonly Pick<Item, "status">[]): {
  done: number;
  total: number;
} {
  return {
    done: items.filter((item) => item.status === Status.Done).length,
    total: items.length,
  };
}

/** The editable selection of whole Items for one server calendar date. */
export interface DailyFocus {
  id: DailyFocusId;
  userId: UserId;
  date: string;
  entries: DailyFocusEntry[];
  done: number;
  total: number;
}

/** Optional current Plan placement retained only to navigate from a focus entry. */
export interface DailyFocusOrigin {
  learningPlan: PlacementLearningPlan;
  stage: PlacementStage | null;
}

/** One whole shared Item selected for a dated Daily Focus. */
export interface DailyFocusEntry {
  item: Item;
  origin: DailyFocusOrigin | null;
  /** The Item state last visible on this focus's server calendar date. */
  snapshot: {
    status: Status;
    partPercentage: number | null;
  };
}

/** The ordered, transparent signals that can place an Item in Daily Planning. */
export type DailyPlanningSignal =
  "unfinished_yesterday" | "target_date" | "recent_capture";

/** One de-duplicated suggestion with the highest-priority reason it appears. */
export interface DailyPlanningSuggestion {
  item: Item;
  signal: DailyPlanningSignal;
  explanation: string;
}

/** A read-only projection used to choose Items for the current Daily Focus. */
export interface DailyPlanning {
  searchResults: Item[];
  suggestions: DailyPlanningSuggestion[];
}

/**
 * An optional named grouping within one Learning Plan (ADR-0018, CONTEXT.md
 * *Stage*). Its identity is also the identity of its current Plan Node. Scoped
 * to a User like every other domain record (ADR-0001).
 */
export interface Stage {
  /** This Stage's id (uuid). */
  id: StageId;
  /** The owning User — the tenancy anchor this Stage is scoped to. */
  userId: UserId;
  /** The one Learning Plan this optional Stage belongs to. */
  learningPlanId: LearningPlanId;
  /** What the User calls this Stage — required and trimmed only at the edges. */
  name: string;
}

/**
 * Membership: this User's Item is in that User's Stage. The User anchor keeps the
 * ends in one private space, while the repeated Learning Plan anchor lets
 * PostgreSQL enforce at most one Stage per Item on a Learning Plan. `position`
 * records local order; Status remains on the shared Item itself.
 */
export interface StageItem {
  /** The owning User — constrained to be the owner of both membership ends. */
  userId: UserId;
  /** The Stage end of the membership. */
  stageId: StageId;
  /** The Item end of the membership. */
  itemId: ItemId;
  /**
   * The Learning Plan containing the Stage, repeated so PostgreSQL can enforce
   * that this Item appears at most once on that Learning Plan.
   */
  learningPlanId: LearningPlanId;
  /** Stable zero-based local order within this Stage. */
  position: number;
}

/**
 * One Stage with its locally ordered contents. Each Item is the single shared
 * record, carrying the one Status and Target date every other view reads.
 */
export interface StageDetail extends Stage {
  /**
   * The Stage's Items in their stable local membership order.
   */
  items: Item[];
}

/** The minimum Stage identity needed to describe or choose an Item placement. */
export interface PlacementStage {
  id: StageId;
  name: string;
}

/** The minimum LearningPlan identity needed to qualify an Item placement destination. */
export interface PlacementLearningPlan {
  id: LearningPlanId;
  name: string;
}

/**
 * One LearningPlan's mutually exclusive state for one Item. A placed LearningPlan exposes
 * exactly the Stage already containing the Item; an available LearningPlan exposes its
 * existing Stage destinations.
 */
export type ItemPlacementLearningPlan =
  | {
      kind: "available";
      learningPlan: PlacementLearningPlan;
      stages: PlacementStage[];
    }
  | {
      kind: "placed";
      learningPlan: PlacementLearningPlan;
      stage: PlacementStage;
    }
  | {
      kind: "placed_direct";
      learningPlan: PlacementLearningPlan;
    }
  | {
      kind: "archived";
      learningPlan: PlacementLearningPlan;
      placement: "direct" | PlacementStage | null;
    };

/** Every LearningPlan the User owns, represented once for one Item. */
export interface ItemPlacementCatalog {
  itemId: ItemId;
  learningPlans: ItemPlacementLearningPlan[];
}

interface StageItemCandidateFacts {
  id: ItemId;
  title: string;
  type: Type;
}

/** One compact Library result offered while filling an open Stage. */
export type StageItemCandidate = StageItemCandidateFacts &
  (
    | { kind: "available" }
    | { kind: "direct_conflict" }
    | {
        kind: "conflict";
        stage: PlacementStage;
      }
  );

/** One Library result in a Learning Plan's placement drawer. */
export type LearningPlanItemCandidate =
  | { kind: "available"; item: Item }
  | { kind: "direct"; item: Item }
  | { kind: "stage"; item: Item; stage: PlacementStage };

/**
 * A first-class LearningPlan — one User's learning journey, owning a canvas of Stages and
 * forks (ADR-0014, CONTEXT.md *LearningPlan*). A User owns *many* LearningPlans, each with an
 * opaque, stable `id` that does not change when the LearningPlan is renamed, so its URL
 * (`/plans/:id`) survives presentation changes. Scoped to a User like every
 * domain record (ADR-0001): listing and reading resolve from the authenticated
 * User, so another User's LearningPlan is indistinguishable from a missing one.
 *
 * `done` and `total` are the LearningPlan's *derived* progress — how many of the Items
 * across its Stages are *done* out of how many it holds, counted per distinct Item
 * so an Item pulled into two of the LearningPlan's Stages is not double-counted. Like the
 * per-node progress on `LearningPlanNode` and the derived `pastTarget` (ADR-0005) it is
 * computed on every read, never stored; an empty LearningPlan reads as 0/0.
 */
export interface LearningPlan {
  /** This LearningPlan's opaque, stable id (uuid) — the `:learningPlanId` its URL carries. */
  id: LearningPlanId;
  /** The owning User — the tenancy anchor this LearningPlan is scoped to. */
  userId: UserId;
  /** What the User calls this LearningPlan — required and trimmed only at the edges. */
  name: string;
  /** When this LearningPlan was created, ISO-8601 — the stable order the index lists in. */
  createdAt: string;
  /** When this Learning Plan was archived, ISO-8601, or null while active. */
  archivedAt: string | null;
  /** How many distinct current Items on the Learning Plan are *done* (0 when none). */
  done: number;
  /** How many distinct current Items the Learning Plan holds in total. */
  total: number;
}

/**
 * A directed Plan-Node edge — one row of the Learning Plan's adjacency edge list
 * (ADR-0010). The LearningPlan *is* this edge set scoped to a User: its nodes are the
 * direct Item placements and Stages, while its edges are these rows. A fork has
 * several out-edges; a join has several in-edges; the whole is a DAG.
 *
 * It carries no `x`/`y` and no order among sibling forks: canvas position is
 * *derived* on read by longest-path layering, never stored (ADR-0010), the same
 * discipline as the derived `pastTarget` (ADR-0005). And it carries no date — the
 * LearningPlan is a lightweight topology, never a calendar (ADR-0004).
 */
export interface LearningPlanEdge {
  /** The owning User — constrained to be the owner of both edge ends. */
  userId: UserId;
  /** The Plan Node the edge leads out of. */
  fromNodeId: PlanNodeId;
  /** The Plan Node the edge leads into. */
  toNodeId: PlanNodeId;
}

/**
 * A Stage as it appears on the LearningPlan — a node (CONTEXT.md *Stage*: a Stage is what
 * appears as a node on the LearningPlan). The LearningPlan is a derived view over the User's
 * Stages, so this carries what the canvas draws a waypoint from: the Stage's
 * identity and name, plus its progress — how many of its Items are *done* out of
 * how many it holds. Progress is *derived* on every read (like `pastTarget`,
 * ADR-0005), never stored on the LearningPlan; it is what lets the canvas read a thread
 * as ground already walked versus still ahead.
 */
export interface StageLearningPlanNode {
  kind: PlanNodeKind.Stage;
  /** The Stage's id — the node's identity, and the endpoint edges reference. */
  id: StageId;
  /** The Stage's name, drawn as the waypoint label. */
  name: string;
  /** How many of the Stage's Items are *done* (0 when it holds none). */
  done: number;
  /** How many Items the Stage holds in total. */
  total: number;
}

/** One direct reference to the shared Library Item, without a manufactured Stage. */
export interface ItemLearningPlanNode {
  kind: PlanNodeKind.Item;
  /** Stable identity of this placement in the Learning Plan topology. */
  id: DirectItemNodeId;
  /** The single shared Item record; Status changes are visible on every fresh read. */
  item: Item;
}

/** The two first-class node variants a Learning Plan can arrange. */
export type LearningPlanNode = StageLearningPlanNode | ItemLearningPlanNode;

/**
 * Contains every Plan Node and directed edge in a Learning Plan, including nodes
 * without edges. Layout is derived from these edges on the client and is not
 * part of this contract.
 */
export interface LearningPlanView {
  /** Every direct Item placement and Stage as a first-class Plan Node. */
  nodes: LearningPlanNode[];
  /** Every Plan-Node edge belonging to the User. */
  edges: LearningPlanEdge[];
}

/**
 * A signed-in User — the tenant that owns a private learning space (ADR-0001).
 * `id` is *our* user id, the anchor every domain foreign key points at;
 * `clerkUserId` is Clerk's id held only as an external reference, never
 * foreign-keyed to by domain data (ADR-0009 guardrail).
 */
export interface User {
  /** Our own user id (uuid) — the tenancy anchor. */
  id: UserId;
  /** Clerk's user id, an external reference only. */
  clerkUserId: ClerkUserId;
  /** When this User's row was provisioned, ISO-8601. */
  createdAt: string;
}

/** Response of `GET /api/health` — proves the web → api → Postgres round-trip. */
export interface HealthResponse {
  /** Overall health of the request path. */
  status: "ok" | "error";
  /** A human-readable message read from the database. */
  message: string;
  /** Whether the API could reach Postgres on this request. */
  db: "up" | "down";
  /** Server/database timestamp, ISO-8601. */
  time: string;
}
