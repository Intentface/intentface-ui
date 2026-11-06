import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CSSProperties } from "react";
import { Thread, useThread } from "../src/thread";
import {
  animateScroll,
  parseTime,
  readScrollTiming,
  resolveDuration,
} from "../src/thread/scroll-animation";

describe("parseTime", () => {
  test("reads milliseconds and seconds", () => {
    expect(parseTime("450ms")).toBe(450);
    expect(parseTime(" 0.45s ")).toBe(450);
    expect(parseTime(".2s")).toBe(200);
  });

  test("anything that is not a <time> is null", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("450")).toBeNull();
    expect(parseTime("ease")).toBeNull();
  });
});

// A computed style is only ever asked for custom properties.
const style = (vars: Record<string, string>) => ({
  getPropertyValue: (name: string) => vars[name] ?? "",
});

describe("readScrollTiming", () => {
  test("null when neither a duration nor a speed is set — the native scroll stays", () => {
    expect(readScrollTiming(style({}))).toBeNull();
    expect(readScrollTiming(style({ "--thread-scroll-easing": "linear" }))).toBeNull();
  });

  test("the longhands", () => {
    const timing = readScrollTiming(
      style({ "--thread-scroll-duration": "450ms", "--thread-scroll-easing": "ease-out" }),
    );
    expect(timing).toEqual({ duration: 450, speed: null, easing: "ease-out" });
  });

  test("a duration alone eases with the default", () => {
    expect(readScrollTiming(style({ "--thread-scroll-duration": "1s" }))?.easing).toBe("ease");
  });

  test("the shorthand takes a Motion spring() string as-is", () => {
    const spring = "900ms linear(0, 0.0444, 0.1487, 1)";
    expect(readScrollTiming(style({ "--thread-scroll": spring }))).toEqual({
      duration: 900,
      speed: null,
      easing: "linear(0, 0.0444, 0.1487, 1)",
    });
  });

  test("the shorthand takes its parts in either order, like transition", () => {
    const curve = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    const expected = { duration: 400, speed: null, easing: curve };
    expect(readScrollTiming(style({ "--thread-scroll": `400ms ${curve}` }))).toEqual(expected);
    expect(readScrollTiming(style({ "--thread-scroll": `${curve} 0.4s` }))).toEqual(expected);
    expect(readScrollTiming(style({ "--thread-scroll": "ease-out 300ms" }))).toEqual({
      duration: 300,
      speed: null,
      easing: "ease-out",
    });
  });

  test("a shorthand without a duration leaves the native scroll", () => {
    expect(readScrollTiming(style({ "--thread-scroll": "ease-out" }))).toBeNull();
  });

  test("longhands override the shorthand", () => {
    const timing = readScrollTiming(
      style({ "--thread-scroll": "900ms ease-in", "--thread-scroll-duration": "200ms" }),
    );
    expect(timing).toEqual({ duration: 200, speed: null, easing: "ease-in" });
  });

  test("none opts back out, over any longhand", () => {
    const optedOut = style({ "--thread-scroll": "none", "--thread-scroll-duration": "0ms" });
    expect(readScrollTiming(optedOut)).toBeNull();
  });

  test("a non-positive speed is ignored", () => {
    expect(readScrollTiming(style({ "--thread-scroll-speed": "0" }))).toBeNull();
  });
});

describe("resolveDuration", () => {
  test("a fixed duration ignores the distance", () => {
    expect(resolveDuration({ duration: 450, speed: null, easing: "ease" }, 5000)).toBe(450);
  });

  test("a speed paces the duration by distance, in either direction", () => {
    const paced = { duration: null, speed: 2000, easing: "ease" };
    expect(resolveDuration(paced, 500)).toBe(250);
    expect(resolveDuration(paced, -500)).toBe(250);
  });

  test("with a speed, the duration is the cap", () => {
    const capped = { duration: 300, speed: 1000, easing: "ease" };
    expect(resolveDuration(capped, 100)).toBe(100);
    expect(resolveDuration(capped, 5000)).toBe(300);
  });
});

// happy-dom has no Web Animations, and its frames run on timers. The animator
// only needs a timing effect's progress and play state, and a frame queue we
// can step by hand.
const fake = {
  progress: 0,
  finished: false,
  rejectedEasing: null as string | null,
  lastEasing: "",
  frames: [] as FrameRequestCallback[],
};

