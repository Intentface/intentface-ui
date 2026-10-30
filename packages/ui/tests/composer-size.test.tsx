import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { Activity, Profiler, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { Composer, useComposerStore } from "../src/composer";
import type { ComposerSize } from "../src/composer/store";

// happy-dom lays nothing out (offset* read 0) and ships a no-op ResizeObserver,
// so the layout and the observer are faked here. The component under test only
// sees what a browser would give it: offset sizes and a callback to run.

type Box = { width: number; height: number };

const sizes: { root: Box; container: Box } = {
  root: { width: 600, height: 80 },
  container: { width: 560, height: 56 },
};

const originalObserver = globalThis.ResizeObserver;
const originalOffsets = {
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
};

const observers = new Set<FakeResizeObserver>();

class FakeResizeObserver {
  constructor(private readonly callback: () => void) {
    observers.add(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observers.delete(this);
  }
  fire() {
    this.callback();
  }
}

const boxOf = (element: HTMLElement): Box => {
  if (element.hasAttribute("data-composer-root")) return sizes.root;
  if (element.hasAttribute("data-composer-container")) return sizes.container;
  return { width: 0, height: 0 };
};

// What the browser does after layout changes: tell every observer.
const resize = (next: { root?: Box; container?: Box }) => {
  Object.assign(sizes, next);
  act(() => {
    for (const observer of observers) observer.fire();
  });
};

beforeEach(() => {
  sizes.root = { width: 600, height: 80 };
  sizes.container = { width: 560, height: 56 };
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: FakeResizeObserver,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    get(this: HTMLElement) {
      return boxOf(this).width;
    },
    configurable: true,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    get(this: HTMLElement) {
      return boxOf(this).height;
    },
    configurable: true,
  });
});

afterEach(() => {
  observers.clear();
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: originalObserver,
    configurable: true,
    writable: true,
  });
  for (const [name, descriptor] of Object.entries(originalOffsets)) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, name);
  }
});

const rootElement = () => {
  const element = document.querySelector<HTMLElement>("[data-composer-root]");
  if (!element) throw new Error("no Composer.Root rendered");
  return element;
};

const property = (name: string) => rootElement().style.getPropertyValue(name);

// Counts its own renders, outside any composer tree.
const SizeProbe = ({
  store,
  renders,
}: {
  store: ReturnType<typeof Composer.createStore>;
  renders?: { count: number };
}) => {
  const height = useComposerStore(store, (composer) => composer.size?.height ?? null);
  if (renders) renders.count += 1;
  return <output data-probe="">{height === null ? "none" : height}</output>;
};

const probeText = () => document.querySelector("[data-probe]")?.textContent;

describe("the size slice of the store", () => {
  test("setSize publishes a new value once and ignores the same one", () => {
    const store = Composer.createStore();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    const size: ComposerSize = { width: 600, height: 80, container: null };

    store.setSize(size);
    expect(notifications).toBe(1);
    expect(store.getSnapshot().size).toEqual({ width: 600, height: 80, container: null });

    store.setSize(size);
    expect(notifications).toBe(1);
  });

  test("the content snapshot keeps its identity through a size change", () => {
    const store = Composer.createStore();
    const before = store.getContentSnapshot();

    store.setSize({ width: 600, height: 80, container: null });
    expect(store.getContentSnapshot()).toBe(before);

    store.setHasContent(true);
    expect(store.getContentSnapshot()).not.toBe(before);
  });

  test("the full snapshot keeps its identity between notifications", () => {
    const store = Composer.createStore();
    store.setSize({ width: 600, height: 80, container: null });
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);

    store.setHasContent(true);
    expect(store.getSnapshot()).not.toBe(before);
  });

  test("starts null, and reset leaves the tracker's value alone", () => {
    const store = Composer.createStore();
    expect(store.getSnapshot().size).toBeNull();

    store.setSize({ width: 600, height: 80, container: null });
    store.reset();
    expect(store.getSnapshot().size).toEqual({ width: 600, height: 80, container: null });
  });
});

