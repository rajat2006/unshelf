import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyThemePreference,
  parseThemePreference,
  resolvedTheme,
} from "./themePreference";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("applies the resolved appearance to the document root", () => {
    const root = {
      classList: {
        toggle: vi.fn(),
      },
      dataset: {} as Record<string, string>,
    };
    vi.stubGlobal("document", { documentElement: root });

    applyThemePreference({ preference: "dark", systemPrefersDark: false });

    expect(root.dataset.theme).toBe("dark");
    expect(root.classList.toggle).toHaveBeenCalledWith("dark", true);
  });
});