const useFakeTiming = () => {
  const saved = {
    Animation: globalThis.Animation,
    KeyframeEffect: globalThis.KeyframeEffect,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };

  beforeEach(() => {
    Object.assign(fake, { progress: 0, finished: false, rejectedEasing: null, frames: [] });
    globalThis.KeyframeEffect = class {
      constructor(_target: unknown, _keyframes: unknown, options: KeyframeEffectOptions) {
        if (options.easing === fake.rejectedEasing) throw new TypeError("invalid easing");
        fake.lastEasing = options.easing ?? "";
      }
      getComputedTiming = () => ({ progress: fake.progress });
    } as unknown as typeof KeyframeEffect;
    globalThis.Animation = class {
      constructor(public effect: KeyframeEffect) {}
      get playState() {
        return fake.finished ? "finished" : "running";
      }
      play() {}
      cancel() {}
    } as unknown as typeof Animation;
    globalThis.requestAnimationFrame = (callback) => fake.frames.push(callback);
    globalThis.cancelAnimationFrame = (handle) => {
      fake.frames[handle - 1] = () => {};
    };
  });

  afterEach(() => Object.assign(globalThis, saved));
};

const nextFrame = (at: number, done = false) => {
  fake.progress = at;
  fake.finished = done;
  fake.frames.at(-1)?.(0);
};

describe("animateScroll", () => {
  useFakeTiming();

  const scroller = (top: number) => {
    const writes: number[] = [];
    const el = {
      scrollTop: top,
      scrollTo: ({ top: next }: ScrollToOptions) => writes.push(next ?? 0),
    } as unknown as HTMLElement;
    return { el, writes };
  };

  test("moves by the eased progress and finishes on the target", () => {
    const { el, writes } = scroller(0);
    let doneCount = 0;
    animateScroll(el, {
      duration: 400,
      easing: "ease-out",
      getTarget: () => 1000,
      onFinish: () => doneCount++,
    });
    nextFrame(0.5);
    nextFrame(0.9);
    nextFrame(1, true);
    expect(writes).toEqual([500, 900, 1000]);
    expect(doneCount).toBe(1);
  });

  test("re-reads the target every frame, so growth mid-flight is tracked", () => {
    const { el, writes } = scroller(0);
    let target = 1000;
    animateScroll(el, { duration: 400, easing: "linear", getTarget: () => target, onFinish() {} });
    nextFrame(0.5);
    target = 1400;
    nextFrame(1, true);
    expect(writes).toEqual([500, 1400]);
  });

  test("cancel stops it where it is, without finishing", () => {
    const { el, writes } = scroller(0);
    let doneCount = 0;
    const cancel = animateScroll(el, {
      duration: 400,
      easing: "linear",
      getTarget: () => 1000,
      onFinish: () => doneCount++,
    });
    nextFrame(0.25);
    cancel();
    nextFrame(1, true);
    expect(writes).toEqual([250]);
    expect(doneCount).toBe(0);
  });

  test("an easing the engine rejects falls back to the default", () => {
    fake.rejectedEasing = "not-an-easing";
    const { el } = scroller(0);
    animateScroll(el, {
      duration: 400,
      easing: "not-an-easing",
      getTarget: () => 1,
      onFinish() {},
    });
    expect(fake.lastEasing).toBe("ease");
  });
});

