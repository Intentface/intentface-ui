import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { Thread, type ThreadAutoScrollMode } from "../src/thread";
import { AUTO_SCROLL_SETTLE_MS } from "../src/thread/thread";

// happy-dom's IntersectionObserver and ResizeObserver never fire.
type Watcher = { callback: (entries: never[]) => void; targets: Set<Element> };

const intersectionWatchers: Watcher[] = [];
const resizeWatchers: Watcher[] = [];

const createFakeObserver = (watchers: Watcher[]) =>
  class {
    readonly #watcher: Watcher;

    constructor(callback: Watcher["callback"]) {
      this.#watcher = { callback, targets: new Set() };
      watchers.push(this.#watcher);
    }

    observe(target: Element) {
      this.#watcher.targets.add(target);
    }

    unobserve(target: Element) {
      this.#watcher.targets.delete(target);
    }

    disconnect() {
      this.#watcher.targets.clear();
    }
  };

const watching = (watchers: Watcher[], target: Element) =>
  watchers.filter(({ targets }) => targets.has(target));

const reportEdge = (sentinel: Element, { isIntersecting }: { isIntersecting: boolean }) =>
  act(() => {
    for (const { callback } of watching(intersectionWatchers, sentinel)) {
      callback([{ target: sentinel, isIntersecting }] as never[]);
    }
  });

const reportInView = (sentinel: Element) => reportEdge(sentinel, { isIntersecting: true });
const reportOutOfView = (sentinel: Element) => reportEdge(sentinel, { isIntersecting: false });

const resize = (target: Element) =>
  act(() => {
    for (const { callback } of watching(resizeWatchers, target)) callback([]);
  });

const SCROLL_HEIGHT = 1200;

const Chat = ({
  turns,
  autoScroll,
  preserveScrollOnPrepend,
}: {
  turns: string[];
  autoScroll?: ThreadAutoScrollMode;
  preserveScrollOnPrepend?: boolean;
}) => (
  <Thread.Root autoScroll={autoScroll} preserveScrollOnPrepend={preserveScrollOnPrepend}>
    <Thread.Viewport>
      {turns.length > 0 && (
        <Thread.Content>
          {turns.map((turn) => (
            <p key={turn} data-turn={turn}>
              {turn}
            </p>
          ))}
        </Thread.Content>
      )}
    </Thread.Viewport>
  </Thread.Root>
);

const renderChat = (props: Parameters<typeof Chat>[0]) => {
  const view = render(<Chat {...props} />);
  const part = (selector: string) => view.container.querySelector(selector) as HTMLElement;
  const scroller = part("[data-thread-scroller]");
  Object.defineProperty(scroller, "scrollHeight", { value: SCROLL_HEIGHT, configurable: true });
  const scrolls: ScrollToOptions[] = [];
  scroller.scrollTo = ((options: ScrollToOptions) => scrolls.push(options)) as never;
  const showTurns = (turns: string[]) => view.rerender(<Chat {...props} turns={turns} />);
  return { root: part("[data-thread-root]"), scroller, scrolls, part, showTurns };
};

describe("Thread.Content mounted after Thread.Root", () => {
  const saved = {
    IntersectionObserver: globalThis.IntersectionObserver,
    ResizeObserver: globalThis.ResizeObserver,
  };

  beforeEach(() => {
    intersectionWatchers.length = 0;
    resizeWatchers.length = 0;
    globalThis.IntersectionObserver = createFakeObserver(
      intersectionWatchers,
    ) as unknown as typeof IntersectionObserver;
    globalThis.ResizeObserver = createFakeObserver(
      resizeWatchers,
    ) as unknown as typeof ResizeObserver;
    // happy-dom has no document timeline; the follow names frames by it.
    Object.defineProperty(document, "timeline", { value: { currentTime: 0 }, configurable: true });
  });

  afterEach(() => {
    Object.assign(globalThis, saved);
    Reflect.deleteProperty(document, "timeline");
  });

  test("lands the first turn at the end, instantly", () => {
    const { scrolls, showTurns } = renderChat({ turns: [] });

    showTurns(["Hello"]);

    expect(scrolls).toEqual([{ top: SCROLL_HEIGHT, behavior: "instant" }]);
  });

  test("follows the stream past the resize its land caused", () => {
    const { scrolls, part, showTurns } = renderChat({ turns: [] });
    showTurns(["Hello"]);
    const content = part("[data-thread-content]");
    resize(content);
    scrolls.length = 0;

    resize(content);

    expect(scrolls).toEqual([{ top: SCROLL_HEIGHT, behavior: "smooth" }]);
  });

  test("tracks the edges", () => {
    const { root, part, showTurns } = renderChat({ turns: [] });
    showTurns(["Hello"]);

    reportInView(part("[data-thread-top]"));
    reportInView(part("[data-thread-bottom]"));

    expect(root.hasAttribute("data-at-top")).toBe(true);
    expect(root.hasAttribute("data-at-bottom")).toBe(true);
  });

  test("picks up a Content remounted for a new chat", () => {
    const { root, scrolls, part, showTurns } = renderChat({ turns: ["Hello"] });
    showTurns([]);
    scrolls.length = 0;

    showTurns(["New chat"]);
    reportInView(part("[data-thread-bottom]"));

    expect(scrolls).toEqual([{ top: SCROLL_HEIGHT, behavior: "instant" }]);
    expect(root.hasAttribute("data-at-bottom")).toBe(true);
  });

  test("lets a drag away from the bottom release a chat swapped in by key", async () => {
    const Keyed = ({ chat }: { chat: string }) => (
      <Thread.Root>
        <Thread.Viewport>
          <Thread.Content key={chat}>
            <p>{chat}</p>
          </Thread.Content>
        </Thread.Viewport>
      </Thread.Root>
    );
    const { container, rerender } = render(<Keyed chat="First" />);
    const root = container.querySelector("[data-thread-root]") as HTMLElement;
    const scroller = container.querySelector("[data-thread-scroller]") as HTMLElement;
    scroller.scrollTo = () => {};
    rerender(<Keyed chat="Second" />);
    const bottom = container.querySelector("[data-thread-bottom]") as HTMLElement;
    reportInView(bottom);
    expect(root.hasAttribute("data-at-bottom")).toBe(true);

    await act(() => new Promise((resolve) => setTimeout(resolve, AUTO_SCROLL_SETTLE_MS)));
    reportOutOfView(bottom);

    expect(root.hasAttribute("data-at-bottom")).toBe(false);
  });

  describe("with preserveScrollOnPrepend", () => {
    const VIEWPORT_TOP = 0;
    const TURN_HEIGHT = 40;
    const READING_TOP = 100;
    const PUSHED_DOWN = 200;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const rowTops = new Map<string, number>();

    beforeEach(() => {
      rowTops.clear();
      HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
        const top = rowTops.get(this.dataset.turn ?? "") ?? VIEWPORT_TOP;
        return { top, bottom: top + TURN_HEIGHT, height: TURN_HEIGHT } as DOMRect;
      };
    });
    afterEach(() => {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    });

    test("holds the reading position when older turns load in above", async () => {
      const { scroller, showTurns } = renderChat({
        turns: [],
        autoScroll: "off",
        preserveScrollOnPrepend: true,
      });
      rowTops.set("Newer", READING_TOP);
      showTurns(["Newer"]);

      rowTops.set("Older", READING_TOP).set("Newer", READING_TOP + PUSHED_DOWN);
      await act(async () => showTurns(["Older", "Newer"]));

      expect(scroller.scrollTop).toBe(PUSHED_DOWN);
    });
  });
});
