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
// animating open, a window resize or a growing dock always does — which is what
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

// Fallback (px) until the composer is measured.
export const DEFAULT_BOTTOM_OFFSET = 128;
// Breathing room between the last line of content and the composer dock. The
// bottom overlay spans it in the styled layer.
const COMPOSER_GAP = 32;
// The dock is the Thread.Composer slot — the one element the thread reserves
// space for. Null until it mounts.
export const DOCK_SELECTOR = "[data-thread-composer]";

export const queryDock = (root: HTMLElement): HTMLElement | null =>
  root.querySelector(DOCK_SELECTOR);

/**
 * Height (px) to reserve at the bottom for the dock: its top edge down to the
 * root's bottom, plus the content gap. Measured against the root's bottom
 * rather than the slot's own height, so a dock that floats above the bottom
 * edge still reserves the space beneath it. Parts that must NOT reserve space
 * — the command-list / ask panel, the scroll button — are positioned out
 * of the slot's flow. Returns null when the slot isn't mounted yet.
 */
export const measureDockInset = (root: HTMLElement): number | null => {
  const dock = queryDock(root);
  if (!dock) return null;
  const dockTop = dock.getBoundingClientRect().top;
  return Math.round(root.getBoundingClientRect().bottom - dockTop + COMPOSER_GAP);
};

// Top inset reserved by the top overlay, measured straight off the rendered
// element (px) — no getComputedStyle / rem→px conversion. 0 if no top overlay.
export const measureTopInset = (root: HTMLElement): number =>
  root.querySelector('[data-thread-overlay="top"]')?.getBoundingClientRect().height ?? 0;
