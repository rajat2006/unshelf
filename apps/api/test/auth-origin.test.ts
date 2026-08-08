import { describe, expect, it } from "vitest";
import {
  authorizedPartiesForOrigin,
  parsePublicOrigin,
} from "../src/middleware/auth";

describe("exact Clerk browser origin", () => {
  it("passes the single normalized HTTPS origin to Clerk", () => {
    expect(parsePublicOrigin("https://generated.example.com")).toBe(
      "https://generated.example.com",
    );
    expect(
      authorizedPartiesForOrigin({
        publicOrigin: "https://generated.example.com",
      }),
    ).toEqual({
      authorizedParties: ["https://generated.example.com"],
    });
  });

  it.each([
    "http://generated.example.com",
    "https://generated.example.com/",
    "https://generated.example.com/path",
    "https://generated.example.com?token=secret",
    "https://user:password@generated.example.com",
    "https://GENERATED.example.com",
    "not-an-origin",
  ])("rejects a non-exact public origin: %s", (value) => {
    expect(() => parsePublicOrigin(value)).toThrow(
      "PUBLIC_ORIGIN must be an exact HTTPS origin",
    );
  });
});
