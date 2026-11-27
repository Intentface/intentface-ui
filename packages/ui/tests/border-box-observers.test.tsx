import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render } from "@testing-library/react";
import { Nav } from "../src/nav";
import { Shell } from "../src/shell";
import { Thread } from "../src/thread";

// These parts publish a border-box measurement (offset*, a bounding rect, a
// parent's scroll size), so a padding or border change alone has to reach them.
// happy-dom lays nothing out and its ResizeObserver never fires, so the layout
// and the observer are faked: the fake remembers the box each target is watched
// with, as a browser does.

type Box = { width: number; height: number };

const boxes = new Map<string, Box>();
const boxOf = (element: Element): Box => {
  for (const [selector, box] of boxes) if (element.matches(selector)) return box;
  return { width: 0, height: 0 };
};

const observers = new Set<FakeResizeObserver>();

class FakeResizeObserver {
  readonly targets = new Map<Element, ResizeObserverBoxOptions>();
  constructor(readonly callback: () => void) {
    observers.add(this);
  }
  observe(element: Element, options?: ResizeObserverOptions) {
    this.targets.set(element, options?.box ?? "content-box");
  }
  unobserve(element: Element) {
    this.targets.delete(element);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
}

// Padding or a border changed on the target and its content box didn't: the
// browser tells only the observers watching that target's border box.
const resizeBorderBox = (target: Element) =>
  act(() => {
    for (const observer of [...observers]) {
      if (observer.targets.get(target) === "border-box") observer.callback();
    }
  });

const LAYOUT_PROPERTIES = {
  offsetWidth: (element: HTMLElement) => boxOf(element).width,
  offsetHeight: (element: HTMLElement) => boxOf(element).height,
  scrollWidth: (element: HTMLElement) => boxOf(element).width,
  scrollHeight: (element: HTMLElement) => boxOf(element).height,
};
type LayoutProperty = keyof typeof LAYOUT_PROPERTIES;
const layoutProperties = Object.keys(LAYOUT_PROPERTIES) as LayoutProperty[];

const originalObserver = globalThis.ResizeObserver;
// As an own property of HTMLElement, restored by descriptor: it wins over a
// copy another file left there, and removing it afterwards leaves no copy to
// shadow a fake the next file puts on Element.
const originalRect = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getBoundingClientRect",
);
const originalProperties = layoutProperties.map(
  (name) => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const,
);

describe("a padding or border change alone", () => {
  beforeEach(() => {
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    for (const name of layoutProperties) {
      Object.defineProperty(HTMLElement.prototype, name, {
        get(this: HTMLElement) {
          return LAYOUT_PROPERTIES[name](this);
        },
        configurable: true,
      });
    }
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      value(this: HTMLElement) {
        const { width, height } = boxOf(this);
        return { top: 0, bottom: height, left: 0, right: width, width, height } as DOMRect;
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    boxes.clear();
    observers.clear();
    globalThis.ResizeObserver = originalObserver;
    if (originalRect) {
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", originalRect);
    } else Reflect.deleteProperty(HTMLElement.prototype, "getBoundingClientRect");
    for (const [name, descriptor] of originalProperties) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    }
  });

  test("updates the width Shell.Sidebar reports", () => {
    boxes.set("[data-shell-sidebar]", { width: 280, height: 800 });
    const widths: number[] = [];
    const { getByTestId } = render(
      <Shell.Root>
        <Shell.Sidebar data-testid="sidebar" onResize={(width) => void widths.push(width)}>
          <Shell.Grip aria-label="Resize sidebar" data-testid="grip" />
        </Shell.Sidebar>
        <Shell.Viewport />
      </Shell.Root>,
    );
    expect(getByTestId("grip").getAttribute("aria-valuenow")).toBe("280");

    boxes.set("[data-shell-sidebar]", { width: 304, height: 800 });
    resizeBorderBox(getByTestId("sidebar"));

    expect(getByTestId("grip").getAttribute("aria-valuenow")).toBe("304");
    expect(widths.at(-1)).toBe(304);
  });

  test("updates the size Nav.List pins for its transition", () => {
    boxes.set("[data-testid=list]", { width: 240, height: 32 });
    const { getByTestId } = render(
      <Nav.Root>
        <Nav.List>
          <Nav.Group value="workspace">
            <Nav.Trigger data-testid="trigger">
              <Nav.Label>Workspace</Nav.Label>
            </Nav.Trigger>
            <Nav.List data-testid="list">
              <Nav.Item value="projects" data-testid="row">
                <Nav.Label>Projects</Nav.Label>
              </Nav.Item>
            </Nav.List>
          </Nav.Group>
        </Nav.List>
      </Nav.Root>,
    );

    // Opening pins the list to its measured size until the transition settles.
    act(() => void fireEvent.click(getByTestId("trigger")));
    const list = getByTestId("list");
    expect(list.style.getPropertyValue("--nav-list-height")).toBe("32px");

    boxes.set("[data-testid=list]", { width: 240, height: 44 });
    resizeBorderBox(getByTestId("row"));

    expect(list.style.getPropertyValue("--nav-list-height")).toBe("44px");
  });

  test("updates the variables Thread.Composer publishes", () => {
    boxes.set("[data-thread-root]", { width: 640, height: 600 });
    boxes.set("[data-thread-composer]", { width: 640, height: 60 });
    const { container, getByTestId } = render(
      <Thread.Root>
        <Thread.Viewport>
          <Thread.Content />
        </Thread.Viewport>
        <Thread.Composer data-testid="composer" />
      </Thread.Root>,
    );
    const root = container.querySelector("[data-thread-root]") as HTMLElement;
    expect(root.style.getPropertyValue("--thread-composer-height")).toBe("60px");

    boxes.set("[data-thread-composer]", { width: 640, height: 82 });
    resizeBorderBox(getByTestId("composer"));

    expect(root.style.getPropertyValue("--thread-composer-height")).toBe("82px");
  });
});
