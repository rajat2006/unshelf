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
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  PLAN_NODE_KINDS,
  Status,
} from "@unshelf/shared";

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
 * Label membership is a bare many-to-many set independent of Stage placement.
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
 * learningPlans: the LearningPlan promoted to a first-class, User-owned record (ADR-0014).
 * The journey has an identity of its own: an opaque `id` that a URL carries and
 * that survives a rename, a `name`, `created_at` (the stable order the index
 * lists in), and nullable `archived_at` for its active/archive lifecycle. There
 * is deliberately no progress column — progress is derived on read from current
 * direct and Stage placements (like the derived `past_target`, ADR-0005), never
 * stored.
 */
export const learningPlans = pgTable(
  "learning_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("learning_plans_user_id_idx").on(table.userId),
    // Expose the owner beside the id, as items and stages do, so a Stage can prove
    // both ends belong to the same User.
    unique("learning_plans_id_user_id_idx").on(table.id, table.userId),
  ],
);

/**
 * The topology boundary for a Learning Plan. In this migration every node is a
 * Stage. The explicit node record is required by ADR-0018's topology boundary:
 * every edge joins Plan Node identities without manufacturing a Stage wrapper.
 */
export const learningPlanNodes = pgTable(
  "learning_plan_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    learningPlanId: uuid("learning_plan_id").notNull(),
    kind: text("kind", { enum: nonEmpty(PLAN_NODE_KINDS) }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "learning_plan_nodes_plan_owner_fk",
      columns: [table.learningPlanId, table.userId],
      foreignColumns: [learningPlans.id, learningPlans.userId],
    }).onDelete("cascade"),
    unique("learning_plan_nodes_id_user_id_idx").on(table.id, table.userId),
    unique("learning_plan_nodes_id_plan_id_idx").on(
      table.id,
      table.learningPlanId,
    ),
    unique("learning_plan_nodes_identity_idx").on(
      table.id,
      table.userId,
      table.learningPlanId,
    ),
    unique("learning_plan_nodes_typed_identity_idx").on(
      table.id,
      table.userId,
      table.learningPlanId,
      table.kind,
    ),
    index("learning_plan_nodes_plan_id_idx").on(
      table.userId,
      table.learningPlanId,
    ),
    check(
      "learning_plan_nodes_kind_check",
      sql`${table.kind} in ${enumList(PLAN_NODE_KINDS)}`,
    ),
  ],
);

/**
 * Stages: the single organising primitive (ADR-0004), scoped to a User like every
 * other domain table. There is deliberately no `kind` column — one uniform Stage
 * serves both a topic to learn and a project to build, because v1 makes the two
 * behave identically. Names are not unique: two Stages may share one, since a
 * Stage is identified by its id and the User is free to name their space as they
 * like.
 *
 * A Stage belongs to exactly one LearningPlan (ADR-0014, Stage-as-waypoint). The
 * composite owner foreign key keeps a Stage and its LearningPlan owned by the same User
 * — an edge this table can never cross even when `learningPlan_id` is set by a write
 * that bypasses the repository.
 */
export const stages = pgTable(
  "stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    learningPlanId: uuid("learning_plan_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "stages_plan_owner_fk",
      columns: [table.learningPlanId, table.userId],
      foreignColumns: [learningPlans.id, learningPlans.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "stages_node_identity_fk",
      columns: [table.id, table.userId, table.learningPlanId],
      foreignColumns: [
        learningPlanNodes.id,
        learningPlanNodes.userId,
        learningPlanNodes.learningPlanId,
      ],
    }).onDelete("cascade"),
    index("stages_user_id_idx").on(table.userId),
    // As for Items, expose the owner beside the id so StageItem can prove both
    // ends belong to the User recorded on the membership.
    unique("stages_id_user_id_idx").on(table.id, table.userId),
    // The same shape for the LearningPlan, so an edge can prove both of its endpoints
    // sit on the LearningPlan it names.
    unique("stages_id_plan_id_idx").on(table.id, table.learningPlanId),
    unique("stages_identity_idx").on(
      table.id,
      table.userId,
      table.learningPlanId,
    ),
    index("stages_plan_id_idx").on(table.learningPlanId),
  ],
);

