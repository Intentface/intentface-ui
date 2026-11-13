"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import { formatOklch } from "@/lib/oklch";
import type { ThemeMode } from "@/lib/store/settings";
import { useSettingsStore } from "@/lib/store/settings";

const CSS_VARS = [
  ["bg", "--bg"],
  ["fg", "--fg"],
  ["acc", "--acc"],
  ["con", "--con"],
] as const;

export const useThemeOverrides = () => {
  const { resolvedTheme } = useTheme();
  const themeOverrides = useSettingsStore((state) => state.themeOverrides);

  useEffect(() => {
    if (!resolvedTheme) return;

    const mode = (resolvedTheme === "dark" ? "dark" : "light") as ThemeMode;
    const overrides = themeOverrides[mode];
    const style = document.documentElement.style;

    for (const [key, cssVar] of CSS_VARS) {
      const value = overrides[key];
      if (value !== undefined) {
        style.setProperty(cssVar, formatSeed(value));
      } else {
        style.removeProperty(cssVar);
      }
    }
  }, [resolvedTheme, themeOverrides]);
};

// The picker's hex goes in as oklch(): see the Seeds comment in globals.css.
const formatSeed = (value: string | number) =>
  typeof value === "number" ? String(value) : formatOklch(value);
