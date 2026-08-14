export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

const THEME_STORAGE_KEY = "unshelf.theme";

export function parseThemePreference(value: string | null): ThemePreference {
  return (
    THEME_PREFERENCES.find((preference) => preference === value) ?? "light"
  );
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light";

  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function resolvedTheme({
  preference,
  systemPrefersDark,
}: {
  preference: ThemePreference;
  systemPrefersDark: boolean;
}): "light" | "dark" {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function applyThemePreference({
  preference,
  systemPrefersDark,
}: {
  preference: ThemePreference;
  systemPrefersDark: boolean;
}): void {
  const theme = resolvedTheme({
    preference,
    systemPrefersDark,
  });
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The selected theme still applies when storage is unavailable.
  }
}

export function initializeThemePreference(): void {
  const preference = readThemePreference();
  const systemPrefersDark = window.matchMedia?.(SYSTEM_DARK_QUERY).matches;
  applyThemePreference({ preference, systemPrefersDark: !!systemPrefersDark });
}
