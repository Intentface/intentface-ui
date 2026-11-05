// Pure DOM geometry + measurement for the thread scroll subsystem. No React —
// unit-testable with stubbed elements/rects.

// Queried per call, not cached — the OS setting can change mid-session and
// none of these scrolls are hot paths. Guarded for non-DOM (pure-test) callers.
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// "smooth" downgrades to "auto" under prefers-reduced-motion — deliberate
// movements still happen, they just don't animate.
export const resolveScrollBehavior = (behavior: ScrollBehavior): ScrollBehavior =>
  behavior === "smooth" && prefersReducedMotion() ? "auto" : behavior;

// Single place that performs the scroll, so callers just choose the behavior:
// 'instant' for jumps that must not animate, 'smooth' for deliberate movements.
export const scrollContainerTo = (el: HTMLElement, top: number, behavior: ScrollBehavior) => {
  el.scrollTo({ top, behavior: resolveScrollBehavior(behavior) });
};

// The scroll viewport's own box. Streamed content never changes it; a container
// animating open, a window resize or a growing composer always does — which is what
// separates the two kinds of resize the growth observer sees.
export type ViewportBox = { width: number; height: number };

export const readViewportBox = (el: HTMLElement | null): ViewportBox =>
  el ? { width: el.clientWidth, height: el.clientHeight } : { width: 0, height: 0 };

export const sameViewportBox = (a: ViewportBox, b: ViewportBox) =>
  a.width === b.width && a.height === b.height;

// A prepend = rows were added, nothing removed, and the previously-first row
// is still connected but no longer first (older history loading in above).
export const wasPrepended = (
  mutations: MutationRecord[],
  previousFirst: Element | null,
  content: HTMLElement,
) =>
  previousFirst?.isConnected === true &&
  content.firstElementChild !== previousFirst &&
  mutations.some((m) => m.addedNodes.length > 0) &&
  mutations.every((m) => m.removedNodes.length === 0);

/**
 * The composer's own box, plus the room it takes at the bottom: its top edge
 * down to the root's bottom. Measured against the root's bottom rather than the
 * slot's own height, so a composer that floats above the bottom edge still
 * reserves the space beneath it. Parts that must NOT reserve space — the
 * command-list / ask-user panel, the scroll button — sit out of the slot's flow.
 */
export const measureComposer = (root: HTMLElement, composer: HTMLElement) => {
  const { top, width, height } = composer.getBoundingClientRect();
  return {
    inset: Math.round(root.getBoundingClientRect().bottom - top),
    width: Math.round(width),
    height: Math.round(height),
  };
};