// The thread end to end: what the styled layer sees (data-scrolling) and what
// stops an animation. happy-dom has no layout, so every destination is 0 —
// these assert the lifecycle, not positions.
describe("Thread scripted scroll", () => {
  useFakeTiming();

  const ScrollButtons = () => {
    const { scrollToBottom, scrollToMessage } = useThread();
    return (
      <>
        <button type="button" onClick={() => scrollToBottom()}>
          Latest
        </button>
        <button type="button" onClick={() => scrollToMessage("greeting")}>
          Greeting
        </button>
      </>
    );
  };

  const renderThread = (timing: Record<string, string>) => {
    const { container } = render(
      <Thread.Root autoScroll="off" style={timing as CSSProperties}>
        <Thread.Viewport>
          <Thread.Content>
            <p data-message-id="greeting">Hello</p>
          </Thread.Content>
        </Thread.Viewport>
        <ScrollButtons />
      </Thread.Root>,
    );
    const root = container.querySelector("[data-thread-root]") as HTMLElement;
    const scroller = container.querySelector("[data-thread-scroller]") as HTMLElement;
    const row = container.querySelector("[data-message-id]") as HTMLElement;
    return { root, scroller, row };
  };

  const clickLatest = () => act(() => screen.getByRole("button", { name: "Latest" }).click());

  test("stamps data-scrolling with the kind while the animation runs", () => {
    const { root } = renderThread({ "--thread-scroll-duration": "400ms" });
    clickLatest();
    expect(root.getAttribute("data-scrolling")).toBe("bottom");
    nextFrame(0.5);
    expect(root.getAttribute("data-scrolling")).toBe("bottom");
    nextFrame(1, true);
    expect(root.hasAttribute("data-scrolling")).toBe(false);
  });

  test("a wheel in either direction interrupts it", () => {
    const { root, scroller } = renderThread({ "--thread-scroll-duration": "400ms" });
    clickLatest();
    fireEvent.wheel(scroller, { deltaY: 40 });
    expect(root.hasAttribute("data-scrolling")).toBe(false);
  });

  test("a scroll key on the focused viewport interrupts it", () => {
    const { root, scroller } = renderThread({ "--thread-scroll-duration": "400ms" });
    clickLatest();
    fireEvent.keyDown(scroller, { key: "PageDown" });
    expect(root.hasAttribute("data-scrolling")).toBe(false);
  });

  test("without a timing, the scroll stays native and nothing is stamped", () => {
    const { root, scroller } = renderThread({});
    const calls: ScrollToOptions[] = [];
    scroller.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as never;
    clickLatest();
    expect(root.hasAttribute("data-scrolling")).toBe(false);
    expect(fake.frames).toHaveLength(0);
    expect(calls.at(-1)?.behavior).toBe("smooth");
  });

  test("a zero duration jumps instantly", () => {
    const { root, scroller } = renderThread({ "--thread-scroll-duration": "0ms" });
    const calls: ScrollToOptions[] = [];
    scroller.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as never;
    clickLatest();
    expect(root.hasAttribute("data-scrolling")).toBe(false);
    expect(calls.at(-1)?.behavior).toBe("instant");
  });

  test("a touch interrupts it", () => {
    const { root, scroller } = renderThread({ "--thread-scroll-duration": "400ms" });
    clickLatest();
    fireEvent.touchStart(scroller, { touches: [{ clientY: 100 }] });
    expect(root.hasAttribute("data-scrolling")).toBe(false);
  });

  test("a press on the scroller itself — its scrollbar — interrupts it; a press on a row does not", () => {
    const { root, scroller, row } = renderThread({ "--thread-scroll-duration": "400ms" });
    clickLatest();
    fireEvent.pointerDown(row);
    expect(root.getAttribute("data-scrolling")).toBe("bottom");
    fireEvent.pointerDown(scroller);
    expect(root.hasAttribute("data-scrolling")).toBe(false);
  });

  test("none keeps the native scroll, over any longhand", () => {
    const { root, scroller } = renderThread({
      "--thread-scroll": "none",
      "--thread-scroll-duration": "400ms",
    });
    const calls: ScrollToOptions[] = [];
    scroller.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as never;
    clickLatest();
    expect(root.hasAttribute("data-scrolling")).toBe(false);
    expect(calls.at(-1)?.behavior).toBe("smooth");
  });

  test("under reduced motion nothing animates, whatever the timing", () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce") })) as never;
    try {
      const { root, scroller } = renderThread({ "--thread-scroll-duration": "400ms" });
      const calls: ScrollToOptions[] = [];
      scroller.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as never;
      clickLatest();
      expect(root.hasAttribute("data-scrolling")).toBe(false);
      expect(calls.at(-1)?.behavior).toBe("instant");
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  // CHAT-40: scrollIntoView scrolls every scrollable ancestor, so a thread
  // embedded in a page moved the page too. The native path now computes the
  // row's position itself and scrolls only the thread's own viewport.
  const placeRow = (scroller: HTMLElement, row: HTMLElement) => {
    scroller.getBoundingClientRect = () => ({ top: 100, bottom: 400, height: 300 }) as DOMRect;
    Object.defineProperty(scroller, "clientHeight", { value: 300, configurable: true });
    Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });
    row.getBoundingClientRect = () => ({ top: 500, bottom: 540, height: 40 }) as DOMRect;
    let intoView = false;
    row.scrollIntoView = (() => {
      intoView = true;
    }) as never;
    const calls: ScrollToOptions[] = [];
    scroller.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as never;
    return { calls, usedScrollIntoView: () => intoView };
  };

  test("scrollToMessage without a timing scrolls only the thread's viewport", () => {
    const { scroller, row } = renderThread({});
    const { calls, usedScrollIntoView } = placeRow(scroller, row);
    act(() => screen.getByRole("button", { name: "Greeting" }).click());
    expect(usedScrollIntoView()).toBe(false);
    // align "start": the row's top (400px into the content) at the viewport's top.
    expect(calls.at(-1)).toEqual({ top: 400, behavior: "smooth" });
  });

  test("scrollToMessage under reduced motion jumps, still only within the thread", () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce") })) as never;
    try {
      const { scroller, row } = renderThread({});
      const { calls, usedScrollIntoView } = placeRow(scroller, row);
      act(() => screen.getByRole("button", { name: "Greeting" }).click());
      expect(usedScrollIntoView()).toBe(false);
      expect(calls.at(-1)).toEqual({ top: 400, behavior: "instant" });
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  test("scrollToMessage with a timing animates, stamped as a message scroll", () => {
    const { root } = renderThread({ "--thread-scroll-duration": "400ms" });
    act(() => screen.getByRole("button", { name: "Greeting" }).click());
    expect(root.getAttribute("data-scrolling")).toBe("message");
  });
});

// A gesture that interrupts a timed scroll hands the follow to the user: what
// it released stays released, and the bottom edge leaving view while the
// thread's own scroll held that off is acted on as soon as the user takes over.
describe("Thread scroll interrupt", () => {
  useFakeTiming();

  const observers = {
    edge: null as { callback: IntersectionObserverCallback; observed: Element[] } | null,
    growth: [] as ResizeObserverCallback[],
  };
  const saved = {
    IntersectionObserver: globalThis.IntersectionObserver,
    ResizeObserver: globalThis.ResizeObserver,
  };

  beforeEach(() => {
    observers.edge = null;
    observers.growth = [];
    // happy-dom has no document timeline; the follow names frames by it.
    Object.defineProperty(document, "timeline", { value: { currentTime: 0 }, configurable: true });
    globalThis.IntersectionObserver = class {
      observed: Element[] = [];
      constructor(callback: IntersectionObserverCallback) {
        observers.edge = { callback, observed: this.observed };
      }
      observe(target: Element) {
        this.observed.push(target);
      }
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        observers.growth.push(callback);
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    Object.assign(globalThis, saved);
    Reflect.deleteProperty(document, "timeline");
  });

  // The edge observer watches the top sentinel, then the bottom one.
  const reportBottom = (inView: boolean) => {
    const edge = observers.edge;
    const bottomSentinel = edge?.observed[1];
    if (!edge || !bottomSentinel) throw new Error("no edge observer");
    act(() =>
      edge.callback([{ target: bottomSentinel, isIntersecting: inView }] as never, edge as never),
    );
  };

  // The first resize after mount is the land's own and is skipped.
  const grow = () =>
    act(() => {
      for (let i = 0; i < 2; i++) {
        for (const callback of observers.growth) callback([], {} as never);
      }
    });

  const LatestButton = () => {
    const { scrollToBottom } = useThread();
    return (
      <button type="button" onClick={() => scrollToBottom()}>
        Latest
      </button>
    );
  };

  // A following thread at the bottom, mid-way through a timed scroll to it.
  const renderScrolling = () => {
    const { container } = render(
      <Thread.Root autoScroll="follow" style={{ "--thread-scroll-duration": "400ms" } as never}>
        <Thread.Viewport>
          <Thread.Content>
            <p>Hello</p>
          </Thread.Content>
        </Thread.Viewport>
        <LatestButton />
      </Thread.Root>,
    );
    const root = container.querySelector("[data-thread-root]") as HTMLElement;
    const scroller = container.querySelector("[data-thread-scroller]") as HTMLElement;
    reportBottom(true);
    act(() => screen.getByRole("button", { name: "Latest" }).click());
    expect(root.getAttribute("data-scrolling")).toBe("bottom");
    return { root, scroller };
  };

  const recordScrolls = (scroller: HTMLElement) => {
    const calls: ScrollToOptions[] = [];
    scroller.scrollTo = ((options: ScrollToOptions) => calls.push(options)) as never;
    return calls;
  };

  test("a wheel up releases the follow, so growth is no longer followed", () => {
    const { root, scroller } = renderScrolling();
    fireEvent.wheel(scroller, { deltaY: -40 });
    const calls = recordScrolls(scroller);
    grow();
    expect(calls).toHaveLength(0);
    expect(root.hasAttribute("data-scrolling")).toBe(false);
  });

  test("a wheel down keeps the follow, so growth is still followed, pinned", () => {
    const { root, scroller } = renderScrolling();
    fireEvent.wheel(scroller, { deltaY: 40 });
    const calls = recordScrolls(scroller);
    grow();
    expect(calls.at(-1)?.behavior).toBe("instant");
    expect(root.hasAttribute("data-scrolling")).toBe(false);
  });

  test("the bottom leaving view mid-scroll is held off, then acted on when a gesture takes over", () => {
    const { root, scroller } = renderScrolling();
    reportBottom(false);
    expect(root.hasAttribute("data-at-bottom")).toBe(true);
    fireEvent.wheel(scroller, { deltaY: 40 });
    expect(root.hasAttribute("data-at-bottom")).toBe(false);
    grow();
    expect(root.hasAttribute("data-scrolling")).toBe(false);
  });
});
