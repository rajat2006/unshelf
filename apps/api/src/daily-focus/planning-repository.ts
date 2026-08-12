import { and, asc, eq, sql } from "drizzle-orm";
import {
  Status,
  type DailyFocusOrigin,
  type DailyPlanning,
  type DailyPlanningQuery,
  type DailyPlanningSignal,
  type DailyPlanningSuggestion,
  type Item,
  type ItemId,
  type LearningPlanId,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { ITEM_PROJECTION, toItem } from "../items/repository";
import {
  dailyFocuses,
  dailyFocusItems,
  dailyPlanningSuppressions,
  items,
  learningPlans,
} from "../schema";

interface PlanningFacts {
  item: Item;
  activityAt: Date;
  yesterdayAddedAt: Date | string | null;
  selectedPlanPlacement: boolean;
  selectedStageId: string | null;
  selectedStageName: string | null;
  activePlanCount: number;
  contextNames: string;
  suppressedToday: boolean;
}

interface OrderedSuggestion extends DailyPlanningSuggestion {
  orderDate: string | null;
}

const SIGNAL_PRIORITY: Record<DailyPlanningSignal, number> = {
  unfinished_yesterday: 0,
  selected_plan: 1,
  dormant_in_progress: 2,
  approaching_target: 3,
  recently_captured_uncommitted: 4,
};

type PlanningResult =
  | { ok: true; planning: DailyPlanning }
  | { ok: false; error: "plan_not_found" };

/** Build today's transparent suggestion projection from current durable facts. */
export async function getDailyPlanning({
  db,
  userId,
  query,
}: {
  db: Database;
  userId: UserId;
  query: DailyPlanningQuery;
}): Promise<PlanningResult> {
  const selectedPlan = query.learningPlanId
    ? await readSelectedPlan(db, userId, query.learningPlanId)
    : null;
  if (query.learningPlanId && !selectedPlan) {
    return { ok: false, error: "plan_not_found" };
  }

  const rows = await db
    .select({
      ...ITEM_PROJECTION,
      activityAt: items.activityAt,
      yesterdayAddedAt: sql<Date | string | null>`(
        select daily_focus_items.added_at
        from daily_focus_items
        join daily_focuses
          on daily_focuses.id = daily_focus_items.daily_focus_id
          and daily_focuses.user_id = daily_focus_items.user_id
        where daily_focus_items.item_id = items.id
          and daily_focus_items.user_id = items.user_id
          and daily_focuses.date = current_date - 1
          and daily_focus_items.status_snapshot <> 'done'
        limit 1
      )`,
      selectedPlanPlacement: query.learningPlanId
        ? sql<boolean>`exists (
            select 1
            from learning_plan_item_placements
            where learning_plan_item_placements.item_id = items.id
              and learning_plan_item_placements.user_id = items.user_id
              and learning_plan_item_placements.learning_plan_id = ${query.learningPlanId}
          )`
        : sql<boolean>`false`,
      selectedStageId: query.learningPlanId
        ? sql<string | null>`(
            select learning_plan_item_placements.stage_id
            from learning_plan_item_placements
            where learning_plan_item_placements.item_id = items.id
              and learning_plan_item_placements.user_id = items.user_id
              and learning_plan_item_placements.learning_plan_id = ${query.learningPlanId}
            limit 1
          )`
        : sql<string | null>`null`,
      selectedStageName: query.learningPlanId
        ? sql<string | null>`(
            select stages.name
            from learning_plan_item_placements
            join stages
              on stages.id = learning_plan_item_placements.stage_id
              and stages.user_id = learning_plan_item_placements.user_id
            where learning_plan_item_placements.item_id = items.id
              and learning_plan_item_placements.user_id = items.user_id
              and learning_plan_item_placements.learning_plan_id = ${query.learningPlanId}
            limit 1
          )`
        : sql<string | null>`null`,
      activePlanCount: sql<number>`(
        select count(*)::integer
        from learning_plan_item_placements
        join learning_plans
          on learning_plans.id = learning_plan_item_placements.learning_plan_id
          and learning_plans.user_id = learning_plan_item_placements.user_id
        where learning_plan_item_placements.item_id = items.id
          and learning_plan_item_placements.user_id = items.user_id
          and learning_plans.archived_at is null
      )`,
      contextNames: sql<string>`coalesce((
        select string_agg(concat_ws(' ', learning_plans.name, stages.name), ' ')
        from learning_plan_item_placements
        join learning_plans
          on learning_plans.id = learning_plan_item_placements.learning_plan_id
          and learning_plans.user_id = learning_plan_item_placements.user_id
        left join stages
          on stages.id = learning_plan_item_placements.stage_id
          and stages.user_id = learning_plan_item_placements.user_id
        where learning_plan_item_placements.item_id = items.id
          and learning_plan_item_placements.user_id = items.user_id
      ), '')`,
      suppressedToday: sql<boolean>`exists (
        select 1
        from ${dailyPlanningSuppressions}
        where ${dailyPlanningSuppressions.itemId} = ${items.id}
          and ${dailyPlanningSuppressions.userId} = ${items.userId}
          and ${dailyPlanningSuppressions.date} = current_date
      )`,
    })
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        sql`not exists (
          select 1
          from ${dailyFocusItems}
          join ${dailyFocuses}
            on ${dailyFocuses.id} = ${dailyFocusItems.dailyFocusId}
            and ${dailyFocuses.userId} = ${dailyFocusItems.userId}
          where ${dailyFocusItems.itemId} = ${items.id}
            and ${dailyFocusItems.userId} = ${items.userId}
            and ${dailyFocuses.date} = current_date
        )`,
      ),
    )
    .orderBy(asc(items.id));

  const facts: PlanningFacts[] = rows.map((row) => ({
    item: toItem(row),
    activityAt: row.activityAt,
    yesterdayAddedAt: row.yesterdayAddedAt,
    selectedPlanPlacement: row.selectedPlanPlacement,
    selectedStageId: row.selectedStageId,
    selectedStageName: row.selectedStageName,
    activePlanCount: row.activePlanCount,
    contextNames: row.contextNames,
    suppressedToday: row.suppressedToday,
  }));
  const intentionTokens = lexicalTokens(query.intention ?? "");
  const relevant = facts.filter(
    (fact) =>
      fact.item.status !== Status.Done &&
      !fact.suppressedToday &&
      (intentionTokens.length === 0 ||
        intentionTokens.some((token) => lexicalNames(fact).has(token))),
  );

  return {
    ok: true,
    planning: {
      searchResults: searchItems(facts, query.query ?? ""),
      suggestions: relevant
        .map((fact) => suggestionFor(fact, selectedPlan))
        .filter(
          (suggestion): suggestion is OrderedSuggestion => suggestion !== null,
        )
        .sort((first, second) => compareSuggestions({ first, second }))
        .map(({ orderDate: _orderDate, ...suggestion }) => suggestion),
    },
  };
}

