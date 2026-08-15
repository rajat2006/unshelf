import { and, asc, eq, sql } from "drizzle-orm";
import {
  Status,
  type DailyPlanning,
  type DailyPlanningQuery,
  type DailyPlanningSignal,
  type DailyPlanningSuggestion,
  type Item,
  type ItemId,
  type UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { ITEM_PROJECTION, toItem } from "../items/repository";
import {
  dailyFocuses,
  dailyFocusItems,
  dailyPlanningSuppressions,
  items,
} from "../schema";

interface PlanningFacts {
  item: Item;
  planningDate: string;
  yesterdayAddedAt: Date | string | null;
  targetDistance: number | null;
  recentCapture: boolean;
  suppressedToday: boolean;
}

interface SuggestionCandidate {
  suggestion: DailyPlanningSuggestion;
  orderDate: string;
  targetDistance: number | null;
}

const SIGNALS: DailyPlanningSignal[] = [
  "unfinished_yesterday",
  "target_date",
  "recent_capture",
];
const SUGGESTION_LIMIT = 3;

/** Build today's capped suggestion projection from current durable facts. */
export async function getDailyPlanning({
  db,
  userId,
  query,
}: {
  db: Database;
  userId: UserId;
  query: DailyPlanningQuery;
}): Promise<DailyPlanning> {
  const rows = await db
    .select({
      ...ITEM_PROJECTION,
      planningDate: sql<string>`current_date::text`,
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
      targetDistance: sql<number | null>`case
        when ${items.targetDate} between current_date - 7 and current_date + 7
          then abs(${items.targetDate} - current_date)::integer
        else null
      end`,
      recentCapture: sql<boolean>`${items.createdAt} >= current_date - 6
        and ${items.createdAt} < current_date + 1`,
      suppressedToday: sql<boolean>`exists (
        select 1
        from daily_planning_suppressions
        where daily_planning_suppressions.item_id = items.id
          and daily_planning_suppressions.user_id = items.user_id
          and daily_planning_suppressions.date = current_date
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
    planningDate: row.planningDate,
    yesterdayAddedAt: row.yesterdayAddedAt,
    targetDistance: row.targetDistance,
    recentCapture: row.recentCapture,
    suppressedToday: row.suppressedToday,
  }));
  const eligible = facts.filter(
    (fact) => fact.item.status !== Status.Done && !fact.suppressedToday,
  );

  return {
    searchResults: searchItems(facts, query.query ?? ""),
    suggestions: selectSuggestions(eligible),
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

function selectSuggestions(facts: PlanningFacts[]): DailyPlanningSuggestion[] {
  const groups = new Map(
    SIGNALS.map((signal) => [signal, [] as SuggestionCandidate[]]),
  );
  for (const fact of facts) {
    const candidate = suggestionFor(fact);
    if (candidate) groups.get(candidate.suggestion.signal)?.push(candidate);
  }
  for (const signal of SIGNALS) {
    groups.get(signal)?.sort(compareWithinSignal);
  }

  const selected: SuggestionCandidate[] = [];
  for (const signal of SIGNALS) {
    const first = groups.get(signal)?.[0];
    if (first) selected.push(first);
  }
  for (const signal of SIGNALS) {
    for (const candidate of groups.get(signal)?.slice(1) ?? []) {
      if (selected.length >= SUGGESTION_LIMIT) break;
      selected.push(candidate);
    }
  }

  return selected
    .sort((first, second) => {
      const signalOrder =
        SIGNALS.indexOf(first.suggestion.signal) -
        SIGNALS.indexOf(second.suggestion.signal);
      return signalOrder || compareWithinSignal(first, second);
    })
    .slice(0, SUGGESTION_LIMIT)
    .map(({ suggestion }) => suggestion);
}

function suggestionFor(fact: PlanningFacts): SuggestionCandidate | null {
  if (fact.yesterdayAddedAt) {
    return {
      suggestion: {
        item: fact.item,
        signal: "unfinished_yesterday",
        explanation: "Unfinished from yesterday",
      },
      orderDate: new Date(fact.yesterdayAddedAt).toISOString(),
      targetDistance: null,
    };
  }
  if (fact.targetDistance !== null && fact.item.targetDate) {
    return {
      suggestion: {
        item: fact.item,
        signal: "target_date",
        explanation: targetExplanation(fact),
      },
      orderDate: fact.item.targetDate,
      targetDistance: fact.targetDistance,
    };
  }
  if (fact.recentCapture) {
    return {
      suggestion: {
        item: fact.item,
        signal: "recent_capture",
        explanation: "Captured recently",
      },
      orderDate: fact.item.createdAt,
      targetDistance: null,
    };
  }
  return null;
}

function targetExplanation(fact: PlanningFacts): string {
  const targetDate = fact.item.targetDate!;
  const distance = fact.targetDistance!;
  if (targetDate === fact.planningDate) return "Target date is Today";
  const days = `${distance} ${distance === 1 ? "day" : "days"}`;
  return targetDate < fact.planningDate
    ? `Target date was ${days} ago · ${targetDate}`
    : `Target date is in ${days} · ${targetDate}`;
}

function compareWithinSignal(
  first: SuggestionCandidate,
  second: SuggestionCandidate,
): number {
  const signal = first.suggestion.signal;
  let order: number;
  if (signal === "target_date") {
    const distanceOrder = first.targetDistance! - second.targetDistance!;
    order = distanceOrder || first.orderDate.localeCompare(second.orderDate);
  } else if (signal === "recent_capture") {
    order = second.orderDate.localeCompare(first.orderDate);
  } else {
    order = first.orderDate.localeCompare(second.orderDate);
  }
  return (
    order || first.suggestion.item.id.localeCompare(second.suggestion.item.id)
  );
}
