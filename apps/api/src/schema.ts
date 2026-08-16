import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ITEM_STATUSES,
  ITEM_STATUS_MODES,
  ITEM_TYPES,
  PLAN_NODE_KINDS,
  Status,
  StatusMode,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    type: text("type", { enum: nonEmpty(ITEM_TYPES) }).notNull(),
    status: text("status", { enum: nonEmpty(ITEM_STATUSES) })
      .notNull()
      .default(Status.NotStarted),
    statusMode: text("status_mode", { enum: nonEmpty(ITEM_STATUS_MODES) })
      .notNull()
      .default(StatusMode.Manual),
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
    check(
      "items_status_mode_check",
      sql`${table.statusMode} in ${enumList(ITEM_STATUS_MODES)}`,
    ),
  ],
);

/** One User-owned Daily Focus for each canonical server calendar date. */
export const dailyFocuses = pgTable(
  "daily_focuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date")
      .notNull()
      .default(sql`current_date`),
  },
  (table) => [
    unique("daily_focuses_user_date_unique").on(table.userId, table.date),
    unique("daily_focuses_id_user_id_idx").on(table.id, table.userId),
  ],
);

/** Set membership of whole shared Items in one dated Daily Focus. */
export const dailyFocusItems = pgTable(
  "daily_focus_items",
  {
    dailyFocusId: uuid("daily_focus_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    itemId: uuid("item_id").notNull(),
    statusSnapshot: text("status_snapshot", {
      enum: nonEmpty(ITEM_STATUSES),
    }).notNull(),
    partPercentageSnapshot: integer("part_percentage_snapshot"),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.dailyFocusId, table.itemId] }),
    foreignKey({
      name: "daily_focus_items_focus_owner_fk",
      columns: [table.dailyFocusId, table.userId],
      foreignColumns: [dailyFocuses.id, dailyFocuses.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "daily_focus_items_item_owner_fk",
      columns: [table.itemId, table.userId],
      foreignColumns: [items.id, items.userId],
    }).onDelete("cascade"),
    unique("daily_focus_items_identity_idx").on(
      table.dailyFocusId,
      table.userId,
      table.itemId,
    ),
    index("daily_focus_items_user_id_idx").on(table.userId),
    check(
      "daily_focus_items_status_snapshot_check",
      sql`${table.statusSnapshot} in ${enumList(ITEM_STATUSES)}`,
    ),
    check(
      "daily_focus_items_part_percentage_snapshot_check",
      sql`${table.partPercentageSnapshot} between 0 and 100`,
    ),
  ],
);

/** Date-scoped suggestion suppression; it is not a permanent preference. */
export const dailyPlanningSuppressions = pgTable(
  "daily_planning_suppressions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    itemId: uuid("item_id").notNull(),
    date: date("date")
      .notNull()
      .default(sql`current_date`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId, table.date] }),
    foreignKey({
      name: "daily_planning_suppressions_item_owner_fk",
      columns: [table.itemId, table.userId],
      foreignColumns: [items.id, items.userId],
    }).onDelete("cascade"),
    index("daily_planning_suppressions_user_date_idx").on(
      table.userId,
      table.date,
    ),
  ],
);

