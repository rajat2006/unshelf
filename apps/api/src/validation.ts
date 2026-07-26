import type { NextFunction, Request, RequestHandler, Response } from "express";

interface ValidationIssue {
  code: string;
  path: PropertyKey[];
  expected?: string;
  format?: string;
  keys?: string[];
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

type ValidatedHandler<Schemas extends RequestSchemas> = (
  input: ValidatedInput<Schemas>,
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;

interface PublicIssue {
  path: string;
  message: string;
}

/**
 * Validate every declared HTTP input before invoking a route handler.
 *
 * Schemas own both runtime parsing and the handler's input type. Path parameters
 * are declared individually so the API can consume the shared branded UUID
 * schemas without importing Zod or rebuilding identifier contracts locally.
 */
export function validateRequest<const Schemas extends RequestSchemas>(
  schemas: Schemas,
  handler: ValidatedHandler<Schemas>,
): RequestHandler {
  return async (req, res, next) => {
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
          issues.push(
            ...normalizeIssues(`path.${name}`, result.error.issues, true),
          );
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
      res.status(400).json({ error: "invalid_request", issues });
      return;
    }

    try {
      await handler(parsed as ValidatedInput<Schemas>, req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function normalizeIssues(
  surface: string,
  validationIssues: ValidationIssue[],
  surfaceNamesValue = false,
): PublicIssue[] {
  return validationIssues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys" && issue.keys) {
      return issue.keys.map((key) => ({
        path: issue.path.length ? [surface, ...issue.path].join(".") : surface,
        message: `Unrecognized field: ${key}`,
      }));
    }

    return [
      {
        path: surfaceNamesValue ? surface : [surface, ...issue.path].join("."),
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
  if (issue.code === "invalid_type" && issue.expected) {
    return `Expected ${issue.expected}`;
  }
  return "Invalid value";
}
