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
  "report",
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

interface SchemaEntity {
  readonly types: readonly Type[];
  readonly title: string | null;
}

type TypeResolution =
  | { readonly status: "none" }
  | { readonly status: "resolved"; readonly type: Type }
  | { readonly status: "conflicting" };

type SuggestedType =
  | { readonly status: "none" }
  | {
      readonly status: "suggested";
      readonly type: Type;
      readonly evidence: "schema_org" | "open_graph";
    };

export function resolveGenericMetadata({
  documentTitle,
  jsonLdBlocks,
  openGraphTitles,
  openGraphTypes,
}: MetadataCandidates): SourceInspectionResponse | null {
  const schema = resolveSchemaOrg(jsonLdBlocks);
  const openGraphType = resolveOpenGraphType(openGraphTypes);
  const suggestedType = mergeTypeEvidence({
    schema: schema.type,
    openGraph: openGraphType,
  });

  const openGraphTitle = firstNormalized(openGraphTitles);
  const title =
    schema.title ??
    openGraphTitle ??
    normalizeSuggestion(documentTitle);
  const titleEvidence =
    schema.title !== null
      ? "schema_org"
      : openGraphTitle !== null
        ? "open_graph"
        : "document_title";

  return buildSuggestion({ title, titleEvidence, suggestedType });
}

function resolveOpenGraphType(values: readonly string[]): TypeResolution {
  const normalized = values[0]?.trim().toLowerCase();
  if (normalized === "article") {
    return { status: "resolved", type: Type.Article };
  }
  if (normalized === "book") return { status: "resolved", type: Type.Book };
  if (normalized !== undefined && openGraphVideoTypes.has(normalized)) {
    return { status: "resolved", type: Type.Video };
  }
  return { status: "none" };
}

function mergeTypeEvidence({
  schema,
  openGraph,
}: {
  readonly schema: TypeResolution;
  readonly openGraph: TypeResolution;
}): SuggestedType {
  if (schema.status === "conflicting" || openGraph.status === "conflicting") {
    return { status: "none" };
  }
  if (
    schema.status === "resolved" &&
    openGraph.status === "resolved" &&
    schema.type !== openGraph.type
  ) {
    return { status: "none" };
  }
  if (schema.status === "resolved") {
    return { status: "suggested", type: schema.type, evidence: "schema_org" };
  }
  if (openGraph.status === "resolved") {
    return {
      status: "suggested",
      type: openGraph.type,
      evidence: "open_graph",
    };
  }
  return { status: "none" };
}

function buildSuggestion({
  title,
  titleEvidence,
  suggestedType,
}: {
  readonly title: string | null;
  readonly titleEvidence: "schema_org" | "open_graph" | "document_title";
  readonly suggestedType: SuggestedType;
}): SourceInspectionResponse | null {
  if (title === null) {
    return suggestedType.status === "none"
      ? null
      : {
          status: "suggested",
          type: suggestedType.type,
          typeEvidence: suggestedType.evidence,
        };
  }
  if (suggestedType.status === "none") {
    return { status: "suggested", title, titleEvidence };
  }
  return {
    status: "suggested",
    title,
    titleEvidence,
    type: suggestedType.type,
    typeEvidence: suggestedType.evidence,
  };
}

