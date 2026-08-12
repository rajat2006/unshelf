import type {
  AddStageItemRequest,
  AddDailyFocusItemRequest,
  ConnectLearningPlanNodesRequest,
  CreateItemRequest,
  CreatePartsRequest,
  CreateStageRequest,
  CreateStageWithItemRequest,
  CreateLearningPlanRequest,
  DailyFocus,
  DailyPlanning,
  DailyPlanningQuery,
  Item,
  ItemDetail,
  ItemId,
  ItemPlacementCatalog,
  Label,
  LabelId,
  Status,
  Stage,
  StageDetail,
  StageId,
  StageItemCandidate,
  LearningPlan,
  LearningPlanId,
  LearningPlanItemCandidate,
  LearningPlanView,
  PlaceLearningPlanItemRequest,
  MoveLearningPlanItemRequest,
  PartId,
  RemoveStageRequest,
  ReorderStageItemsRequest,
  ReorderPartsRequest,
  UpdateItemStatusRequest,
  UpdateItemTargetDateRequest,
  UpdatePartCompletionRequest,
  UpdatePartRequest,
  UpdateLearningPlanRequest,
  UpdateStageRequest,
} from "@unshelf/shared";
import type { CurrentUser } from "./application-auth/types";

/**
 * The thin api client the web uses for its authenticated calls. Every request
 * carries the current User's bearer token so the api resolves it to *this* User's
 * space (the tenancy round-trip T2 established); the caller passes the
 * `useCurrentUser()` handle rather than importing Clerk here.
 */

async function requestJson<ResponseBody>(
  user: CurrentUser,
  path: string,
  init?: RequestInit,
): Promise<ResponseBody> {
  const token = await user.getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new Error(`api responded ${response.status}`);
  return (await response.json()) as ResponseBody;
}

async function requestWithoutBody(
  user: CurrentUser,
  path: string,
  init: RequestInit,
): Promise<void> {
  const token = await user.getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new Error(`api responded ${response.status}`);
}

/** Fetch All — every Item belonging to the current User. */
export async function fetchAll(user: CurrentUser): Promise<Item[]> {
  return requestJson<Item[]>(user, "/api/items");
}

/** Fetch one Item at its authenticated, canonical read endpoint. */
export async function fetchItem(
  user: CurrentUser,
  itemId: ItemId,
): Promise<ItemDetail> {
  return requestJson<ItemDetail>(user, `/api/items/${itemId}`);
}

