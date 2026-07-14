/**
 * The shared API contract, imported by both `apps/web` and `apps/api` so the two
 * ends can never drift. In v1 this holds the walking-skeleton health contract and
 * the `Item` spine (ADR-0003); Stop, StopItem, and the Trail land here as later
 * tickets build them out.
 */

/**
 * The kind of material an Item is — chosen by the User at capture, no default
 * (ADR-0003, CONTEXT.md *Type*). A label on the Item, not a separate record. The
 * array is the single source of truth: both ends iterate it to render choices and
 * validate input, and `ItemType` is derived from it so the two never drift.
 */
export const ITEM_TYPES = [
  "article",
  "video",
  "playlist",
  "course",
  "book",
  "other",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/**
 * An Item's item-level progress (ADR-0003, CONTEXT.md *Status*). One Status per
 * Item, shared across every Stop it appears in. A fresh capture lands *not
 * started*; later tickets (Track/Stop) light up the transitions.
 */
export const ITEM_STATUSES = ["not_started", "in_progress", "done"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/**
 * A single captured piece of learning material — the shared spine every later
 * concept (Stop, Trail) references (ADR-0003). Scoped to a User (`userId`,
 * ADR-0001). `source` is the optional link, stored verbatim and unvalidated
 * (ADR-0007); `targetDate`/`completedAt` are seams later tickets write, carried
 * here so the spine is the full v1 shape from birth.
 */
export interface Item {
  /** This Item's id (uuid). */
  id: string;
  /** The owning User — the tenancy anchor this Item is scoped to. */
  userId: string;
  /** The Item's identity — required, stored exactly as typed (ADR-0003). */
  title: string;
  /** Optional link to where the Item lives; verbatim, unvalidated (ADR-0007). */
  source: string | null;
  /** The kind of material, chosen at capture. */
  type: ItemType;
  /** Item-level progress; a fresh capture is *not started*. */
  status: ItemStatus;
  /** The User's optional soft "by when", ISO-8601 date or null. */
  targetDate: string | null;
  /** When the Item entered *done*, ISO-8601, or null while not done. */
  completedAt: string | null;
  /** When the Item was captured, ISO-8601. */
  createdAt: string;
}

/**
 * The capture payload — the one uniform manual insert (ADR-0007). `title` and
 * `type` are required; `source` is optional (offline books have none). Everything
 * else on an `Item` is server-assigned, so it is absent here.
 */
export interface CreateItemRequest {
  /** Required — the Item's identity. */
  title: string;
  /** Chosen Type, no default. */
  type: ItemType;
  /** Optional link; omitted or blank for offline Items. */
  source?: string | null;
}

/**
 * A signed-in User — the tenant that owns a private learning space (ADR-0001).
 * `id` is *our* user id, the anchor every domain foreign key points at;
 * `clerkUserId` is Clerk's id held only as an external reference, never
 * foreign-keyed to by domain data (ADR-0009 guardrail).
 */
export interface User {
  /** Our own user id (uuid) — the tenancy anchor. */
  id: string;
  /** Clerk's user id, an external reference only. */
  clerkUserId: string;
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
