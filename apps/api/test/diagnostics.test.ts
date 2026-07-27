import { describe, expect, it } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { serializeFailure } from "../src/diagnostics";

describe("failure diagnostics", () => {
  it("retains five nested Error causes and safely represents non-Error throws", () => {
    const deepest = new Error("level six");
    const levelFive = new Error("level five", { cause: deepest });
    const levelFour = new Error("level four", { cause: levelFive });
    const levelThree = new Error("level three", { cause: levelFour });
    const levelTwo = new Error("level two", { cause: levelThree });
    const levelOne = new Error("level one", { cause: levelTwo });
    const root = Object.assign(new Error("root", { cause: levelOne }), {
      code: "XX000",
    });

    expect(serializeFailure(root).error).toMatchObject({
      type: "Error",
      code: "XX000",
      message: "root",
      cause: {
        message: "level one",
        cause: {
          message: "level two",
          cause: {
            message: "level three",
            cause: {
              message: "level four",
              cause: {
                message: "level five",
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(serializeFailure(root))).not.toContain("level six");

    expect(
      serializeFailure(
        {
          reason: "connection refused",
          accessToken: "non-error-token-sentinel",
        },
        { secrets: ["configured-non-error-sentinel"] },
      ).error,
    ).toEqual({
      type: "NonErrorThrow",
      value: {
        reason: "connection refused",
        accessToken: "[REDACTED]",
      },
    });
    expect(serializeFailure(undefined).error).toEqual({
      type: "NonErrorThrow",
      value: "[undefined]",
    });
    expect(
      serializeFailure(Symbol("configured-symbol-sentinel"), {
        secrets: ["configured-symbol-sentinel"],
      }).error,
    ).toEqual({
      type: "NonErrorThrow",
      value: "Symbol([REDACTED])",
    });
    expect(serializeFailure(() => undefined).error).toEqual({
      type: "NonErrorThrow",
      value: "[Function]",
    });
  });

  it("removes credentials recursively without hiding useful business diagnostics", () => {
    const clerkSecret = "sk_live_clerk-sentinel";
    const databaseUrl =
      "postgresql://unshelf:db-password-sentinel@database:5432/unshelf";
    const failure = Object.assign(
      new Error(
        `Item trail-42 failed with ${clerkSecret} at postgresql://reader:url-password-sentinel@database:5432/unshelf password=inline-password-sentinel`,
        {
          cause: new Error(
            `safe-cause contained client_secret=nested-secret-sentinel`,
          ),
        },
      ),
      {
        query: `select * from items where title = 'TypeScript' /* ${clerkSecret} */`,
        parameters: [
          "trail-42",
          {
            apiKey: "api-key-sentinel",
            note: "keep this note",
            headers: {
              authorization: "Bearer bearer-sentinel",
              cookie: "session=session-sentinel",
              "x-request-note": "keep this header",
            },
            nested: {
              refreshToken: "refresh-token-sentinel",
              password: "password-sentinel",
              connectionString: databaseUrl,
              businessValue: "keep this value",
            },
          },
        ],
        detail:
          "See https://example.test/failure?topic=typescript&X-Amz-Signature=signature-sentinel",
      },
    );

    const diagnostics = serializeFailure(failure, {
      secrets: [clerkSecret, databaseUrl],
    });
    const rendered = JSON.stringify(diagnostics);

    for (const sentinel of [
      clerkSecret,
      databaseUrl,
      "db-password-sentinel",
      "url-password-sentinel",
      "api-key-sentinel",
      "signature-sentinel",
      "bearer-sentinel",
      "session-sentinel",
      "refresh-token-sentinel",
      "password-sentinel",
      "inline-password-sentinel",
      "nested-secret-sentinel",
    ]) {
      expect(rendered).not.toContain(sentinel);
    }
    expect(rendered).toContain("trail-42");
    expect(rendered).toContain("TypeScript");
    expect(rendered).toContain("keep this note");
    expect(rendered).toContain("keep this header");
    expect(rendered).toContain("keep this value");
    expect(rendered).toContain("safe-cause");
    expect(rendered).toContain("typescript");
    expect(rendered).toContain("[REDACTED]");
  });

  it("combines Drizzle query context with its nested PostgreSQL diagnostics", () => {
    const postgresFailure = Object.assign(new Error("duplicate key"), {
      code: "23505",
      severity: "ERROR",
      detail: "Key (title)=(TypeScript) already exists",
      hint: "Choose another title",
      position: "42",
      schema: "public",
      table: "items",
      column: "title",
      constraint: "items_title_key",
      file: "nbtinsert.c",
      line: "666",
      routine: "_bt_check_unique",
    });
    const failure = new DrizzleQueryError(
      "insert into items (title) values ($1)",
      ["TypeScript"],
      postgresFailure,
    );

    expect(serializeFailure(failure)).toMatchObject({
      error: {
        cause: {
          type: "Error",
          code: "23505",
          message: "duplicate key",
        },
      },
      database: {
        query: "insert into items (title) values ($1)",
        parameters: ["TypeScript"],
        severity: "ERROR",
        detail: "Key (title)=(TypeScript) already exists",
        hint: "Choose another title",
        position: "42",
        schema: "public",
        table: "items",
        column: "title",
        constraint: "items_title_key",
        file: "nbtinsert.c",
        line: "666",
        routine: "_bt_check_unique",
      },
    });
  });
});
