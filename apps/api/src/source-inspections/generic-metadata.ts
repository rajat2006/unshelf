import { Type, type SourceInspectionResponse } from "@unshelf/shared";

const TITLE_CODE_POINT_LIMIT = 512;
const JSON_LD_DEPTH_LIMIT = 16;
const JSON_LD_NODE_LIMIT = 2_000;

const schemaArticleTypes = new Set([
  "advertisercontentarticle",
  "analysisnewsarticle",
  "apireference",
  "article",
  "askpublicnewsarticle",
  "backgroundnewsarticle",
  "blogposting",
  "discussionforumposting",
  "liveblogposting",
  "medicalscholarlyarticle",
  "newsarticle",
  "opinionnewsarticle",
  "reportagenewsarticle",
  "reviewnewsarticle",
  "satiricalarticle",
  "scholarlyarticle",
  "socialmediaposting",
  "techarticle",
]);

const openGraphVideoTypes = new Set([
  "video.episode",
  "video.movie",
  "video.other",
  "video.tv_show",
]);

interface MetadataCandidates {
  readonly documentTitle: string;
  readonly jsonLdBlocks: readonly string[];
  readonly openGraphTitles: readonly string[];
  readonly openGraphTypes: readonly string[];
}

interface ResolvedTypeEvidence {
  readonly type: Type | null;
  readonly conflictingTypes: boolean;
}

export function resolveGenericMetadata({
  documentTitle,
  jsonLdBlocks,
  openGraphTitles,
  openGraphTypes,
}: MetadataCandidates): SourceInspectionResponse | null {
  const schema = resolveSchemaOrg(jsonLdBlocks);
  const openGraph = resolveOpenGraphType(openGraphTypes);
  const type =
    schema.conflictingTypes ||
    openGraph.conflictingTypes ||
    (schema.type !== null &&
      openGraph.type !== null &&
      schema.type !== openGraph.type)
      ? null
      : (schema.type ?? openGraph.type);

  const openGraphTitle = firstNormalized(openGraphTitles);
  const normalizedDocumentTitle = normalizeSuggestion(documentTitle);
  const title = schema.title ?? openGraphTitle ?? normalizedDocumentTitle;
  const titleEvidence =
    schema.title !== null
      ? "schema_org"
      : openGraphTitle !== null
        ? "open_graph"
        : "document_title";
  const typeEvidence = schema.type === null ? "open_graph" : "schema_org";

  return buildSuggestion({ title, titleEvidence, type, typeEvidence });
}

function resolveOpenGraphType(values: readonly string[]): ResolvedTypeEvidence {
  const types = new Set<Type>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "article") types.add(Type.Article);
    if (normalized === "book") types.add(Type.Book);
    if (openGraphVideoTypes.has(normalized)) types.add(Type.Video);
  }
  return resolvedTypeEvidence(types);
}

function buildSuggestion({
  title,
  titleEvidence,
  type,
  typeEvidence,
}: {
  readonly title: string | null;
  readonly titleEvidence: "schema_org" | "open_graph" | "document_title";
  readonly type: Type | null;
  readonly typeEvidence: "schema_org" | "open_graph";
}): SourceInspectionResponse | null {
  if (title === null) {
    return type === null ? null : { status: "suggested", type, typeEvidence };
  }
  if (type === null) return { status: "suggested", title, titleEvidence };
  return { status: "suggested", title, titleEvidence, type, typeEvidence };
}

function resolveSchemaOrg(sources: readonly string[]): {
  readonly title: string | null;
  readonly type: Type | null;
  readonly conflictingTypes: boolean;
} {
  const entities: Array<{
    readonly types: readonly Type[];
    readonly title: string | null;
  }> = [];
  let visitedNodes = 0;

  for (const source of sources) {
    const parsed = parseJson(source);
    if (!parsed.ok) continue;
    const { value } = parsed;
    const validation = validateJsonLd({
      value,
      remainingNodes: JSON_LD_NODE_LIMIT - visitedNodes,
    });
    visitedNodes += validation.visitedNodes;
    if (!validation.valid) {
      if (visitedNodes >= JSON_LD_NODE_LIMIT) break;
      continue;
    }
    entities.push(...findPrimaryEntities(value));
  }

  const types = new Set(entities.flatMap((entity) => entity.types));
  return {
    title: entities.length === 1 ? (entities[0]?.title ?? null) : null,
    ...resolvedTypeEvidence(types),
  };
}

function parseJson(
  source: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    const value: unknown = JSON.parse(source);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function validateJsonLd({
  value,
  remainingNodes,
}: {
  readonly value: unknown;
  readonly remainingNodes: number;
}): { readonly valid: boolean; readonly visitedNodes: number } {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value, depth: 1 },
  ];
  let visitedNodes = 0;
  let valid = true;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (visitedNodes >= remainingNodes) {
      return { valid: false, visitedNodes };
    }
    visitedNodes += 1;
    if (current.depth > JSON_LD_DEPTH_LIMIT) valid = false;
    for (const child of jsonChildren(current.value)) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return { valid, visitedNodes };
}

function findPrimaryEntities(value: unknown): Array<{
  readonly types: readonly Type[];
  readonly title: string | null;
}> {
  const entities: Array<{
    readonly types: readonly Type[];
    readonly title: string | null;
  }> = [];
  const pending: unknown[] = [value];

  while (pending.length > 0) {
    const current = pending.shift();
    if (isJsonArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!isJsonObject(current)) continue;
    const types = schemaTypes(current["@type"]);
    if (types.length > 0) {
      entities.push({
        types,
        title:
          normalizeSuggestion(
            typeof current.headline === "string" ? current.headline : "",
          ) ??
          normalizeSuggestion(
            typeof current.name === "string" ? current.name : "",
          ),
      });
      continue;
    }
    const graph = current["@graph"];
    if (isJsonObject(graph) || isJsonArray(graph)) pending.push(graph);
    const mainEntity = current.mainEntity;
    if (isJsonObject(mainEntity) || isJsonArray(mainEntity)) {
      pending.push(mainEntity);
    }
  }
  return entities;
}

function jsonChildren(value: unknown): readonly unknown[] {
  if (isJsonArray(value)) return value;
  return isJsonObject(value) ? Object.values(value) : [];
}

function schemaTypes(value: unknown): readonly Type[] {
  const names = isJsonArray(value) ? value : [value];
  const types = new Set<Type>();
  for (const name of names) {
    if (typeof name !== "string") continue;
    const normalized = name.split(/[/#:]/u).at(-1)?.toLowerCase();
    if (normalized === undefined) continue;
    if (schemaArticleTypes.has(normalized)) types.add(Type.Article);
    if (normalized === "videoobject") types.add(Type.Video);
    if (normalized === "course") types.add(Type.Course);
    if (normalized === "book") types.add(Type.Book);
  }
  return [...types];
}

function resolvedTypeEvidence(types: ReadonlySet<Type>): ResolvedTypeEvidence {
  return {
    type: types.size === 1 ? ([...types][0] ?? null) : null,
    conflictingTypes: types.size > 1,
  };
}

function firstNormalized(values: readonly string[]): string | null {
  for (const value of values) {
    const normalized = normalizeSuggestion(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function normalizeSuggestion(value: string): string | null {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) return null;
  return [...normalized].slice(0, TITLE_CODE_POINT_LIMIT).join("");
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !isJsonArray(value);
}

function isJsonArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