/**
 * The one placement registry for direct Items and Items grouped in Stages.
 * Its plan-scoped Item uniqueness spans both variants, while the nullable
 * variant anchors are constrained so each row is exactly one of them.
 */
export const learningPlanItemPlacements = pgTable(
  "learning_plan_item_placements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    learningPlanId: uuid("learning_plan_id").notNull(),
    itemId: uuid("item_id").notNull(),
    stageId: uuid("stage_id"),
    nodeId: uuid("node_id"),
    nodeKind: text("node_kind", { enum: nonEmpty(PLAN_NODE_KINDS) }),
  },
  (table) => [
    foreignKey({
      name: "learning_plan_item_placements_plan_owner_fk",
      columns: [table.learningPlanId, table.userId],
      foreignColumns: [learningPlans.id, learningPlans.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "learning_plan_item_placements_item_owner_fk",
      columns: [table.itemId, table.userId],
      foreignColumns: [items.id, items.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "learning_plan_item_placements_stage_fk",
      columns: [table.stageId, table.userId, table.learningPlanId],
      foreignColumns: [stages.id, stages.userId, stages.learningPlanId],
    }).onDelete("cascade"),
    foreignKey({
      name: "learning_plan_item_placements_node_fk",
      columns: [
        table.nodeId,
        table.userId,
        table.learningPlanId,
        table.nodeKind,
      ],
      foreignColumns: [
        learningPlanNodes.id,
        learningPlanNodes.userId,
        learningPlanNodes.learningPlanId,
        learningPlanNodes.kind,
      ],
    }).onDelete("cascade"),
    unique("learning_plan_item_placements_item_plan_unique").on(
      table.itemId,
      table.learningPlanId,
    ),
    unique("learning_plan_item_placements_id_identity_idx").on(
      table.id,
      table.userId,
      table.learningPlanId,
    ),
    unique("learning_plan_item_placements_stage_identity_idx").on(
      table.id,
      table.userId,
      table.learningPlanId,
      table.itemId,
      table.stageId,
    ),
    unique("learning_plan_item_placements_node_unique").on(table.nodeId),
    index("learning_plan_item_placements_plan_idx").on(
      table.userId,
      table.learningPlanId,
    ),
    check(
      "learning_plan_item_placements_variant_check",
      sql`(
        ${table.stageId} is not null
        and ${table.nodeId} is null
        and ${table.nodeKind} is null
      ) or (
        ${table.stageId} is null
        and ${table.nodeId} is not null
        and ${table.nodeKind} = 'item'
      )`,
    ),
  ],
);

/**
 * StageItem: membership plus its mandatory User and LearningPlan invariant anchors
 * (ADR-0001, ADR-0004, ADR-0009). The composite primary key makes the two ends
 * the membership identity, so the same Item cannot be held twice however it is
 * added. Repeating `learning_plan_id` lets PostgreSQL enforce that an Item appears
 * in at most one Stage on a Learning Plan. `position` stores the Stage-local Item
 * order; there is no `status`, because one Status lives on the Item and is shared
 * by every Stage holding it.
 *
 * user_id and learningPlan_id are deliberately repeated as constraints: the foreign
 * keys below make disagreement impossible at the database boundary, even for a
 * write that bypasses the repository. Every domain table therefore points at our
 * User anchor, as ADR-0009 requires.
 */
export const stageItems = pgTable(
  "stage_items",
  {
    placementId: uuid("placement_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    learningPlanId: uuid("learning_plan_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.stageId, table.itemId] }),
    foreignKey({
      name: "stage_items_placement_fk",
      columns: [
        table.placementId,
        table.userId,
        table.learningPlanId,
        table.itemId,
        table.stageId,
      ],
      foreignColumns: [
        learningPlanItemPlacements.id,
        learningPlanItemPlacements.userId,
        learningPlanItemPlacements.learningPlanId,
        learningPlanItemPlacements.itemId,
        learningPlanItemPlacements.stageId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "stage_items_stage_owner_fk",
      columns: [table.stageId, table.userId],
      foreignColumns: [stages.id, stages.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "stage_items_item_owner_fk",
      columns: [table.itemId, table.userId],
      foreignColumns: [items.id, items.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "stage_items_stage_plan_fk",
      columns: [table.stageId, table.learningPlanId],
      foreignColumns: [stages.id, stages.learningPlanId],
    }).onDelete("cascade"),
    unique("stage_items_item_plan_unique").on(
      table.itemId,
      table.learningPlanId,
    ),
    unique("stage_items_stage_position_unique").on(
      table.stageId,
      table.position,
    ),
    unique("stage_items_placement_unique").on(table.placementId),
    // The primary key already indexes stage_id (a Stage's contents); this covers
    // the other direction — every Stage holding a given Item.
    index("stage_items_item_id_idx").on(table.itemId),
  ],
);

/**
 * learning_plan_edges: the Learning Plan's adjacency edge list (ADR-0010, ADR-0018).
 * One row per directed Plan-Node edge, scoped to a User and its Learning Plan
 * to. There is deliberately no `position` and no `x`/`y`: parallel forks are
 * unordered and canvas layout is derived from topology on read (like the derived
 * `past_target`), so the LearningPlan stays a lightweight topology and there is no
 * second place for the plan to drift.
 *
 * Composite owner and plan foreign keys run in both directions through
 * `learning_plan_nodes`, so an edge can only join nodes owned by the same User and
 * belonging to the Learning Plan it names. All four cascade, so deleting a node
 * takes every edge touching it with it. The primary key makes the edge set a set (no
 * duplicate edge), and the CHECK forbids a self-loop at the database.
 * Acyclicity is the one invariant the schema cannot cheaply declare, so the
 * repository owns it at the API write seam.
 */
export const learningPlanEdges = pgTable(
  "learning_plan_edges",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    fromNodeId: uuid("from_node_id").notNull(),
    toNodeId: uuid("to_node_id").notNull(),
    learningPlanId: uuid("learning_plan_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.fromNodeId, table.toNodeId],
    }),
    check(
      "learning_plan_edges_no_self_loop",
      sql`${table.fromNodeId} <> ${table.toNodeId}`,
    ),
    foreignKey({
      name: "learning_plan_edges_from_owner_fk",
      columns: [table.fromNodeId, table.userId],
      foreignColumns: [learningPlanNodes.id, learningPlanNodes.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "learning_plan_edges_to_owner_fk",
      columns: [table.toNodeId, table.userId],
      foreignColumns: [learningPlanNodes.id, learningPlanNodes.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "learning_plan_edges_from_plan_fk",
      columns: [table.fromNodeId, table.learningPlanId],
      foreignColumns: [learningPlanNodes.id, learningPlanNodes.learningPlanId],
    }).onDelete("cascade"),
    foreignKey({
      name: "learning_plan_edges_to_plan_fk",
      columns: [table.toNodeId, table.learningPlanId],
      foreignColumns: [learningPlanNodes.id, learningPlanNodes.learningPlanId],
    }).onDelete("cascade"),
    // The primary key indexes out-edges (a node's successors, keyed from the
    // front); this covers the other direction — every edge leading into a given
    // node, which the layout's longest-path layering walks.
    index("learning_plan_edges_to_node_id_idx").on(
      table.userId,
      table.toNodeId,
    ),
    // Reading and rewiring a LearningPlan always scopes by `(user_id, learningPlan_id)`, so
    // index the LearningPlan an edge belongs to.
    index("learning_plan_edges_plan_id_idx").on(
      table.userId,
      table.learningPlanId,
    ),
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
