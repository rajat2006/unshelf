import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { ITEM_STATUSES, ITEM_TYPES, Status } from "@unshelf/shared";

/**
 * The database schema, in TypeScript. `drizzle-kit generate` diffs this against
 * the last snapshot and writes a versioned migration into `drizzle/`; nothing
 * applies DDL at runtime any more (ADR-0015, #104).
 *
 * The enum `CHECK`s below import `ITEM_TYPES` / `ITEM_STATUSES` from
 * `@unshelf/shared` rather than restating them, so adding a Type generates its
 * own `DROP CONSTRAINT` / `ADD CONSTRAINT` migration instead of needing a hand
 * edit here.
 *
 * **Composite foreign-key targets are declared with `unique()`, never
 * `uniqueIndex()`.** `drizzle-kit` emits every `ALTER TABLE … ADD FOREIGN KEY`
 * before any `CREATE INDEX`, so a composite FK pointing at a `uniqueIndex()`
 * generates SQL Postgres rejects with *"there is no unique constraint matching
 * given keys"* (drizzle-orm#4638, fixed only in the unreleased v1 line). A
 * `UNIQUE` constraint is emitted inline in `CREATE TABLE`, so it exists before
 * the foreign keys that target it — and in Postgres a unique constraint *is* a
 * unique index, same name, same columns, same planner value.
 */

/**
 * The walking skeleton's round-trip probe: `/api/health` reads this table to
 * prove the API can reach Postgres. Its single row is seeded by migration `0000`
 * — reference data the app's correctness depends on, so it ships with the DDL
 * that creates its table rather than in a separate seed path (#106).
 */
export const healthCheck = pgTable("health_check", {
  id: integer("id").primaryKey(),
  message: text("message").notNull(),
});

/**
 * The tenancy anchor (ADR-0001, ADR-0009): `id` is *our* user id, which every
 * domain table's foreign key points at, and `clerk_user_id` holds Clerk's id
 * purely as an external reference — domain data never foreign-keys to Clerk's id.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The Item spine (ADR-0003): one table for every Type, scoped to a User. All is
 * not a table — it is the query "every item where user_id = me", so this is the
 * only table capture and All need. `type` and `status` are text with CHECK
 * constraints mirroring the shared ITEM_TYPES / ITEM_STATUSES enums (enum values
 * are cheap to revise, ADR-0003). `source`, `target_date` and `completed_at` are
 * all nullable: a link, a soft "by when", and a banked completion are each
 * optional facts about an Item, not preconditions for capturing one.
 *
 * There is deliberately no `past_target` column beside `target_date`: that state
 * is a question about *today*, so it is derived on every read instead (ADR-0005,
 * see ITEM_PROJECTION). A column would need a job to stay true at midnight.
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    source: text("source"),
    type: text("type", { enum: nonEmpty(ITEM_TYPES) }).notNull(),
    status: text("status", { enum: nonEmpty(ITEM_STATUSES) })
      .notNull()
      .default(Status.NotStarted),
    targetDate: date("target_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    // All lists a User's Items; every read is scoped by user_id, so index it.
    index("items_user_id_idx").on(table.userId),
    // Composite owner keys let membership reference an Item together with its
    // User. id remains the model identity; this exists only for
    // tenant-consistency foreign keys on cross-domain joins.
    unique("items_id_user_id_idx").on(table.id, table.userId),
    check("items_type_check", sql`${table.type} in ${enumList(ITEM_TYPES)}`),
    check(
      "items_status_check",
      sql`${table.status} in ${enumList(ITEM_STATUSES)}`,
    ),
  ],
);

/**
 * Labels are the User-owned, flat categorisation axis over the Library
 * (ADR-0014). Names are free text and need not be unique: identity lives in the
 * opaque id, while user_id keeps every Label inside one private space.
 */
export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
  },
  (table) => [
    index("labels_user_id_idx").on(table.userId),
    unique("labels_id_user_id_idx").on(table.id, table.userId),
  ],
);

