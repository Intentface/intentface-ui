import { afterEach, describe, expect, test } from "bun:test";
import { alignedScrollTop } from "../src/internal/scroll-into-view-within";

// The shared alignment math behind every scroll-into-view in the package. The
// walk across nested scroll areas and each call site's containment are covered
// with their components (composer-scroll-containment, thread-scroll-animation).

afterEach(() => {
  document.body.innerHTML = "";
});

const pair = ({ scroller, row }: { scroller: HTMLElement; row: HTMLElement }) =>
  [scroller, row] as const;

describe("alignedScrollTop", () => {
  // A 400px-tall scroller at viewport top 100, scrolled to 1000 of 3000. Rows
  // are placed by their offset inside the scroll content.
  const setup = (rowTop: number, rowHeight: number, rowStyle = "", scrollerStyle = "") => {
    const scroller = document.createElement("div");
    const row = document.createElement("div");
    scroller.setAttribute("style", scrollerStyle);
    row.setAttribute("style", rowStyle);
    scroller.append(row);
    document.body.append(scroller);
    for (const [key, value] of Object.entries({
      scrollTop: 1000,
      scrollHeight: 3000,
      clientHeight: 400,
      clientTop: 0,
    })) {
      Object.defineProperty(scroller, key, { value, configurable: true });
    }
    scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    row.getBoundingClientRect = () =>
      ({ top: 100 + rowTop - 1000, bottom: 100 + rowTop - 1000 + rowHeight }) as DOMRect;
    return { scroller, row };
  };

  test("start puts the row's top at the scroller's top", () => {
    const { scroller, row } = setup(1800, 100);
    expect(alignedScrollTop(scroller, row, "start")).toBe(1800);
  });

  test("end puts the row's bottom at the scroller's bottom", () => {
    const { scroller, row } = setup(1800, 100);
    expect(alignedScrollTop(scroller, row, "end")).toBe(1500);
  });

  test("center centers it", () => {
    const { scroller, row } = setup(1800, 100);
    expect(alignedScrollTop(scroller, row, "center")).toBe(1650);
  });

  test("honors the row's scroll-margin and the scroller's scroll-padding", () => {
    const { scroller, row } = setup(
      1800,
      100,
      "scroll-margin-top: 16px",
      "scroll-padding-top: 8px",
    );
    expect(alignedScrollTop(scroller, row, "start")).toBe(1776);
  });

  test("resolves a percentage scroll-padding against the viewport's height", () => {
    // 400px viewport: 10% = 40px at the top, 25% = 100px at the bottom.
    const padded = "scroll-padding-top: 10%; scroll-padding-bottom: 25%";
    expect(alignedScrollTop(...pair(setup(1800, 100, "", padded)), "start")).toBe(1760);
    // The row's bottom (1900) at the band's bottom: 1900 - 40 - (400 - 40 - 100).
    expect(alignedScrollTop(...pair(setup(1800, 100, "", padded)), "end")).toBe(1600);
  });

  test("a bare rect (a caret's) aligns the same way, with no margin to read", () => {
    const { scroller } = setup(0, 0);
    // 1800–1900 in the content, in viewport coordinates.
    const rect = { top: 900, bottom: 1000 };
    expect(alignedScrollTop(scroller, rect, "start")).toBe(1800);
    expect(alignedScrollTop(scroller, rect, "nearest")).toBe(1500);
  });

  test("clamps to the scroll range", () => {
    expect(alignedScrollTop(...pair(setup(2900, 100)), "start")).toBe(2600);
    expect(alignedScrollTop(...pair(setup(50, 100)), "end")).toBe(0);
  });

  describe("nearest", () => {
    test("a row in view stays put", () => {
      const { scroller, row } = setup(1100, 100);
      expect(alignedScrollTop(scroller, row, "nearest")).toBe(1000);
    });

    test("a row above comes in at the top, a row below at the bottom", () => {
      expect(alignedScrollTop(...pair(setup(600, 100)), "nearest")).toBe(600);
      expect(alignedScrollTop(...pair(setup(1800, 100)), "nearest")).toBe(1500);
    });

    test("a row taller than the view, below it, brings in its top", () => {
      expect(alignedScrollTop(...pair(setup(1200, 600)), "nearest")).toBe(1200);
    });

    test("a row overflowing both edges stays put", () => {
      expect(alignedScrollTop(...pair(setup(900, 600)), "nearest")).toBe(1000);
    });
  });
});