/** Ordered, lightweight checklist entries that structure one shared Item. */
export const parts = pgTable(
  "parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    itemId: uuid("item_id").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    completed: boolean("completed").notNull().default(false),
  },
  (table) => [
    foreignKey({
      name: "parts_item_owner_fk",
      columns: [table.itemId, table.userId],
      foreignColumns: [items.id, items.userId],
    }).onDelete("cascade"),
    unique("parts_item_position_idx").on(table.itemId, table.position),
    unique("parts_id_user_id_idx").on(table.id, table.userId),
    index("parts_item_id_idx").on(table.itemId),
    check("parts_title_nonblank_check", sql`btrim(${table.title}) <> ''`),
    check("parts_position_nonnegative_check", sql`${table.position} >= 0`),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    unique("learning_plan_item_placements_origin_identity_idx").on(
      table.id,
      table.userId,
      table.itemId,
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

/** Optional navigation context from a focus entry to its current Plan placement. */
export const dailyFocusItemOrigins = pgTable(
  "daily_focus_item_origins",
  {
    dailyFocusId: uuid("daily_focus_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    itemId: uuid("item_id").notNull(),
    placementId: uuid("placement_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.dailyFocusId, table.itemId] }),
    foreignKey({
      name: "daily_focus_item_origins_focus_item_fk",
      columns: [table.dailyFocusId, table.userId, table.itemId],
      foreignColumns: [
        dailyFocusItems.dailyFocusId,
        dailyFocusItems.userId,
        dailyFocusItems.itemId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "daily_focus_item_origins_placement_fk",
      columns: [table.placementId, table.userId, table.itemId],
      foreignColumns: [
        learningPlanItemPlacements.id,
        learningPlanItemPlacements.userId,
        learningPlanItemPlacements.itemId,
      ],
    }).onDelete("cascade"),
    index("daily_focus_item_origins_user_id_idx").on(table.userId),
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

/** Shared Provider targets contain no User identity (ADR-0020). */
export const discoverProviderTargets = pgTable(
  "discover_provider_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    targetKind: text("target_kind").notNull(),
    acquisitionScope: text("acquisition_scope").notNull().default("system"),
    externalReference: text("external_reference"),
    targetPayload: jsonb("target_payload"),
    checkpointPayload: jsonb("checkpoint_payload"),
    acquisitionGeneration: integer("acquisition_generation")
      .notNull()
      .default(0),
    currentSnapshotId: uuid("current_snapshot_id"),
    verifiedCoverageStartedAt: timestamp("verified_coverage_started_at", {
      withTimezone: true,
    }),
    nextEligibleAt: timestamp("next_eligible_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("discover_provider_targets_identity_unique")
      .on(
        table.provider,
        table.targetKind,
        table.acquisitionScope,
        table.externalReference,
      )
      .where(sql`${table.externalReference} IS NOT NULL`),
    check(
      "discover_provider_targets_provider_check",
      sql`${table.provider} = 'youtube'`,
    ),
    check(
      "discover_provider_targets_kind_check",
      sql`${table.targetKind} = 'channel'`,
    ),
    check(
      "discover_provider_targets_generation_check",
      sql`${table.acquisitionGeneration} >= 0`,
    ),
    check(
      "discover_provider_targets_expiry_check",
      sql`(
        ${table.externalReference} IS NULL
        AND ${table.targetPayload} IS NULL
        AND ${table.fetchedAt} IS NULL
        AND ${table.expiresAt} IS NULL
      ) OR (
        ${table.externalReference} IS NOT NULL
        AND ${table.targetPayload} IS NOT NULL
        AND ${table.fetchedAt} IS NOT NULL
        AND ${table.expiresAt} > ${table.fetchedAt}
      )`,
    ),
  ],
);

/** One request-owned Provider attempt; no row contains User identity. */
export const discoverAcquisitionAttempts = pgTable(
  "discover_acquisition_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerTargetId: uuid("provider_target_id")
      .notNull()
      .references(() => discoverProviderTargets.id),
    generation: integer("generation").notNull(),
    trigger: text("trigger").notNull(),
    outcome: text("outcome").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    acceptedCount: integer("accepted_count"),
    rejectedCount: integer("rejected_count"),
    coverageStartedAt: timestamp("coverage_started_at", {
      withTimezone: true,
    }),
    nextEligibleAt: timestamp("next_eligible_at", { withTimezone: true }),
    errorClass: text("error_class"),
  },
  (table) => [
    unique("discover_acquisition_attempts_target_generation_unique").on(
      table.providerTargetId,
      table.generation,
    ),
    index("discover_acquisition_attempts_target_started_idx").on(
      table.providerTargetId,
      table.startedAt,
    ),
    check(
      "discover_acquisition_attempts_trigger_check",
      sql`${table.trigger} = 'manual_follow'`,
    ),
    check(
      "discover_acquisition_attempts_outcome_check",
      sql`${table.outcome} IN ('running', 'complete', 'partial', 'failed', 'skipped', 'throttled', 'provider_unavailable')`,
    ),
    check(
      "discover_acquisition_attempts_counts_check",
      sql`(${table.acceptedCount} IS NULL OR ${table.acceptedCount} >= 0)
        AND (${table.rejectedCount} IS NULL OR ${table.rejectedCount} >= 0)`,
    ),
    check(
      "discover_acquisition_attempts_terminal_check",
      sql`(
        ${table.outcome} = 'running'
        AND ${table.finishedAt} IS NULL
        AND ${table.acceptedCount} IS NULL
        AND ${table.rejectedCount} IS NULL
      ) OR (
        ${table.outcome} <> 'running'
        AND ${table.finishedAt} IS NOT NULL
        AND ${table.acceptedCount} IS NOT NULL
        AND ${table.rejectedCount} IS NOT NULL
      )`,
    ),
  ],
);

/** Purgeable current target display metadata, separate from stable target identity. */
export const discoverProviderTargetProjections = pgTable(
  "discover_provider_target_projections",
  {
    providerTargetId: uuid("provider_target_id")
      .primaryKey()
      .references(() => discoverProviderTargets.id),
    publisher: text("publisher").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "discover_target_projection_expiry_check",
      sql`${table.expiresAt} > ${table.fetchedAt}`,
    ),
  ],
);

/** Durable shared result identity; display metadata lives in the purgeable projection. */
export const discoverProviderResults = pgTable(
  "discover_provider_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalReference: text("external_reference"),
  },
  (table) => [
    uniqueIndex("discover_provider_results_identity_unique")
      .on(table.provider, table.externalReference)
      .where(sql`${table.externalReference} IS NOT NULL`),
    check(
      "discover_provider_results_provider_check",
      sql`${table.provider} = 'youtube'`,
    ),
  ],
);

export const discoverProviderResultProjections = pgTable(
  "discover_provider_result_projections",
  {
    providerResultId: uuid("provider_result_id")
      .primaryKey()
      .references(() => discoverProviderResults.id),
    title: text("title").notNull(),
    source: text("source").notNull(),
    publisher: text("publisher").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    type: text("type").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "discover_result_projection_type_check",
      sql`${table.type} = 'video'`,
    ),
    check(
      "discover_result_projection_duration_check",
      sql`${table.durationSeconds} > 0`,
    ),
    check(
      "discover_result_projection_expiry_check",
      sql`${table.expiresAt} > ${table.fetchedAt}`,
    ),
  ],
);

export const discoverProviderSnapshots = pgTable(
  "discover_provider_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerTargetId: uuid("provider_target_id")
      .notNull()
      .references(() => discoverProviderTargets.id),
    acquisitionAttemptId: uuid("acquisition_attempt_id")
      .unique()
      .references(() => discoverAcquisitionAttempts.id),
    sequence: integer("sequence").notNull(),
    outcome: text("outcome").notNull(),
    rejectedCount: integer("rejected_count").notNull(),
    coverageStartedAt: timestamp("coverage_started_at", {
      withTimezone: true,
    }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("discover_provider_snapshots_id_target_unique").on(
      table.id,
      table.providerTargetId,
    ),
    unique("discover_provider_snapshots_target_sequence_unique").on(
      table.providerTargetId,
      table.sequence,
    ),
    check(
      "discover_provider_snapshots_outcome_check",
      sql`${table.outcome} IN ('preview', 'partial', 'empty')`,
    ),
    check(
      "discover_provider_snapshots_rejected_count_check",
      sql`${table.rejectedCount} >= 0`,
    ),
  ],
);

export const discoverProviderSnapshotResults = pgTable(
  "discover_provider_snapshot_results",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => discoverProviderSnapshots.id),
    providerResultId: uuid("provider_result_id")
      .notNull()
      .references(() => discoverProviderResults.id),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.providerResultId] }),
    unique("discover_snapshot_results_position_unique").on(
      table.snapshotId,
      table.position,
    ),
    check(
      "discover_snapshot_results_position_check",
      sql`${table.position} >= 0`,
    ),
  ],
);

