// Scroll something into view inside a primitive's own scroll areas, never the
// page around it. scrollIntoView walks every scrollable ancestor up to the
// window, so an embedded composer or thread would yank its page, and its
// `container: "nearest"` scoping is Chromium-only. Hence by hand, with
// scrollIntoView's `block` semantics.

// scrollIntoView's `block` alignment.
export type ScrollAlign = "start" | "center" | "end" | "nearest";

// Vertical edges in viewport coordinates.
type Edges = { top: number; bottom: number };

const px = (value: string) => Number.parseFloat(value) || 0;

// scroll-padding's computed value keeps percentages, which resolve against the
// scroll container's own height. (scroll-margin takes lengths only.)
const paddingPx = (value: string, height: number) =>
  value.trim().endsWith("%") ? (px(value) / 100) * height : px(value);

// An element's box grown by its scroll-margin: the box scrollIntoView aligns.
const marginEdges = (element: Element): Edges => {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    top: rect.top - px(style.scrollMarginTop),
    bottom: rect.bottom + px(style.scrollMarginBottom),
  };
};

/**
 * The scrollTop that aligns `target` inside `scroller` the way scrollIntoView
 * would: honoring an element's scroll-margin and the scroller's scroll-padding,
 * clamped to the scroll range. Returned, not applied, so a scripted animation
 * can head for it. A bare rect (a caret has no element) has no margin.
 */
export const alignedScrollTop = (
  scroller: HTMLElement,
  target: Element | Edges,
  align: ScrollAlign,
): number => {
  const edges = target instanceof Element ? marginEdges(target) : target;
  const scrollerStyle = getComputedStyle(scroller);
  const scrollerTop = scroller.getBoundingClientRect().top + scroller.clientTop;

  // Target edges in scroll coordinates.
  const targetTop = edges.top - scrollerTop + scroller.scrollTop;
  const targetBottom = edges.bottom - scrollerTop + scroller.scrollTop;
  // The visible band, shrunk by the scroller's scroll-padding.
  const paddingTop = paddingPx(scrollerStyle.scrollPaddingTop, scroller.clientHeight);
  const paddingBottom = paddingPx(scrollerStyle.scrollPaddingBottom, scroller.clientHeight);
  const band = scroller.clientHeight - paddingTop - paddingBottom;
  const viewTop = scroller.scrollTop + paddingTop;
  const viewBottom = viewTop + band;

  const toStart = targetTop - paddingTop;
  const toEnd = targetBottom - paddingTop - band;
  const destination = (() => {
    if (align === "start") return toStart;
    if (align === "end") return toEnd;
    if (align === "center") return (targetTop + targetBottom) / 2 - paddingTop - band / 2;
    // "nearest", per the CSSOM View rules: leave a target that is fully in
    // view, or that overflows the band at both edges, where it is; otherwise
    // bring in the edge that is out of view, or the top of one too tall to fit.
    const fits = targetBottom - targetTop <= band;
    const above = targetTop < viewTop;
    const below = targetBottom > viewBottom;
    if (above === below) return scroller.scrollTop;
    return above === fits ? toStart : toEnd;
  })();

  const max = scroller.scrollHeight - scroller.clientHeight;
  return Math.min(Math.max(0, destination), Math.max(0, max));
};

// A scroll area the walk may move: it scrolls on its own and has room to.
const scrolls = (element: HTMLElement) => {
  const { overflowY } = getComputedStyle(element);
  return (
    (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight
  );
};

export type ScrollIntoViewWithinOptions = {
  /** Where the target lands in each scroll area; scrollIntoView's `block`. Default "nearest". */
  block?: ScrollAlign;
};

/**
 * Brings `target` into view by scrolling each scrollable ancestor in turn, as
 * scrollIntoView does, but never one outside `boundary` (which may scroll
 * itself). `target` is an element, or a bare rect measured from inside `from`.
 */
export const scrollIntoViewWithin = (
  target: HTMLElement | { rect: DOMRect; from: HTMLElement },
  boundary: Element,
  { block = "nearest" }: ScrollIntoViewWithinOptions = {},
): void => {
  const isElement = target instanceof HTMLElement;
  let edges: Edges = isElement ? marginEdges(target) : target.rect;
  // An element scrolls its ancestors, never itself; a rect's `from` may scroll.
  let scroller = isElement ? target.parentElement : target.from;
  while (scroller && boundary.contains(scroller)) {
    if (scrolls(scroller)) {
      const before = scroller.scrollTop;
      const top = alignedScrollTop(scroller, edges, block);
      scroller.scrollTop = top;
      // The target moves with the scrolled content; carry that to the next
      // scroller out. From the destination, not a read-back: a CSS smooth
      // scroll hasn't moved yet.
      const moved = top - before;
      edges = { top: edges.top - moved, bottom: edges.bottom - moved };
    }
    scroller = scroller.parentElement;
  }
};
