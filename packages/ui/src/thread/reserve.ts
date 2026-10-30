import { warn as warnOnce } from "../internal/render/warn";

const RESERVE_MIN_HEIGHT = "var(--thread-turn-min-height, 0px)";
const TURN_SELECTOR = "[data-message-turn]";
const PLACEHOLDER_SELECTOR = "[data-thread-placeholder]";

const isTurn = (child: Element) =>
  child.matches(TURN_SELECTOR) || child.querySelector(TURN_SELECTOR) !== null;

export type LastChildReserve = {
  sync: () => void;
  clear: () => void;
};

export const createLastChildReserve = (content: HTMLElement): LastChildReserve => {
  let reserved: HTMLElement | null = null;

  const warnIfNotTurn = (last: Element | null) => {
    if (!last || last.matches(PLACEHOLDER_SELECTOR) || isTurn(last)) return;
    warnOnce(
      "Thread.Content reserves space on its last child so the newest turn can land at the top, but its last child isn't a Message.Turn. Wrap each question and its reply in Message.Turn, and render nothing after the last turn.",
    );
  };

  const sync = () => {
    const last = content.lastElementChild;
    if (process.env.NODE_ENV !== "production") warnIfNotTurn(last);
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
