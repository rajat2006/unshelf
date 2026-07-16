/**
 * The shared API contract, imported by both `apps/web` and `apps/api` so the two
 * ends can never drift. In v1 this holds the walking-skeleton health contract and
 * the `Item` spine (ADR-0003); Stop, StopItem, and the Trail land here as later
 * tickets build them out.
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
 * Item, shared across every Stop it appears in. A fresh capture lands *not
 * started*; the Status API owns its transitions.
 */
export enum Status {
  NotStarted = "not_started",
  InProgress = "in_progress",
  Done = "done",
}

export const ITEM_STATUSES = Object.values(Status);

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

/**
 * A single captured piece of learning material — the shared spine every later
 * concept (Stop, Trail) references (ADR-0003). Scoped to a User (`userId`,
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
  /** The Item's identity — required, stored exactly as typed (ADR-0003). */
  title: string;
  /** Optional link to where the Item lives; verbatim, unvalidated (ADR-0007). */
  source: string | null;
  /** The kind of material, chosen at capture. */
  type: Type;
  /** Item-level progress; a fresh capture is *not started*. */
  status: Status;
  /**
   * The User's optional soft "by when" as a calendar date (`YYYY-MM-DD`), or
   * null. One value per Item, shared across every Stop it appears in.
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
  type: Type;
  /** Optional link; when supplied, including blank, it is preserved verbatim. */
  source?: string | null;
}

/** Change the one Status stored on an Item, wherever that Item is shown. */
export interface UpdateItemStatusRequest {
  status: Status;
}

/**
 * Set, change, or clear the one soft Target date stored on an Item (ADR-0005).
 * A calendar date (`YYYY-MM-DD`) sets or changes it; `null` clears it. Like
 * Status, the value is shared by every Stop the Item appears in.
 */
export interface UpdateItemTargetDateRequest {
  targetDate: string | null;
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
