/**
 * The shared API contract, imported by both `apps/web` and `apps/api` so the two
 * ends can never drift. In v1 this holds the walking-skeleton health contract;
 * the domain types (Item, Stop, StopItem, and the Type/Status enums) land here as
 * later tickets build them out.
 */

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
