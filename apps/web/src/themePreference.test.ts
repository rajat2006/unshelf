import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyThemePreference,
  parseThemePreference,
  persistThemePreference,
  readThemePreference,
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
    expect(
      resolvedTheme({ preference: "system", systemPrefersDark: false }),
    ).toBe("light");
  });

  it("persists and restores an explicit User preference", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    persistThemePreference("system");

    expect(readThemePreference()).toBe("system");
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
