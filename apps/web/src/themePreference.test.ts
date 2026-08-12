import { describe, expect, it } from "vitest";
import { parseThemePreference, resolvedTheme } from "./themePreference";

describe("theme preference", () => {
  it("defaults missing and unknown preferences to light", () => {
    expect(parseThemePreference(null)).toBe("light");
    expect(parseThemePreference("unknown")).toBe("light");
  });

  it("uses the system scheme only when system is explicitly selected", () => {
    expect(
      resolvedTheme({ preference: "light", systemPrefersDark: true }),
    ).toBe("light");
    expect(
      resolvedTheme({ preference: "dark", systemPrefersDark: false }),
    ).toBe("dark");
    expect(
      resolvedTheme({ preference: "system", systemPrefersDark: true }),
    ).toBe("dark");
  });
});
