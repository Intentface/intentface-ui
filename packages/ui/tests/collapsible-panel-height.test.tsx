import { describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Steps } from "../src/steps";

// The panel measures its natural height for the open transition, then must RELEASE that
// measurement once the transition settles. Holding it pinned the panel to its open-time
// height for its whole open life, so anything that grew inside afterwards — a nested
// disclosure, streaming rows — was clipped.

const settle = () =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });

// happy-dom's getComputedStyle does not inherit custom properties, and inheritance is what the
// nested case breaks on, so walk the ancestors.
const heightFromPanelVar = (element: HTMLElement) => {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const value = node.style.getPropertyValue("--panel-height");
    if (value) return value === "initial" ? "auto" : value;
  }
  return "auto";
};

describe("collapsible panel height", () => {
  test("publishes --panel-height while opening, then releases it once settled", async () => {
    const { container } = render(
      <Steps.Root>
        <Steps.Item>
          <Steps.Trigger>Step</Steps.Trigger>
          <Steps.Panel>Details</Steps.Panel>
        </Steps.Item>
      </Steps.Root>,
    );

    act(() => {
      screen.getByRole("button", { name: "Step" }).click();
    });

    const panel = container.querySelector("[data-steps-panel]") as HTMLElement;
    expect(panel).not.toBeNull();
    // Measured on the starting frame, so the consumer's height transition has a number.
    expect(heightFromPanelVar(panel)).toMatch(/px$/);

    await settle();

    expect(heightFromPanelVar(panel)).toBe("auto");
    cleanup();
  });

  test("an initially-open panel never pins a height", async () => {
    const { container } = render(
      <Steps.Root>
        <Steps.Item defaultOpen>
          <Steps.Trigger>Step</Steps.Trigger>
          <Steps.Panel>Details</Steps.Panel>
        </Steps.Item>
      </Steps.Root>,
    );
    await settle();

    const panel = container.querySelector("[data-steps-panel]") as HTMLElement;
    expect(panel).not.toBeNull();
    // No entry transition on mount, so there is nothing to measure and nothing to pin.
    expect(heightFromPanelVar(panel)).toBe("auto");
    cleanup();
  });

  test("a settled nested panel does not inherit an opening ancestor's height", () => {
    render(
      <Steps.Root>
        <Steps.Item>
          <Steps.Trigger>Outer</Steps.Trigger>
          <Steps.Panel data-testid="outer">
            <Steps.Item defaultOpen>
              <Steps.Trigger>Inner</Steps.Trigger>
              <Steps.Panel data-testid="inner">Details</Steps.Panel>
            </Steps.Item>
          </Steps.Panel>
        </Steps.Item>
      </Steps.Root>,
    );

    act(() => {
      screen.getByRole("button", { name: "Outer" }).click();
    });

    const outer = screen.getByTestId("outer");
    const inner = screen.getByTestId("inner");
    expect(outer.hasAttribute("data-starting-style")).toBe(true);
    expect(inner.hasAttribute("data-starting-style")).toBe(false);
    expect(heightFromPanelVar(outer)).toMatch(/px$/);
    expect(heightFromPanelVar(inner)).toBe("auto");
    cleanup();
  });
});
