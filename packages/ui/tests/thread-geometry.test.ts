import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BOTTOM_OFFSET,
  DOCK_SELECTOR,
  measureDockInset,
  measureDockSize,
  measureTopInset,
  queryDock,
  readViewportBox,
  sameViewportBox,
  scrollContainerTo,
  wasPrepended,
} from "../src/thread/geometry";

// geometry.ts only touches scrollTo / querySelector(All) / getBoundingClientRect,
// so we stub exactly those rather than needing a DOM (shadcn's stubbed-rects style).

describe("scrollContainerTo", () => {
  test("delegates to scrollTo with the top + behavior", () => {
    let captured: unknown;
    const el = {
      scrollTo: (options: unknown) => {
        captured = options;
      },
    } as unknown as HTMLElement;
    scrollContainerTo(el, 120, "smooth");
    expect(captured).toEqual({ top: 120, behavior: "smooth" });
  });
});

// The growth observer fires for content growth *and* for the container being
// resized around the thread. sameViewportBox is the whole rule separating them.
describe("readViewportBox", () => {
  const scroller = (width: number, height: number) =>
    ({ clientWidth: width, clientHeight: height }) as unknown as HTMLElement;

  test("reads the scroller's own box", () => {
    expect(readViewportBox(scroller(400, 592))).toEqual({ width: 400, height: 592 });
  });

  test("a missing scroller reads as an empty box", () => {
    expect(readViewportBox(null)).toEqual({ width: 0, height: 0 });
  });
});

describe("sameViewportBox", () => {
  test("a streamed token leaves the viewport box untouched", () => {
    expect(sameViewportBox({ width: 400, height: 592 }, { width: 400, height: 592 })).toBe(true);
  });

  test("a container animating open changes the height", () => {
    expect(sameViewportBox({ width: 400, height: 36 }, { width: 400, height: 592 })).toBe(false);
  });

  test("a pill expanding changes the width", () => {
    expect(sameViewportBox({ width: 36, height: 592 }, { width: 400, height: 592 })).toBe(false);
  });

  test("a spring frame changes both at once", () => {
    expect(sameViewportBox({ width: 36, height: 36 }, { width: 218, height: 314 })).toBe(false);
  });
});

describe("wasPrepended", () => {
  const mutation = (added: number, removed: number) =>
    ({
      addedNodes: { length: added },
      removedNodes: { length: removed },
    }) as unknown as MutationRecord;
  const content = (firstElementChild: unknown) => ({ firstElementChild }) as unknown as HTMLElement;

  test("true when rows were added, none removed, and the old first row moved down but stays connected", () => {
    const oldFirst = { isConnected: true } as unknown as Element;
    const newFirst = { isConnected: true } as unknown as Element;
    expect(wasPrepended([mutation(2, 0)], oldFirst, content(newFirst))).toBe(true);
  });

  test("false when anything was removed", () => {
    const oldFirst = { isConnected: true } as unknown as Element;
    const newFirst = {} as unknown as Element;
    expect(wasPrepended([mutation(1, 1)], oldFirst, content(newFirst))).toBe(false);
  });

  test("false when the previous first row is still first (append, not prepend)", () => {
    const first = { isConnected: true } as unknown as Element;
    expect(wasPrepended([mutation(1, 0)], first, content(first))).toBe(false);
  });

  test("false when there was no previous first row", () => {
    expect(wasPrepended([mutation(1, 0)], null, content({}))).toBe(false);
  });
});

describe("queryDock", () => {
  test("returns the Thread.Composer slot", () => {
    const dock = { id: "dock" };
    let queried: string | undefined;
    const root = {
      querySelector: (selector: string) => {
        queried = selector;
        return dock;
      },
    } as unknown as HTMLElement;
    expect(queryDock(root)).toBe(dock as unknown as HTMLElement);
    expect(queried).toBe(DOCK_SELECTOR);
  });

  test("null when the slot isn't mounted", () => {
    const root = { querySelector: () => null } as unknown as HTMLElement;
    expect(queryDock(root)).toBeNull();
  });
});

describe("measureTopInset", () => {
  const rootWith = (parts: { scroller?: unknown; content?: unknown }) =>
    ({
      querySelector: (selector: string) =>
        selector === "[data-thread-scroller]" ? (parts.scroller ?? null) : (parts.content ?? null),
    }) as unknown as HTMLElement;
  const scroller = (top: number, scrollTop = 0, clientTop = 0) => ({
    getBoundingClientRect: () => ({ top }),
    clientTop,
    scrollTop,
  });
  const content = (top: number) => ({ getBoundingClientRect: () => ({ top }) });

  test("is the space between the scroller's top and the content's top", () => {
    expect(measureTopInset(rootWith({ scroller: scroller(100), content: content(124) }))).toBe(24);
  });

  test("does not change while the scroller is scrolled", () => {
    // Scrolled 80px: the content's box moved up by 80 along with everything in it.
    expect(measureTopInset(rootWith({ scroller: scroller(100, 80), content: content(44) }))).toBe(
      24,
    );
  });

  test("starts below the scroller's border", () => {
    expect(
      measureTopInset(rootWith({ scroller: scroller(100, 0, 2), content: content(126) })),
    ).toBe(24);
  });

  test("is 0 until the scroller and the content are mounted", () => {
    expect(measureTopInset(rootWith({ content: content(24) }))).toBe(0);
    expect(measureTopInset(rootWith({ scroller: scroller(100) }))).toBe(0);
  });
});

describe("measureDockInset", () => {
  const rootWith = (dock: unknown) =>
    ({
      querySelector: () => dock,
      getBoundingClientRect: () => ({ bottom: 600 }),
    }) as unknown as HTMLElement;

  test("measures from the dock's top to the root bottom + gap", () => {
    // 600 - 540 + COMPOSER_GAP(32) = 92
    expect(measureDockInset(rootWith({ getBoundingClientRect: () => ({ top: 540 }) }))).toBe(92);
  });

  test("reserves the space beneath a dock that floats above the bottom edge", () => {
    // The slot's own height would under-reserve; measuring to the root bottom doesn't.
    expect(measureDockInset(rootWith({ getBoundingClientRect: () => ({ top: 400 }) }))).toBe(232);
  });

  test("null when the dock isn't mounted yet", () => {
    expect(measureDockInset(rootWith(null))).toBeNull();
  });
});

describe("measureDockSize", () => {
  const rootWith = (dock: unknown) => ({ querySelector: () => dock }) as unknown as HTMLElement;

  test("is the dock's own box, rounded to whole px", () => {
    const dock = { getBoundingClientRect: () => ({ width: 640.4, height: 91.6 }) };
    expect(measureDockSize(rootWith(dock))).toEqual({ width: 640, height: 92 });
  });

  test("null when the dock isn't mounted yet", () => {
    expect(measureDockSize(rootWith(null))).toBeNull();
  });
});

describe("constants", () => {
  test("expose the documented defaults", () => {
    expect(DEFAULT_BOTTOM_OFFSET).toBe(128);
    expect(DOCK_SELECTOR).toBe("[data-thread-composer]");
  });
});
