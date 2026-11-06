import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { Thread, type ThreadAutoScrollMode } from "../src/thread";

// React commits the composer's measuring effect after the render; settle it.
const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

// happy-dom's ResizeObserver never fires, so record what each one observes and fire it by hand.
type Observation = { callback: () => void; targets: Set<Element> };
const observations: Observation[] = [];

class FakeResizeObserver {
  readonly #observation: Observation;

  constructor(callback: () => void) {
    this.#observation = { callback, targets: new Set() };
    observations.push(this.#observation);
  }

  observe(target: Element) {
    this.#observation.targets.add(target);
  }

  unobserve(target: Element) {
    this.#observation.targets.delete(target);
  }

  disconnect() {
    this.#observation.targets.clear();
  }
}

const resize = (target: Element) =>
  act(() => {
    for (const { callback, targets } of observations) if (targets.has(target)) callback();
  });

const composerVariablesOf = (root: HTMLElement) => ({
  inset: root.style.getPropertyValue("--thread-inset-bottom"),
  height: root.style.getPropertyValue("--thread-composer-height"),
  width: root.style.getPropertyValue("--thread-composer-width"),
});

const insetOf = (px: number) => `calc(${px}px + var(--thread-composer-gap, 0px))`;

describe("Thread.Composer composer variables", () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const OriginalResizeObserver = globalThis.ResizeObserver;
  let composerTop = 540;

  // Layout does not exist in happy-dom, so give the root and the composer a box.
  beforeEach(() => {
    composerTop = 540;
    observations.length = 0;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const box = { top: 0, bottom: 0, width: 0, height: 0 };
      if (this.hasAttribute("data-thread-root")) box.bottom = 600;
      if (this.hasAttribute("data-thread-composer")) {
        Object.assign(box, { top: composerTop, width: 640.4, height: 60.2 });
      }
      return box as DOMRect;
    };
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    globalThis.ResizeObserver = OriginalResizeObserver;
  });

  const WithComposer = ({ composerKey }: { composerKey: string | null }) => (
    <Thread.Root>
      <Thread.Viewport>
        <Thread.Content />
      </Thread.Viewport>
      {composerKey !== null && <Thread.Composer key={composerKey} data-testid="composer" />}
    </Thread.Root>
  );

  test("publishes the room it takes, plus the consumer's gap, and its own box", () => {
    const { container } = render(<WithComposer composerKey="a" />);
    const root = container.querySelector("[data-thread-root]") as HTMLElement;

    // 600 - 540, the room between the composer's top and the root's bottom
    expect(composerVariablesOf(root)).toEqual({
      inset: insetOf(60),
      height: "60px",
      width: "640px",
    });
  });

  test("leaves its position to the consumer", () => {
    const { getByTestId } = render(<WithComposer composerKey="a" />);

    expect((getByTestId("composer") as HTMLElement).style.position).toBe("");
  });

  test("writes no composer variable while there is no composer", () => {
    const { container } = render(<WithComposer composerKey={null} />);
    const root = container.querySelector("[data-thread-root]") as HTMLElement;

    expect(composerVariablesOf(root)).toEqual({ inset: "", height: "", width: "" });
  });

  test("publishes all three once a composer mounts after the root", async () => {
    const { container, rerender } = render(<WithComposer composerKey={null} />);
    const root = container.querySelector("[data-thread-root]") as HTMLElement;

    rerender(<WithComposer composerKey="a" />);
    await flush();

    expect(composerVariablesOf(root)).toEqual({
      inset: insetOf(60),
      height: "60px",
      width: "640px",
    });
  });

  test("clears them when the composer unmounts", async () => {
    const { container, rerender } = render(<WithComposer composerKey="a" />);
    const root = container.querySelector("[data-thread-root]") as HTMLElement;

    rerender(<WithComposer composerKey={null} />);
    await flush();

    expect(composerVariablesOf(root)).toEqual({ inset: "", height: "", width: "" });
  });

  test("follows a composer remounted under a new key", async () => {
    const { container, getByTestId, rerender } = render(<WithComposer composerKey="a" />);
    const root = container.querySelector("[data-thread-root]") as HTMLElement;
    rerender(<WithComposer composerKey="b" />);
    await flush();

    composerTop = 500;
    await resize(getByTestId("composer"));

    expect(root.style.getPropertyValue("--thread-inset-bottom")).toBe(insetOf(100));
  });
});

describe("Thread.Root turn min-height", () => {
  // happy-dom drops 100cqh values, so read the published variable off the server markup.
  const publishedIn = (mode: ThreadAutoScrollMode) =>
    renderToString(
      <Thread.Root autoScroll={mode}>
        <Thread.Viewport>
          <Thread.Content />
        </Thread.Viewport>
      </Thread.Root>,
    );

  for (const mode of ["follow", "jump"] as const) {
    test(`"${mode}" publishes the viewport minus the top inset and the bottom inset`, () => {
      expect(publishedIn(mode)).toContain(
        "--thread-turn-min-height:calc(100cqh - var(--thread-inset-top, 0px) - var(--thread-inset-bottom, 0px) - 1px)",
      );
    });
  }

  for (const mode of ["bottom", "off"] as const) {
    test(`"${mode}" publishes 0px`, () => {
      expect(publishedIn(mode)).toContain("--thread-turn-min-height:0px");
    });
  }
});

describe("Thread.Content", () => {
  test("applies no layout of its own", () => {
    const { container } = render(
      <Thread.Root autoScroll="follow">
        <Thread.Viewport>
          <Thread.Content>
            <div>a</div>
          </Thread.Content>
        </Thread.Viewport>
      </Thread.Root>,
    );
    const content = container.querySelector("[data-thread-content]") as HTMLElement;

    expect(content.getAttribute("style")).toBeNull();
    expect((content.lastElementChild as HTMLElement).getAttribute("style")).toBeNull();
  });
});