function resolveSchemaOrg(sources: readonly string[]): {
  readonly title: string | null;
  readonly type: TypeResolution;
} {
  const entities: SchemaEntity[] = [];
  let visitedNodes = 0;

  for (const source of sources) {
    const parsed = parseJson(source);
    if (!parsed.ok) continue;
    const scan = scanJsonLd({
      value: parsed.value,
      remainingNodes: JSON_LD_NODE_LIMIT - visitedNodes,
    });
    visitedNodes += scan.visitedNodes;
    if (!scan.valid) {
      if (visitedNodes >= JSON_LD_NODE_LIMIT) break;
      continue;
    }
    entities.push(...scan.primaryEntities);
  }

  return {
    title: entities.length === 1 ? (entities[0]?.title ?? null) : null,
    type: resolveTypes(
      new Set(entities.flatMap((entity) => entity.types)),
    ),
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

type JsonLdContext = "root" | "graph" | "main_entity" | "other";

function scanJsonLd({
  value,
  remainingNodes,
}: {
  readonly value: unknown;
  readonly remainingNodes: number;
}): {
  readonly valid: boolean;
  readonly visitedNodes: number;
  readonly primaryEntities: readonly SchemaEntity[];
} {
  const pending: Array<{
    readonly value: unknown;
    readonly depth: number;
    readonly context: JsonLdContext;
  }> = [{ value, depth: 1, context: "root" }];
  const recognized = new Map<Record<string, unknown>, SchemaEntity>();
  const recognizedIds = new Map<string, Record<string, unknown>>();
  const primaryObjects = new Set<Record<string, unknown>>();
  const mainEntityReferences = new Set<string>();
  let visitedNodes = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (visitedNodes >= remainingNodes) {
      return { valid: false, visitedNodes, primaryEntities: [] };
    }
    visitedNodes += 1;
    if (current.depth > JSON_LD_DEPTH_LIMIT) {
      return { valid: false, visitedNodes, primaryEntities: [] };
    }

    if (typeof current.value === "string") {
      if (current.context === "main_entity") {
        mainEntityReferences.add(current.value);
      }
      continue;
    }
    if (isJsonArray(current.value)) {
      if (
        pending.length + current.value.length >
        remainingNodes - visitedNodes
      ) {
        return {
          valid: false,
          visitedNodes: remainingNodes,
          primaryEntities: [],
        };
      }
      for (const child of current.value) {
        pending.push({ ...current, value: child, depth: current.depth + 1 });
      }
      continue;
    }
    if (!isJsonObject(current.value)) continue;

    const entity = schemaEntity(current.value);
    if (entity !== null) {
      recognized.set(current.value, entity);
      const id = current.value["@id"];
      if (typeof id === "string") recognizedIds.set(id, current.value);
      if (
        current.context === "root" ||
        current.context === "main_entity" ||
        (current.context === "graph" &&
          current.value.mainEntityOfPage !== undefined)
      ) {
        primaryObjects.add(current.value);
      }
    }
    if (current.context === "main_entity") {
      const id = current.value["@id"];
      if (typeof id === "string") mainEntityReferences.add(id);
    }

    const properties = Object.entries(current.value);
    if (
      pending.length + properties.length >
      remainingNodes - visitedNodes
    ) {
      return {
        valid: false,
        visitedNodes: remainingNodes,
        primaryEntities: [],
      };
    }
    for (const [property, child] of properties) {
      const context: JsonLdContext =
        property === "@graph"
          ? "graph"
          : property === "mainEntity" &&
              (current.context === "root" || current.context === "graph")
            ? "main_entity"
            : "other";
      pending.push({ value: child, depth: current.depth + 1, context });
    }
  }

  for (const reference of mainEntityReferences) {
    const referenced = recognizedIds.get(reference);
    if (referenced !== undefined) primaryObjects.add(referenced);
  }
  return {
    valid: true,
    visitedNodes,
    primaryEntities: [...primaryObjects]
      .map((object) => recognized.get(object))
      .filter((entity): entity is SchemaEntity => entity !== undefined),
  };
}

function schemaEntity(value: Record<string, unknown>): SchemaEntity | null {
  const types = schemaTypes(value["@type"]);
  if (types.length === 0) return null;
  return {
    types,
    title:
      normalizeSuggestion(
        typeof value.headline === "string" ? value.headline : "",
      ) ??
      normalizeSuggestion(typeof value.name === "string" ? value.name : ""),
  };
}

function schemaTypes(value: unknown): readonly Type[] {
  const names = isJsonArray(value) ? value : [value];
  const types = new Set<Type>();
  for (const name of names) {
    if (typeof name !== "string") continue;
    const normalized = schemaTypeName(name);
    if (normalized === undefined) continue;
    if (schemaArticleTypes.has(normalized)) types.add(Type.Article);
    if (normalized === "videoobject") types.add(Type.Video);
    if (normalized === "course") types.add(Type.Course);
    if (normalized === "book") types.add(Type.Book);
  }
  return [...types];
}

function schemaTypeName(value: string): string | undefined {
  const normalized = value.trim();
  if (/^[a-z][a-z0-9]*$/iu.test(normalized)) {
    return normalized.toLowerCase();
  }
  return /^https?:\/\/(?:www\.)?schema\.org\/([a-z][a-z0-9]*)\/?$/iu
    .exec(normalized)?.[1]
    ?.toLowerCase();
}

function resolveTypes(types: ReadonlySet<Type>): TypeResolution {
  if (types.size === 0) return { status: "none" };
  if (types.size > 1) return { status: "conflicting" };
  const type = [...types][0];
  return type === undefined
    ? { status: "none" }
    : { status: "resolved", type };
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