/**
 * Label membership is a bare many-to-many set independent of Stop placement.
 * The repeated User anchor plus paired owner foreign keys make it impossible to
 * categorise one User's Item with another User's Label at the database boundary.
 */
export const itemLabels = pgTable(
  "item_labels",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    itemId: uuid("item_id").notNull(),
    labelId: uuid("label_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.labelId] }),
    foreignKey({
      name: "item_labels_item_owner_fk",
      columns: [table.itemId, table.userId],
      foreignColumns: [items.id, items.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "item_labels_label_owner_fk",
      columns: [table.labelId, table.userId],
      foreignColumns: [labels.id, labels.userId],
    }).onDelete("cascade"),
    index("item_labels_label_id_idx").on(table.labelId),
  ],
);

/**
 * trails: the Trail promoted to a first-class, User-owned record (ADR-0014).
 * The journey has an identity of its own: an opaque `id` that a URL carries and
 * that survives a rename, a `name`, and `created_at` (the stable order the index
 * lists in). There is deliberately no progress column — a Trail's progress is
 * *derived* on read from its Stops' Items (like the derived `past_target`,
 * ADR-0005), never stored.
 */
export const trails = pgTable(
  "trails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("trails_user_id_idx").on(table.userId),
    // Expose the owner beside the id, as items and stops do, so a Stop can prove
    // both ends belong to the same User.
    unique("trails_id_user_id_idx").on(table.id, table.userId),
  ],
);

/**
 * Stops: the single organising primitive (ADR-0004), scoped to a User like every
 * other domain table. There is deliberately no `kind` column — one uniform Stop
 * serves both a topic to learn and a project to build, because v1 makes the two
 * behave identically. Names are not unique: two Stops may share one, since a
 * Stop is identified by its id and the User is free to name their space as they
 * like.
 *
 * A Stop belongs to exactly one Trail (ADR-0014, Stop-as-waypoint). The
 * composite owner foreign key keeps a Stop and its Trail owned by the same User
 * — an edge this table can never cross even when `trail_id` is set by a write
 * that bypasses the repository.
 */
export const stops = pgTable(
  "stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    trailId: uuid("trail_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "stops_trail_owner_fk",
      columns: [table.trailId, table.userId],
      foreignColumns: [trails.id, trails.userId],
    }).onDelete("cascade"),
    index("stops_user_id_idx").on(table.userId),
    // As for Items, expose the owner beside the id so StopItem can prove both
    // ends belong to the User recorded on the membership.
    unique("stops_id_user_id_idx").on(table.id, table.userId),
    // The same shape for the Trail, so an edge can prove both of its endpoints
    // sit on the Trail it names.
    unique("stops_id_trail_id_idx").on(table.id, table.trailId),
    index("stops_trail_id_idx").on(table.trailId),
  ],
);

/**
 * StopItem: membership plus its mandatory tenancy anchor, and nothing else
 * (ADR-0001, ADR-0004, ADR-0009). The composite primary key makes the two ends
 * the membership identity and a Stop's contents a set, so the same Item cannot
 * be held twice however it is added. There is no `position` (a Stop is
 * unordered; sequencing lives on the Trail) and no `status` (one Status lives on
 * the Item, shared by every Stop holding it) — either column would be a second
 * place to keep the same domain fact true.
 *
 * user_id is deliberately repeated as a security constraint: the paired foreign
 * keys below make disagreement impossible at the database boundary, even for a
 * write that bypasses the repository. Every domain table therefore points at our
 * User anchor, as ADR-0009 requires.
 */
export const stopItems = pgTable(
  "stop_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => stops.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.stopId, table.itemId] }),
    foreignKey({
      name: "stop_items_stop_owner_fk",
      columns: [table.stopId, table.userId],
      foreignColumns: [stops.id, stops.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "stop_items_item_owner_fk",
      columns: [table.itemId, table.userId],
      foreignColumns: [items.id, items.userId],
    }).onDelete("cascade"),
    // The primary key already indexes stop_id (a Stop's contents); this covers
    // the other direction — every Stop holding a given Item.
    index("stop_items_item_id_idx").on(table.itemId),
  ],
);

