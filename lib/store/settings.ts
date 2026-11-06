import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ComposerSubmitOn } from "@/components/ai/composer";
import type { ThreadAutoScrollMode } from "@/components/ai/thread";

type ThemeOverrides = {
  bg?: string;
  fg?: string;
  acc?: string;
  con?: number;
};

type ThemeMode = "light" | "dark";

// Which composer command prefixes are mounted (playground Composer card).
type CommandToggles = {
  mentions: boolean;
  slash: boolean;
  issues: boolean;
};

// Where the command list renders: the in-flow Panel above the field, or the
// floating Popover anchored to the active command badge.
type CommandSurface = "panel" | "popover";

// The thread's smooth-scroll timing (playground Thread card). "default" keeps
// the styled Thread's own timing, "native" opts back into the browser's smooth
// scroll, and the rest replace the timing with that easing.
type ScrollTimingOption = "default" | "native" | "ease-out" | "ease-in-out" | "linear" | "spring";

type SettingsStore = {
  themeOverrides: Record<ThemeMode, ThemeOverrides>;
  setThemeOverride: (mode: ThemeMode, key: keyof ThemeOverrides, value: string | number) => void;
  setThemeOverrides: (mode: ThemeMode, overrides: ThemeOverrides) => void;
  resetThemeOverrides: (mode: ThemeMode) => void;
  scrollMode: ThreadAutoScrollMode;
  setScrollMode: (mode: ThreadAutoScrollMode) => void;
  scrollTiming: ScrollTimingOption;
  setScrollTiming: (scrollTiming: ScrollTimingOption) => void;
  /** Milliseconds; the cap when a speed is set. */
  scrollDuration: number;
  setScrollDuration: (scrollDuration: number) => void;
  /** Pixels per second; 0 leaves the duration fixed. */
  scrollSpeed: number;
  setScrollSpeed: (scrollSpeed: number) => void;
  stickyMessages: boolean;
  setStickyMessages: (stickyMessages: boolean) => void;
  showScrollButton: boolean;
  setShowScrollButton: (showScrollButton: boolean) => void;
  showOverlays: boolean;
  setShowOverlays: (showOverlays: boolean) => void;
  showSources: boolean;
  setShowSources: (showSources: boolean) => void;
  showActions: boolean;
  setShowActions: (showActions: boolean) => void;
  suggestions: boolean;
  setSuggestions: (suggestions: boolean) => void;
  loopingPlaceholder: boolean;
  setLoopingPlaceholder: (loopingPlaceholder: boolean) => void;
  commands: CommandToggles;
  setCommandEnabled: (command: keyof CommandToggles, enabled: boolean) => void;
  commandSurface: CommandSurface;
  setCommandSurface: (commandSurface: CommandSurface) => void;
  submitOn: ComposerSubmitOn;
  setSubmitOn: (submitOn: ComposerSubmitOn) => void;
};

export type { ThemeOverrides, ThemeMode, CommandToggles, CommandSurface, ScrollTimingOption };

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      themeOverrides: { light: {}, dark: {} },
      scrollMode: "follow",
      setScrollMode: (mode) => set({ scrollMode: mode }),
      scrollTiming: "default",
      setScrollTiming: (scrollTiming) => set({ scrollTiming }),
      scrollDuration: 450,
      setScrollDuration: (scrollDuration) => set({ scrollDuration }),
      scrollSpeed: 0,
      setScrollSpeed: (scrollSpeed) => set({ scrollSpeed }),
      stickyMessages: false,
      setStickyMessages: (stickyMessages) => set({ stickyMessages }),
      showScrollButton: true,
      setShowScrollButton: (showScrollButton) => set({ showScrollButton }),
      showOverlays: true,
      setShowOverlays: (showOverlays) => set({ showOverlays }),
      showSources: true,
      setShowSources: (showSources) => set({ showSources }),
      showActions: true,
      setShowActions: (showActions) => set({ showActions }),
      suggestions: true,
      setSuggestions: (suggestions) => set({ suggestions }),
      loopingPlaceholder: true,
      setLoopingPlaceholder: (loopingPlaceholder) => set({ loopingPlaceholder }),
      commands: { mentions: true, slash: true, issues: false },
      setCommandEnabled: (command, enabled) =>
        set((state) => ({ commands: { ...state.commands, [command]: enabled } })),
      commandSurface: "panel",
      setCommandSurface: (commandSurface) => set({ commandSurface }),
      submitOn: "enter",
      setSubmitOn: (submitOn) => set({ submitOn }),
      setThemeOverride: (mode, key, value) =>
        set((state) => ({
          themeOverrides: {
            ...state.themeOverrides,
            [mode]: { ...state.themeOverrides[mode], [key]: value },
          },
        })),
      setThemeOverrides: (mode, overrides) =>
        set((state) => ({
          themeOverrides: { ...state.themeOverrides, [mode]: overrides },
        })),
      resetThemeOverrides: (mode) =>
        set((state) => ({
          themeOverrides: { ...state.themeOverrides, [mode]: {} },
        })),
    }),
    { name: "settings-store" },
  ),
);
