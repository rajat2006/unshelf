import { useEffect, useState } from "react";
import {
  applyThemePreference,
  parseThemePreference,
  persistThemePreference,
  readThemePreference,
  SYSTEM_DARK_QUERY,
  type ThemePreference,
} from "../themePreference";

export function ThemeControl() {
  const [preference, setPreference] =
    useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    const systemTheme = window.matchMedia(SYSTEM_DARK_QUERY);
    const apply = () =>
      applyThemePreference({
        preference,
        systemPrefersDark: systemTheme.matches,
      });

    persistThemePreference(preference);
    apply();

    if (preference !== "system") return;
    systemTheme.addEventListener("change", apply);
    return () => systemTheme.removeEventListener("change", apply);
  }, [preference]);

  return (
    <label className="theme-control">
      <span className="visually-hidden">Theme</span>
      <select
        value={preference}
        onChange={(event) =>
          setPreference(parseThemePreference(event.currentTarget.value))
        }
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
