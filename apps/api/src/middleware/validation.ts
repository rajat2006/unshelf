import type { Request, RequestHandler } from "express";

interface ValidationIssue {
  code: string;
  path: PropertyKey[];
  format?: string;
}

interface Schema<Output = unknown> {
  safeParse(
    input: unknown,
  ):
    | { success: true; data: Output }
    | { success: false; error: { issues: ValidationIssue[] } };
}

type SchemaOutput<T> = T extends Schema<infer Output> ? Output : never;
type ParameterSchemas = Record<string, Schema>;

export const VALIDATION_FAILURE_CODES = [
  "malformed_json",
  "invalid_item_create",
  "invalid_item_status",
  "invalid_target_date",
  "invalid_parts_create",
  "invalid_part_title",
  "invalid_part_completion",
  "invalid_part_order",
  "missing_part_id",
  "invalid_label_name",
  "missing_item_id",
  "invalid_learning_plan_name",
  "invalid_stage_name",
  "invalid_stage_item_search",
  "invalid_stage_item_order",
  "invalid_item_placement",
  "missing_stage_item_disposition",
  "invalid_edge_endpoints",
  "self_edge",
  "invalid_daily_focus_item",
  "invalid_daily_focus_date",
  "invalid_daily_planning_query",
  "invalid_discover_preview",
  "invalid_discover_follow",
  "invalid_discover_workspace",
  "invalid_discover_candidate_keep",
  "invalid_discover_candidate_reject",
] as const;

export type ValidationFailureCode = (typeof VALIDATION_FAILURE_CODES)[number];

interface RequestSchemas {
  body?: Schema;
  params?: ParameterSchemas;
  query?: Schema;
}

type ValidatedInput<Schemas extends RequestSchemas> = {
  [Surface in keyof Schemas]: Surface extends "params"
    ? Schemas[Surface] extends ParameterSchemas
      ? {
          [Key in keyof Schemas[Surface]]: SchemaOutput<Schemas[Surface][Key]>;
        }
      : never
    : Schemas[Surface] extends Schema
      ? SchemaOutput<Schemas[Surface]>
      : never;
};

interface ValidatedLocals<Schemas extends RequestSchemas> {
  validated: ValidatedInput<Schemas>;
}

interface PublicIssue {
  path: string;
  message: string;
}

/**
 * Validate every declared HTTP input before continuing to a route handler.
 *
 * Schemas own both runtime parsing and `res.locals.validated`, the request-scoped
 * input container consumed by the next handler. Path parameters are declared
 * individually so the API can consume the shared branded UUID schemas without
 * importing Zod or rebuilding identifier contracts locally. The validation code
 * classifies the whole route operation from the fixed logging catalog; it is not
 * inferred from an individual Zod issue when one boundary validates several
 * fields or surfaces.
 */
export function validateRequest<const Schemas extends RequestSchemas>(
  schemas: Schemas,
  validationCode: ValidationFailureCode,
): RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  unknown,
  ValidatedLocals<Schemas>
> {
  return (req, res, next) => {
    const parsed: Record<string, unknown> = {};
    const issues: PublicIssue[] = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) parsed.body = result.data;
      else issues.push(...normalizeIssues("body", result.error.issues));
    }

    if (schemas.params) {
      const params: Record<string, unknown> = {};
      for (const [name, schema] of Object.entries(schemas.params)) {
        const result = schema.safeParse(req.params[name]);
        if (result.success) params[name] = result.data;
        else {
          issues.push(...normalizeIssues(`path.${name}`, result.error.issues));
        }
      }
      parsed.params = params;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) parsed.query = result.data;
      else issues.push(...normalizeIssues("query", result.error.issues));
    }

    if (issues.length > 0) {
      recordValidationFailure(req, validationCode);
      res.status(400).json({ error: "invalid_request", issues });
      return;
    }

    res.locals.validated = parsed as ValidatedInput<Schemas>;
    next();
  };
}

export function recordValidationFailure(
  req: Pick<Request, "logger" | "user">,
  validationCode: ValidationFailureCode,
): void {
  req.logger?.warn({
    event: "unshelf.api.validation.failed",
    msg: "Request validation failed",
    ...(req.user === undefined ? {} : { userId: req.user.id }),
    validationCode,
  });
}

function normalizeIssues(
  surface: string,
  validationIssues: ValidationIssue[],
): PublicIssue[] {
  return validationIssues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return [
        {
          path: [surface, ...issue.path, "$unknown"].join("."),
          message: "Contains unrecognized fields",
        },
      ];
    }

    return [
      {
        path: [surface, ...issue.path].join("."),
        message: publicMessage(issue),
      },
    ];
  });
}

function publicMessage(issue: ValidationIssue): string {
  if (issue.code === "invalid_format" && issue.format === "uuid") {
    return "Must be a valid UUID";
  }
  if (issue.code === "invalid_format" && issue.format === "date") {
    return "Must be a valid YYYY-MM-DD date";
  }
  if (issue.code === "too_small") return "Must not be blank";
  if (issue.code === "invalid_type") return "Has an invalid type";
  return "Invalid value";
}