export async function createParts(
  user: CurrentUser,
  itemId: ItemId,
  titles: string[],
): Promise<ItemDetail> {
  const body: CreatePartsRequest = { titles };
  return requestJson<ItemDetail>(user, `/api/items/${itemId}/parts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updatePart(
  user: CurrentUser,
  itemId: ItemId,
  partId: PartId,
  title: string,
): Promise<ItemDetail> {
  const body: UpdatePartRequest = { title };
  return requestJson<ItemDetail>(user, `/api/items/${itemId}/parts/${partId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updatePartCompletion(
  user: CurrentUser,
  itemId: ItemId,
  partId: PartId,
  completed: boolean,
): Promise<ItemDetail> {
  const body: UpdatePartCompletionRequest = { completed };
  return requestJson<ItemDetail>(
    user,
    `/api/items/${itemId}/parts/${partId}/completion`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function reorderParts(
  user: CurrentUser,
  itemId: ItemId,
  partIds: PartId[],
): Promise<ItemDetail> {
  const body: ReorderPartsRequest = { partIds };
  return requestJson<ItemDetail>(user, `/api/items/${itemId}/parts/order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function removePart(
  user: CurrentUser,
  itemId: ItemId,
  partId: PartId,
): Promise<ItemDetail> {
  return requestJson<ItemDetail>(user, `/api/items/${itemId}/parts/${partId}`, {
    method: "DELETE",
  });
}

/** Every LearningPlan represented once for placement from one Item's sidebar. */
export async function fetchItemPlacements(
  user: CurrentUser,
  itemId: ItemId,
): Promise<ItemPlacementCatalog> {
  return requestJson<ItemPlacementCatalog>(
    user,
    `/api/items/${itemId}/placements`,
  );
}

/** Atomically create a loose Stage on a LearningPlan with this Item as its first member. */
export async function createStageWithItem(
  user: CurrentUser,
  itemId: ItemId,
  input: CreateStageWithItemRequest,
): Promise<StageDetail> {
  return requestJson<StageDetail>(user, `/api/items/${itemId}/placements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Capture an Item — the one uniform insert (ADR-0007). Returns the new Item. */
export async function captureItem(
  user: CurrentUser,
  input: CreateItemRequest,
): Promise<Item> {
  return requestJson<Item>(user, "/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Change the Item-level Status shared by every place the Item appears. */
export async function updateItemStatus(
  user: CurrentUser,
  itemId: ItemId,
  status: Status,
): Promise<Item> {
  const body: UpdateItemStatusRequest = { status };
  return requestJson<Item>(user, `/api/items/${itemId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Set, change, or clear the Item's one soft Target date — `null` clears it.
 * Returns the Item, whose `pastTarget` the api has recomputed for this read.
 */
export async function updateItemTargetDate(
  user: CurrentUser,
  itemId: ItemId,
  targetDate: string | null,
): Promise<Item> {
  const body: UpdateItemTargetDateRequest = { targetDate };
  return requestJson<Item>(user, `/api/items/${itemId}/target-date`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Read the authenticated User's editable focus for the database's current date. */
export async function fetchToday(user: CurrentUser): Promise<DailyFocus> {
  return requestJson<DailyFocus>(user, "/api/daily-focus/today");
}

/** Read deterministic, explained candidates without changing today's focus. */
export async function fetchDailyPlanning(
  user: CurrentUser,
  query: DailyPlanningQuery,
): Promise<DailyPlanning> {
  const search = new URLSearchParams();
  if (query.query) search.set("query", query.query);
  if (query.intention) search.set("intention", query.intention);
  if (query.learningPlanId) {
    search.set("learningPlanId", query.learningPlanId);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return requestJson<DailyPlanning>(
    user,
    `/api/daily-focus/today/planning${suffix}`,
  );
}

/** Suppress one suggestion for only the database's current calendar date. */
export async function suppressDailyPlanningItem(
  user: CurrentUser,
  itemId: ItemId,
): Promise<void> {
  return requestWithoutBody(user, "/api/daily-focus/today/suppressions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
}

/** Read one immutable Daily Focus by its elapsed server calendar date. */
export async function fetchDailyFocusHistory(
  user: CurrentUser,
  date: string,
): Promise<DailyFocus> {
  return requestJson<DailyFocus>(user, `/api/daily-focus/${date}`);
}

/** Explicitly select one whole shared Library Item for Today. */
export async function addItemToToday(
  user: CurrentUser,
  itemId: ItemId,
  origin?: AddDailyFocusItemRequest["origin"],
): Promise<DailyFocus> {
  const body: AddDailyFocusItemRequest = { itemId, origin };
  return requestJson<DailyFocus>(user, "/api/daily-focus/today/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Remove only dated focus membership, leaving the shared Item untouched. */
export async function removeItemFromToday(
  user: CurrentUser,
  dailyFocusId: DailyFocus["id"],
  itemId: ItemId,
): Promise<DailyFocus> {
  return requestJson<DailyFocus>(
    user,
    `/api/daily-focus/${dailyFocusId}/items/${itemId}`,
    { method: "DELETE" },
  );
}

/** Every private Label owned by the current User. */
export async function fetchLabels(user: CurrentUser): Promise<Label[]> {
  return requestJson<Label[]>(user, "/api/labels");
}

/** Apply one Label to an Item, returning its current Label set. */
export async function applyLabelToItem(
  user: CurrentUser,
  itemId: ItemId,
  labelId: LabelId,
): Promise<Item> {
  return requestJson<Item>(user, `/api/items/${itemId}/labels/${labelId}`, {
    method: "POST",
  });
}

/** Remove only the Item-to-Label membership. */
export async function removeLabelFromItem(
  user: CurrentUser,
  itemId: ItemId,
  labelId: LabelId,
): Promise<Item> {
  return requestJson<Item>(user, `/api/items/${itemId}/labels/${labelId}`, {
    method: "DELETE",
  });
}

/**
 * Every LearningPlan the current User owns, each with derived progress (ADR-0014). The
 * Learning Plans index lists these; the layout is the api's, the order oldest-first.
 */
export async function fetchLearningPlans(
  user: CurrentUser,
): Promise<LearningPlan[]> {
  return requestJson<LearningPlan[]>(user, "/api/learning-plans");
}

/** Create a LearningPlan. It starts with no Stages, so it reads back at 0/0 progress. */
export async function createLearningPlan(
  user: CurrentUser,
  input: CreateLearningPlanRequest,
): Promise<LearningPlan> {
  return requestJson<LearningPlan>(user, "/api/learning-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Read one Learning Plan's durable identity and name. */
export async function fetchLearningPlanRecord(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
): Promise<LearningPlan> {
  return requestJson<LearningPlan>(
    user,
    `/api/learning-plans/${learningPlanId}`,
  );
}

/** Rename a Learning Plan without changing its identity or topology. */
export async function updateLearningPlan(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
  input: UpdateLearningPlanRequest,
): Promise<LearningPlan> {
  return requestJson<LearningPlan>(
    user,
    `/api/learning-plans/${learningPlanId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

/** Retire a Learning Plan from structural editing while preserving its view. */
export async function archiveLearningPlan(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
): Promise<LearningPlan> {
  return requestJson<LearningPlan>(
    user,
    `/api/learning-plans/${learningPlanId}/archive`,
    { method: "POST" },
  );
}

/** Return an archived Learning Plan to active structural editing. */
export async function restoreLearningPlan(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
): Promise<LearningPlan> {
  return requestJson<LearningPlan>(
    user,
    `/api/learning-plans/${learningPlanId}/restore`,
    { method: "POST" },
  );
}

/** Every Stage belonging to the current User. */
export async function fetchStages(user: CurrentUser): Promise<Stage[]> {
  return requestJson<Stage[]>(user, "/api/stages");
}

/**
 * Create a Stage on one LearningPlan — a Stage belongs to exactly one LearningPlan (ADR-0014,
 * #94), so creation names the LearningPlan it lands on. It starts empty; Items are
 * pulled into it from the Library.
 */
export async function createStage(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
  input: CreateStageRequest,
): Promise<Stage> {
  return requestJson<Stage>(
    user,
    `/api/learning-plans/${learningPlanId}/stages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

/** One Stage with its Items, each carrying the Status every view of it shares. */
export async function fetchStage(
  user: CurrentUser,
  stageId: StageId,
): Promise<StageDetail> {
  return requestJson<StageDetail>(user, `/api/stages/${stageId}`);
}

/** Rename a Stage without changing its node identity or ordered Items. */
export async function updateStage(
  user: CurrentUser,
  stageId: StageId,
  input: UpdateStageRequest,
): Promise<StageDetail> {
  return requestJson<StageDetail>(user, `/api/stages/${stageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Read a Stage only in the LearningPlan context named by its detail URL. */
export async function fetchLearningPlanStage(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
  stageId: StageId,
): Promise<StageDetail> {
  return requestJson<StageDetail>(
    user,
    `/api/learning-plans/${learningPlanId}/stages/${stageId}`,
  );
}

/**
 * Place an Item into a Stage — a reference, never a copy, so the Item stays in
 * the Library. It may appear on several LearningPlans, but only once on each LearningPlan.
 */
export async function addItemToStage(
  user: CurrentUser,
  stageId: StageId,
  itemId: ItemId,
): Promise<StageDetail> {
  const body: AddStageItemRequest = { itemId };
  return requestJson<StageDetail>(user, `/api/stages/${stageId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Search the compact Library intake beneath one open Stage. */
export async function fetchStageItemCandidates(
  user: CurrentUser,
  stageId: StageId,
  query: string,
): Promise<StageItemCandidate[]> {
  const search = new URLSearchParams();
  if (query) search.set("query", query);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return requestJson<StageItemCandidate[]>(
    user,
    `/api/stages/${stageId}/items${suffix}`,
  );
}

/**
 * Take an Item out of a Stage. Only the membership goes — the Item itself, its
 * Status, and its other Stages are untouched. Returns the Stage's new contents.
 */
export async function removeItemFromStage(
  user: CurrentUser,
  stageId: StageId,
  itemId: ItemId,
): Promise<StageDetail> {
  return requestJson<StageDetail>(
    user,
    `/api/stages/${stageId}/items/${itemId}`,
    {
      method: "DELETE",
    },
  );
}

/** Replace a Stage's complete Item order while preserving every placement. */
export async function reorderStageItems(
  user: CurrentUser,
  stageId: StageId,
  itemIds: ItemId[],
): Promise<StageDetail> {
  const body: ReorderStageItemsRequest = { itemIds };
  return requestJson<StageDetail>(user, `/api/stages/${stageId}/items/order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Move one existing placement between direct and staged structure. */
export async function moveLearningPlanItem(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
  itemId: ItemId,
  stageId: StageId | null,
): Promise<LearningPlanView> {
  const body: MoveLearningPlanItemRequest = { stageId };
  return requestJson<LearningPlanView>(
    user,
    `/api/learning-plans/${learningPlanId}/items/${itemId}/placement`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

/** Remove a Stage with an explicit disposition for every placement it holds. */
export async function removeStage(
  user: CurrentUser,
  stageId: StageId,
  itemDisposition: RemoveStageRequest["itemDisposition"],
): Promise<LearningPlanView> {
  const body: RemoveStageRequest = { itemDisposition };
  return requestJson<LearningPlanView>(user, `/api/stages/${stageId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * One LearningPlan's topology — its Stages as nodes with derived progress, and every
 * Stage-to-Stage edge between them (ADR-0010, scoped per LearningPlan by #94). The client
 * derives the layout from the edges, since the LearningPlan stores no position.
 */
export async function fetchLearningPlan(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
): Promise<LearningPlanView> {
  return requestJson<LearningPlanView>(
    user,
    `/api/learning-plans/${learningPlanId}/topology`,
  );
}

/** Search one Learning Plan's Library placement drawer. */
export async function fetchLearningPlanItemCandidates(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
  query: string,
): Promise<LearningPlanItemCandidate[]> {
  const search = new URLSearchParams();
  if (query) search.set("query", query);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return requestJson<LearningPlanItemCandidate[]>(
    user,
    `/api/learning-plans/${learningPlanId}/items${suffix}`,
  );
}

/** Place one existing Library Item directly as a first-class Plan Node. */
export async function placeItemDirectly(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
  itemId: ItemId,
): Promise<LearningPlanView> {
  const body: PlaceLearningPlanItemRequest = { itemId };
  return requestJson<LearningPlanView>(
    user,
    `/api/learning-plans/${learningPlanId}/items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

/** Remove only a direct placement; the shared Library Item remains. */
export async function removeDirectItemFromLearningPlan(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
  itemId: ItemId,
): Promise<LearningPlanView> {
  return requestJson<LearningPlanView>(
    user,
    `/api/learning-plans/${learningPlanId}/items/${itemId}`,
    { method: "DELETE" },
  );
}

/**
 * Draw one edge on a LearningPlan — place `fromNodeId` ahead of `toNodeId`. The api
 * refuses a link that would close a cycle (409) or touch a foreign, cross-LearningPlan,
 * or unknown Stage (404); on success it returns the LearningPlan's new topology. Adding an
 * edge that already exists changes nothing.
 */
export async function connectLearningPlanNodes(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
  endpoints: ConnectLearningPlanNodesRequest,
): Promise<LearningPlanView> {
  return requestJson<LearningPlanView>(
    user,
    `/api/learning-plans/${learningPlanId}/edges`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoints),
    },
  );
}

/**
 * Erase one edge on a LearningPlan, returning its new topology. Only the link goes —
 * both Stages keep their place and every other edge — which is what makes rewiring
 * free: moving a Stage is an erase and a redraw.
 */
export async function disconnectLearningPlanNodes(
  user: CurrentUser,
  learningPlanId: LearningPlanId,
  { fromNodeId, toNodeId }: ConnectLearningPlanNodesRequest,
): Promise<LearningPlanView> {
  return requestJson<LearningPlanView>(
    user,
    `/api/learning-plans/${learningPlanId}/edges/${fromNodeId}/${toNodeId}`,
    { method: "DELETE" },
  );
}
