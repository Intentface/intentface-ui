import { describe, expect, test } from "bun:test";
import {
  measureComposer,
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

describe("measureComposer", () => {
  const root = { getBoundingClientRect: () => ({ bottom: 600 }) } as unknown as HTMLElement;
  const composer = (rect: { top: number; width?: number; height?: number }) =>
    ({ getBoundingClientRect: () => ({ width: 0, height: 0, ...rect }) }) as unknown as HTMLElement;

  test("insets from the composer's top to the root bottom", () => {
    // 600 - 540
    expect(measureComposer(root, composer({ top: 540 })).inset).toBe(60);
  });

  test("reserves the space beneath a composer that floats above the bottom edge", () => {
    // The slot's own height would under-reserve; measuring to the root bottom doesn't.
    expect(measureComposer(root, composer({ top: 400, height: 60 })).inset).toBe(200);
  });

  test("reports the composer's own box, rounded to whole px", () => {
    const { width, height } = measureComposer(
      root,
      composer({ top: 508, width: 640.4, height: 91.6 }),
    );
    expect({ width, height }).toEqual({ width: 640, height: 92 });
  });
});
