// Size tracker — measures Composer.Root and Composer.Container, writes the
// --composer-* custom properties onto the root, and reports the same numbers
// for the store. Pure DOM, no React: Root hands its two attach functions to
// ref callbacks, so a Container mounted late or swapped through `render` is
// picked up with no effect keyed on it. Safe to create during a server render,
// since nothing touches the DOM until an element attaches.

import type { ComposerBox, ComposerSize } from "./store";

export type ComposerSizeTracker = {
  attachRoot: (element: HTMLElement) => () => void;
  attachContainer: (element: HTMLElement) => () => void;
};

// The layout box, in whole px: it ignores transforms, so a scale-in animation
// doesn't report a shrinking composer, and it rounds like the thread insets and
// --anchor-*, so values stacked in calc() agree.
const measureBox = (element: HTMLElement): ComposerBox => ({
  width: element.offsetWidth,
  height: element.offsetHeight,
});

const measure = (root: HTMLElement, container: HTMLElement | null): ComposerSize => ({
  ...measureBox(root),
  container: container && measureBox(container),
});

const isSameBox = (a: ComposerBox | null, b: ComposerBox | null) =>
  a === b || (a !== null && b !== null && a.width === b.width && a.height === b.height);

const isSameSize = (a: ComposerSize | null, b: ComposerSize | null) =>
  a === b || (a !== null && b !== null && isSameBox(a, b) && isSameBox(a.container, b.container));

const writeBox = (element: HTMLElement, prefix: string, box: ComposerBox | null) => {
  if (!box) {
    element.style.removeProperty(`${prefix}-height`);
    element.style.removeProperty(`${prefix}-width`);
    return;
  }
  element.style.setProperty(`${prefix}-height`, `${box.height}px`);
  element.style.setProperty(`${prefix}-width`, `${box.width}px`);
};

const writeSize = (root: HTMLElement, size: ComposerSize | null) => {
  writeBox(root, "--composer", size);
  writeBox(root, "--composer-container", size?.container ?? null);
};

export const createSizeTracker = (
  onChange: (size: ComposerSize | null) => void,
): ComposerSizeTracker => {
  let root: HTMLElement | null = null;
  let container: HTMLElement | null = null;
  let last: ComposerSize | null = null;
  let observer: ResizeObserver | null = null;

  // The one gate: writing the properties can resize the root and re-fire the
  // observer, and an unchanged size must also spare the store's subscribers.
  const flush = () => {
    const next = root ? measure(root, container) : null;
    if (isSameSize(next, last)) return;
    last = next;
    if (root) writeSize(root, next);
    onChange(next);
  };

  const observe = (element: HTMLElement) => {
    if (typeof ResizeObserver === "undefined") return;
    observer ??= new ResizeObserver(flush);
    observer.observe(element);
  };

  const attachRoot = (element: HTMLElement) => {
    root = element;
    observe(element);
    flush();
    return () => {
      observer?.unobserve(element);
      writeSize(element, null);
      root = null;
      flush();
    };
  };

  const attachContainer = (element: HTMLElement) => {
    container = element;
    observe(element);
    flush();
    return () => {
      observer?.unobserve(element);
      container = null;
      flush();
    };
  };

  return { attachRoot, attachContainer };
};
