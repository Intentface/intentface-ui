import { create } from "zustand";
import type { Question } from "@/lib/ai/types";

// Ephemeral demo state driven by the playground cards. Deliberately NOT
// persisted (unlike the settings store): firing a demo question or
// showing the demo context strip is a transient demonstration, not
// configuration — a reload resets it.

type PlaygroundStore = {
  /** Demo questions injected into the composer; null when idle. */
  demoQuestions: Question[] | null;
  setDemoQuestions: (questions: Question[] | null) => void;
  /** Show the demo "open files" context strip above the composer. */
  showContextStrip: boolean;
  setShowContextStrip: (show: boolean) => void;
};

export const usePlaygroundStore = create<PlaygroundStore>()((set) => ({
  demoQuestions: null,
  setDemoQuestions: (questions) => set({ demoQuestions: questions }),
  showContextStrip: false,
  setShowContextStrip: (show) => set({ showContextStrip: show }),
}));
