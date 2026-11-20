import { createContext, use } from "react";
import type { ComposerTextareaState } from "./textarea";

// Carries the editor's state to parts rendered inside Composer.Textarea. The
// state includes IME composition, which lives in the editor engine rather than
// the store.
export const ComposerTextareaContext = createContext<ComposerTextareaState | null>(null);

export const useComposerTextareaState = (componentName: string): ComposerTextareaState => {
  const state = use(ComposerTextareaContext);
  if (!state) {
    throw new Error(`<Composer.${componentName}> must be rendered inside <Composer.Textarea>.`);
  }
  return state;
};