/** User-specific opaque receipt over one exact shared snapshot. */
export const discoverFollowPreviews = pgTable(
  "discover_follow_previews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    providerTargetId: uuid("provider_target_id")
      .notNull()
      .references(() => discoverProviderTargets.id),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => discoverProviderSnapshots.id),
    targetUrl: text("target_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    unique("discover_follow_previews_identity_unique").on(
      table.id,
      table.userId,
      table.snapshotId,
    ),
    foreignKey({
      columns: [table.snapshotId, table.providerTargetId],
      foreignColumns: [
        discoverProviderSnapshots.id,
        discoverProviderSnapshots.providerTargetId,
      ],
    }),
    index("discover_follow_previews_expiry_idx").on(table.expiresAt),
    check(
      "discover_follow_previews_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "discover_follow_previews_consumed_check",
      sql`${table.consumedAt} IS NULL OR ${table.consumedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const discoverFollowPreviewResults = pgTable(
  "discover_follow_preview_results",
  {
    previewId: uuid("preview_id").notNull(),
    userId: uuid("user_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    providerResultId: uuid("provider_result_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.previewId, table.providerResultId] }),
    unique("discover_follow_preview_results_position_unique").on(
      table.previewId,
      table.position,
    ),
    foreignKey({
      columns: [table.previewId, table.userId, table.snapshotId],
      foreignColumns: [
        discoverFollowPreviews.id,
        discoverFollowPreviews.userId,
        discoverFollowPreviews.snapshotId,
      ],
    }),
    foreignKey({
      columns: [table.snapshotId, table.providerResultId],
      foreignColumns: [
        discoverProviderSnapshotResults.snapshotId,
        discoverProviderSnapshotResults.providerResultId,
      ],
    }),
    check(
      "discover_follow_preview_results_position_check",
      sql`${table.position} >= 0`,
    ),
  ],
);

/** One User-owned Follow per shared target across every lifecycle. */
export const discoverFollows = pgTable(
  "discover_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    providerTargetId: uuid("provider_target_id")
      .notNull()
      .references(() => discoverProviderTargets.id),
    targetUrl: text("target_url").notNull(),
    lifecycle: text("lifecycle").notNull().default("active"),
    lastAppliedProviderSnapshotId: uuid("last_applied_provider_snapshot_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("discover_follows_user_target_unique").on(
      table.userId,
      table.providerTargetId,
    ),
    unique("discover_follows_identity_owner_unique").on(table.id, table.userId),
    unique("discover_follows_identity_target_unique").on(
      table.id,
      table.userId,
      table.providerTargetId,
    ),
    foreignKey({
      name: "discover_follows_applied_snapshot_target_fk",
      columns: [table.lastAppliedProviderSnapshotId, table.providerTargetId],
      foreignColumns: [
        discoverProviderSnapshots.id,
        discoverProviderSnapshots.providerTargetId,
      ],
    }),
    index("discover_follows_user_lifecycle_idx").on(
      table.userId,
      table.lifecycle,
    ),
    check(
      "discover_follows_lifecycle_check",
      sql`${table.lifecycle} IN ('active', 'paused', 'removed')`,
    ),
  ],
);

/** One private Candidate for one retained Provider result and User. */
export const discoverCandidates = pgTable(
  "discover_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    providerResultId: uuid("provider_result_id")
      .notNull()
      .references(() => discoverProviderResults.id),
    itemId: uuid("item_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("discover_candidates_user_result_unique").on(
      table.userId,
      table.providerResultId,
    ),
    unique("discover_candidates_identity_owner_unique").on(
      table.id,
      table.userId,
    ),
    unique("discover_candidates_item_unique").on(table.itemId),
    foreignKey({
      name: "discover_candidates_item_owner_fk",
      columns: [table.itemId, table.userId],
      foreignColumns: [items.id, items.userId],
    }),
    index("discover_candidates_user_id_idx").on(table.userId),
  ],
);

/** Detection state for one Follow surfacing one Candidate. */
export const discoverFollowCandidatePresence = pgTable(
  "discover_follow_candidate_presence",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    followId: uuid("follow_id").notNull(),
    candidateId: uuid("candidate_id").notNull(),
    appearanceSequence: integer("appearance_sequence").notNull().default(1),
    present: boolean("present").notNull().default(true),
    firstSurfacedSnapshotId: uuid("first_surfaced_snapshot_id")
      .notNull()
      .references(() => discoverProviderSnapshots.id),
    lastSurfacedSnapshotId: uuid("last_surfaced_snapshot_id")
      .notNull()
      .references(() => discoverProviderSnapshots.id),
  },
  (table) => [
    primaryKey({ columns: [table.followId, table.candidateId] }),
    unique("discover_presence_identity_owner_unique").on(
      table.followId,
      table.candidateId,
      table.userId,
    ),
    unique("discover_presence_occurrence_owner_unique").on(
      table.followId,
      table.candidateId,
      table.appearanceSequence,
      table.userId,
    ),
    foreignKey({
      name: "discover_presence_follow_owner_fk",
      columns: [table.followId, table.userId],
      foreignColumns: [discoverFollows.id, discoverFollows.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "discover_presence_candidate_owner_fk",
      columns: [table.candidateId, table.userId],
      foreignColumns: [discoverCandidates.id, discoverCandidates.userId],
    }).onDelete("cascade"),
    index("discover_presence_user_id_idx").on(table.userId),
    check(
      "discover_presence_sequence_check",
      sql`${table.appearanceSequence} > 0`,
    ),
  ],
);

/** One durable occurrence in the User's Discover intake. */
export const discoverDiscoveries = pgTable(
  "discover_discoveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    followId: uuid("follow_id").notNull(),
    candidateId: uuid("candidate_id").notNull(),
    appearanceSequence: integer("appearance_sequence").notNull(),
    position: integer("position").notNull(),
    state: text("state").notNull().default("new"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    unique("discover_discoveries_occurrence_unique").on(
      table.followId,
      table.candidateId,
      table.appearanceSequence,
    ),
    unique("discover_discoveries_identity_owner_unique").on(
      table.id,
      table.userId,
    ),
    foreignKey({
      name: "discover_discoveries_presence_owner_fk",
      columns: [table.followId, table.candidateId, table.userId],
      foreignColumns: [
        discoverFollowCandidatePresence.followId,
        discoverFollowCandidatePresence.candidateId,
        discoverFollowCandidatePresence.userId,
      ],
    }).onDelete("cascade"),
    index("discover_discoveries_user_state_idx").on(
      table.userId,
      table.state,
      table.discoveredAt,
    ),
    check("discover_discoveries_position_check", sql`${table.position} >= 0`),
    check(
      "discover_discoveries_state_check",
      sql`${table.state} IN ('new', 'seen', 'kept', 'dismissed')`,
    ),
    check(
      "discover_discoveries_state_timestamps_check",
      sql`(
        ${table.state} = 'new'
        AND ${table.seenAt} IS NULL
        AND ${table.decidedAt} IS NULL
      ) OR (
        ${table.state} = 'seen'
        AND ${table.seenAt} IS NOT NULL
        AND ${table.decidedAt} IS NULL
      ) OR (
        ${table.state} IN ('kept', 'dismissed')
        AND ${table.decidedAt} IS NOT NULL
      )`,
    ),
  ],
);

/** Stable mutation results keyed within one User and operation. */
export const discoverIdempotency = pgTable(
  "discover_idempotency",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    operation: text("operation").notNull(),
    requestId: uuid("request_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    resultPayload: jsonb("result_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.operation, table.requestId] }),
    check(
      "discover_idempotency_operation_check",
      sql`${table.operation} = 'confirm_follow'`,
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