/**
 * trail_edges: the Trail's adjacency edge list (ADR-0010, #94). One row per
 * directed Stop-to-Stop edge, scoped to a User *and* to the one Trail it belongs
 * to. There is deliberately no `position` and no `x`/`y`: parallel forks are
 * unordered and canvas layout is derived from topology on read (like the derived
 * `past_target`), so the Trail stays a lightweight topology and there is no
 * second place for the plan to drift.
 *
 * Composite owner foreign keys run in two directions. `(from_stop_id, user_id)`
 * and `(to_stop_id, user_id)` into `stops (id, user_id)` mean an edge can only
 * ever join two of the *same* User's Stops; `(from_stop_id, trail_id)` and
 * `(to_stop_id, trail_id)` into `stops (id, trail_id)` mean it can only join two
 * Stops that share its Trail. All four cascade, so deleting a Stop takes every
 * edge touching it with it. The primary key makes the edge set a set (no
 * duplicate edge), and the CHECK forbids a self-loop at the database.
 * Acyclicity is the one invariant the schema cannot cheaply declare, so the
 * repository owns it at the API write seam.
 */
export const trailEdges = pgTable(
  "trail_edges",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    fromStopId: uuid("from_stop_id").notNull(),
    toStopId: uuid("to_stop_id").notNull(),
    trailId: uuid("trail_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.fromStopId, table.toStopId],
    }),
    check(
      "trail_edges_no_self_loop",
      sql`${table.fromStopId} <> ${table.toStopId}`,
    ),
    foreignKey({
      name: "trail_edges_from_owner_fk",
      columns: [table.fromStopId, table.userId],
      foreignColumns: [stops.id, stops.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "trail_edges_to_owner_fk",
      columns: [table.toStopId, table.userId],
      foreignColumns: [stops.id, stops.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "trail_edges_from_trail_fk",
      columns: [table.fromStopId, table.trailId],
      foreignColumns: [stops.id, stops.trailId],
    }).onDelete("cascade"),
    foreignKey({
      name: "trail_edges_to_trail_fk",
      columns: [table.toStopId, table.trailId],
      foreignColumns: [stops.id, stops.trailId],
    }).onDelete("cascade"),
    // The primary key indexes out-edges (a Stop's successors, keyed from the
    // front); this covers the other direction — every edge leading into a given
    // Stop, which the layout's longest-path layering walks.
    index("trail_edges_to_stop_id_idx").on(table.userId, table.toStopId),
    // Reading and rewiring a Trail always scopes by `(user_id, trail_id)`, so
    // index the Trail an edge belongs to.
    index("trail_edges_trail_id_idx").on(table.userId, table.trailId),
  ],
);

/**
 * Render a shared enum as a SQL `IN` list. The values come from
 * `@unshelf/shared`, so a new Type or Status changes the generated `CHECK`
 * automatically rather than needing this file edited.
 *
 * `sql.raw` is required, not a shortcut: interpolating with `sql`${value}``
 * produces *bound parameters*, and `drizzle-kit` serialises those into the
 * migration as literal `$1, $2, …` placeholders — DDL Postgres rejects. A CHECK
 * constraint has no parameter binding to be bound at, so the values must be
 * inlined. They are our own enum members, never user input.
 */
function enumList(values: readonly string[]) {
  return sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);
}

/**
 * Retype a shared enum's values as the non-empty tuple drizzle's `enum` option
 * requires. `Object.values(SomeEnum)` widens to `T[]`, which loses the "at least
 * one element" guarantee TypeScript wants here — the values are identical and a
 * TypeScript enum can never be empty, so this is a retype, not a change.
 *
 * It buys the column a narrowed type without a `.$type<>()` brand (#114), and
 * leaves the generated DDL byte-identical: the `CHECK` above, not this, is what
 * the database enforces.
 */
function nonEmpty<T extends string>(values: readonly T[]): [T, ...T[]] {
  return values as [T, ...T[]];
}
