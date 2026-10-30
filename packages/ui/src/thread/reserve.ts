// The last-turn reserve. While a top-landing mode is active, the last child of
// Thread.Content carries `min-height: var(--thread-turn-min-height, 0px)` so the
// newest turn can scroll up to the top. Applied inline so no consumer CSS is
// needed, and tracked so only the element we styled is ever cleared.

import { warn } from "../internal/render/warn";

const RESERVE_MIN_HEIGHT = "var(--thread-turn-min-height, 0px)";
const TURN_SELECTOR = "[data-message-turn]";

const isTurn = (child: Element) =>
  child.matches(TURN_SELECTOR) || child.querySelector(TURN_SELECTOR) !== null;

export type LastChildReserve = {
  /** Moves the reserve to the content's current last child. */
  sync: () => void;
  /** Removes the reserve from the element it was applied to. */
  clear: () => void;
};

export const createLastChildReserve = (content: HTMLElement): LastChildReserve => {
  let reserved: HTMLElement | null = null;

  // `warn` reports each message once per page, so a long transcript logs it once.
  const warnIfNotTurns = () => {
    if (content.children.length === 0) return;
    if (Array.from(content.children).some(isTurn)) return;
    warn(
      "Thread.Content reserves space on its last child so the newest turn can land at the top, but none of its children is a Message.Turn. Wrap each question and its reply in Message.Turn, or the reserve lands on the last message alone.",
    );
  };

  const sync = () => {
    if (process.env.NODE_ENV !== "production") warnIfNotTurns();
    const last = content.lastElementChild;
    if (last === reserved) return;
    reserved?.style.removeProperty("min-height");
    reserved = last instanceof HTMLElement ? last : null;
    reserved?.style.setProperty("min-height", RESERVE_MIN_HEIGHT);
  };

  const clear = () => {
    reserved?.style.removeProperty("min-height");
    reserved = null;
  };

  return { sync, clear };
};