describe("the measured size on a mounted composer", () => {
  test("Root and Container publish all four properties", () => {
    render(
      <Composer.Root>
        <Composer.Container />
      </Composer.Root>,
    );
    expect(property("--composer-width")).toBe("600px");
    expect(property("--composer-height")).toBe("80px");
    expect(property("--composer-container-width")).toBe("560px");
    expect(property("--composer-container-height")).toBe("56px");
  });

  test("a reader outside the tree follows a resize through the store", () => {
    const store = Composer.createStore();
    render(
      <>
        <Composer.Root store={store}>
          <Composer.Container />
        </Composer.Root>
        <SizeProbe store={store} />
      </>,
    );
    expect(probeText()).toBe("80");

    resize({ root: { width: 600, height: 128 } });
    expect(probeText()).toBe("128");
    expect(property("--composer-height")).toBe("128px");
  });

  test("a resize re-renders nothing inside the composer", () => {
    const store = Composer.createStore();
    const probe = { count: 0 };
    let commits = 0;
    render(
      <>
        <Profiler
          id="composer"
          onRender={() => {
            commits += 1;
          }}
        >
          <Composer.Root store={store}>
            <Composer.Panel anchor={false}>
              {(composer) => (composer.commands.active ? <p>commands</p> : null)}
            </Composer.Panel>
            <Composer.Popover>
              {(composer) => (composer.commands.active ? <p>popover</p> : null)}
            </Composer.Popover>
            <Composer.Container>
              <Composer.Textarea aria-label="Message" />
            </Composer.Container>
          </Composer.Root>
        </Profiler>
        <SizeProbe store={store} renders={probe} />
      </>,
    );
    const commitsAfterMount = commits;
    const probeRendersAfterMount = probe.count;

    resize({ root: { width: 600, height: 128 }, container: { width: 560, height: 104 } });

    expect(commits).toBe(commitsAfterMount);
    expect(probe.count).toBe(probeRendersAfterMount + 1);
    expect(property("--composer-container-height")).toBe("104px");

    // Positive control: the Profiler does see a composer re-render.
    act(() => store.setCommands({ active: true, trigger: "/", query: "" }));
    expect(commits).toBeGreaterThan(commitsAfterMount);
  });

  test("a resize to the same numbers renders nothing and rewrites nothing", () => {
    const store = Composer.createStore();
    const probe = { count: 0 };
    render(
      <>
        <Composer.Root store={store}>
          <Composer.Container />
        </Composer.Root>
        <SizeProbe store={store} renders={probe} />
      </>,
    );
    const rendersAfterMount = probe.count;
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    const writes: string[] = [];
    const { setProperty } = rootElement().style;
    rootElement().style.setProperty = (name, value) => {
      writes.push(name);
      return setProperty.call(rootElement().style, name, value);
    };

    resize({});

    expect(notifications).toBe(0);
    expect(probe.count).toBe(rendersAfterMount);
    expect(writes).toEqual([]);
    expect(property("--composer-height")).toBe("80px");
  });

  test("a Container mounted after the Root adds its pair, and unmounting removes it", () => {
    const store = Composer.createStore();
    const tree = (withContainer: boolean) => (
      <Composer.Root store={store}>{withContainer && <Composer.Container />}</Composer.Root>
    );
    const { rerender } = render(tree(false));
    expect(property("--composer-container-height")).toBe("");
    expect(property("--composer-container-width")).toBe("");
    expect(store.getSnapshot().size?.container).toBeNull();

    rerender(tree(true));
    expect(property("--composer-container-height")).toBe("56px");
    expect(property("--composer-container-width")).toBe("560px");
    expect(store.getSnapshot().size?.container).toEqual({ width: 560, height: 56 });

    rerender(tree(false));
    expect(property("--composer-container-height")).toBe("");
    expect(property("--composer-container-width")).toBe("");
    expect(store.getSnapshot().size?.container).toBeNull();
    expect(property("--composer-height")).toBe("80px");
    expect(property("--composer-width")).toBe("600px");
  });

  test("an explicit store reads null once its Root unmounts", () => {
    const store = Composer.createStore();
    const { unmount } = render(<Composer.Root store={store} />);
    expect(store.getSnapshot().size).toEqual({ width: 600, height: 80, container: null });

    unmount();
    expect(store.getSnapshot().size).toBeNull();
  });

  test("ends measured under StrictMode", () => {
    const store = Composer.createStore();
    render(
      <StrictMode>
        <Composer.Root store={store}>
          <Composer.Container />
        </Composer.Root>
      </StrictMode>,
    );
    expect(store.getSnapshot().size).toEqual({
      width: 600,
      height: 80,
      container: { width: 560, height: 56 },
    });
    expect(property("--composer-height")).toBe("80px");
    expect(property("--composer-container-height")).toBe("56px");
  });

  test("a composer hidden with <Activity> drops its properties and gets them back", () => {
    const store = Composer.createStore();
    const tree = (visible: boolean) => (
      <Activity mode={visible ? "visible" : "hidden"}>
        <Composer.Root store={store} />
      </Activity>
    );
    const { rerender } = render(tree(true));
    rerender(tree(false));
    expect(property("--composer-height")).toBe("");
    expect(store.getSnapshot().size).toBeNull();

    rerender(tree(true));
    expect(property("--composer-height")).toBe("80px");
    expect(store.getSnapshot().size).toEqual({ width: 600, height: 80, container: null });
  });

  test("a changed style prop keeps the properties", () => {
    const { rerender } = render(<Composer.Root style={{ color: "red" }} />);
    rerender(<Composer.Root style={{ color: "blue" }} />);
    expect(rootElement().style.color).toBe("blue");
    expect(property("--composer-height")).toBe("80px");
    expect(property("--composer-width")).toBe("600px");
  });
});

describe("the server render", () => {
  test("carries no size properties", () => {
    const html = renderToString(
      <Composer.Root>
        <Composer.Container />
      </Composer.Root>,
    );
    expect(html).toContain("data-composer-root");
    expect(html).not.toContain("--composer-");
  });
});

describe("the Panel callback state", () => {
  test("has no size, in the type and at runtime", () => {
    let received: string[] = [];
    render(
      <Composer.Root>
        <Composer.Panel anchor={false}>
          {(composer) => {
            // @ts-expect-error size is read through useComposer, not the callback
            composer.size;
            received = Object.keys(composer);
            return null;
          }}
        </Composer.Panel>
      </Composer.Root>,
    );
    expect(received).toContain("commands");
    expect(received).not.toContain("size");
  });
});
