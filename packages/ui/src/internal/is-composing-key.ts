/**
 * An IME owns Enter (conversion confirm), the arrows (candidate window) and
 * Escape (cancel) during composition. 229 covers engines that omit isComposing.
 */
export const isComposingKey = (event: { isComposing: boolean; keyCode: number }) =>
  event.isComposing || event.keyCode === 229;
