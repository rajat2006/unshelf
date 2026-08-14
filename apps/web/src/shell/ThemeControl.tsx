import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
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
  const preferenceLabel =
    preference === "light"
      ? "Light"
      : preference === "dark"
        ? "Dark"
        : "System";

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
    <Select
      value={preference}
      onValueChange={(value) => setPreference(parseThemePreference(value))}
    >
      <SelectTrigger aria-label="Theme" size="sm" className="w-[6.5rem]">
        <SelectValue>{preferenceLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="dark">Dark</SelectItem>
        <SelectItem value="system">System</SelectItem>
      </SelectContent>
    </Select>
  );
}