/** Persist one current-date dismissal only when the Item belongs to this User. */
export async function suppressDailyPlanningItem({
  db,
  userId,
  itemId,
}: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.userId, userId), eq(items.id, itemId)))
      .limit(1);
    if (!owned) return false;
    await tx
      .insert(dailyPlanningSuppressions)
      .values({ userId, itemId, date: sql`current_date` })
      .onConflictDoNothing();
    return true;
  });
}

async function readSelectedPlan(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
): Promise<{ id: LearningPlanId; name: string } | null> {
  const [plan] = await db
    .select({ id: learningPlans.id, name: learningPlans.name })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.id, learningPlanId),
        eq(learningPlans.userId, userId),
      ),
    )
    .limit(1);
  return plan ? { id: plan.id as LearningPlanId, name: plan.name } : null;
}

function lexicalTokens(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function lexicalNames(fact: PlanningFacts): Set<string> {
  return new Set(
    lexicalTokens(
      [
        fact.item.title,
        ...fact.item.labels.map((label) => label.name),
        fact.contextNames,
      ].join(" "),
    ),
  );
}

function searchItems(facts: PlanningFacts[], query: string): Item[] {
  const normalized = query.toLocaleLowerCase();
  if (!normalized) return [];
  return facts
    .filter((fact) =>
      [
        fact.item.title,
        fact.item.source,
        ...fact.item.labels.map((label) => label.name),
      ].some((value) => value?.toLocaleLowerCase().includes(normalized)),
    )
    .map((fact) => fact.item)
    .sort(
      (first, second) =>
        second.createdAt.localeCompare(first.createdAt) ||
        first.id.localeCompare(second.id),
    );
}

function suggestionFor(
  fact: PlanningFacts,
  selectedPlan: { id: LearningPlanId; name: string } | null,
): OrderedSuggestion | null {
  let signal: DailyPlanningSignal;
  let explanation: string;
  let orderDate: string | null;
  let origin: DailyFocusOrigin | null = null;

  if (fact.yesterdayAddedAt) {
    signal = "unfinished_yesterday";
    explanation = "Unfinished from yesterday";
    orderDate = new Date(fact.yesterdayAddedAt).toISOString();
  } else if (fact.selectedPlanPlacement && selectedPlan) {
    signal = "selected_plan";
    explanation = `In ${selectedPlan.name}`;
    orderDate = null;
    origin = {
      learningPlan: selectedPlan,
      stage:
        fact.selectedStageId && fact.selectedStageName
          ? {
              id: fact.selectedStageId as StageId,
              name: fact.selectedStageName,
            }
          : null,
    };
  } else if (fact.item.status === Status.InProgress) {
    signal = "dormant_in_progress";
    explanation = "In progress and waiting longest";
    orderDate = fact.activityAt.toISOString();
  } else if (fact.item.targetDate) {
    signal = "approaching_target";
    explanation = `Target date ${fact.item.targetDate}`;
    orderDate = fact.item.targetDate;
  } else if (fact.activePlanCount === 0) {
    signal = "recently_captured_uncommitted";
    explanation = "Recently captured and not in an active Learning Plan";
    orderDate = fact.item.createdAt;
  } else {
    return null;
  }

  return { item: fact.item, signal, explanation, origin, orderDate };
}

function compareSuggestions({
  first,
  second,
}: {
  first: OrderedSuggestion;
  second: OrderedSuggestion;
}): number {
  const firstPriority = SIGNAL_PRIORITY[first.signal];
  const secondPriority = SIGNAL_PRIORITY[second.signal];
  if (firstPriority !== secondPriority) return firstPriority - secondPriority;
  const dateOrder =
    first.orderDate === null || second.orderDate === null
      ? 0
      : first.signal === "recently_captured_uncommitted"
        ? second.orderDate.localeCompare(first.orderDate)
        : first.orderDate.localeCompare(second.orderDate);
  return dateOrder || first.item.id.localeCompare(second.item.id);
}
