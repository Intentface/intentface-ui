import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import axe from "axe-core";
import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { Nav } from "../../src/nav";

/** Noise from auditing a fragment rather than a document. Nothing is excused here. */
const PAGE_LEVEL_RULES: axe.RuleObject = {
  region: { enabled: false },
  "page-has-heading-one": { enabled: false },
  "landmark-one-main": { enabled: false },
};

const SUPPRESSED: axe.RuleObject = {
  ...PAGE_LEVEL_RULES,
  /**
   * The same deliberate trade `Tabs` makes, and the second and last place in
   * the package it applies.
   *
   * A row is a `div[role="button"]` with its action nested inside, so the whole
   * row is a click target — the shape Linear ships, and what lets a row be
   * swapped for a link through `render`. `role="button"` is
   * children-presentational in ARIA, so a focusable descendant is a violation.
   *
   * The test below pins the violation to exactly the rows that hold an action,
   * so a future change cannot quietly widen it.
   */
  "nested-interactive": { enabled: false },
};

const audit = async (container: HTMLElement, rules = SUPPRESSED) => {
  const results = await axe.run(container, { rules });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
};

const Tree = ({ expanded = ["workspace"] }: { expanded?: string[] }) => (
  <Nav.Root aria-label="Main" defaultExpanded={expanded} render={<nav />}>
    <Nav.List>
      <Nav.Item value="inbox">
        <Nav.Icon>
          <svg aria-hidden height="12" width="12">
            <title>decorative</title>
          </svg>
        </Nav.Icon>
        <Nav.Label>Inbox</Nav.Label>
      </Nav.Item>

      <Nav.Group value="workspace">
        <Nav.Trigger>
          <Nav.Label>Workspace</Nav.Label>
        </Nav.Trigger>
        <Nav.List guide="branches">
          <Nav.Item value="projects">
            <Nav.Label>Projects</Nav.Label>
          </Nav.Item>
        </Nav.List>
      </Nav.Group>
    </Nav.List>
  </Nav.Root>
);

describe("Nav accessibility", () => {
  test("a tree with no nested actions raises nothing at all", async () => {
    const { container } = render(<Tree />);
    // Note the rule set: `nested-interactive` is live for this shape, and
    // still finds nothing. The suppression is not a blanket over the primitive.
    expect(await audit(container, PAGE_LEVEL_RULES)).toEqual([]);
  });

  test("a collapsed tree raises nothing", async () => {
    const { container } = render(<Tree expanded={[]} />);
    expect(await audit(container)).toEqual([]);
  });

  test("a group says whether it is open, and what it controls", () => {
    const { getByRole } = render(<Tree />);
    const trigger = getByRole("button", { name: "Workspace" });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const controls = trigger.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)).toBeTruthy();
  });

  test("a row is reachable by its label", () => {
    const { getByRole } = render(<Tree />);
    expect(getByRole("button", { name: "Inbox" })).toBeTruthy();
    expect(getByRole("button", { name: "Projects" })).toBeTruthy();
  });

  test("the icon stays out of the row's accessible name", () => {
    const { getByRole } = render(<Tree />);
    expect(getByRole("button", { name: "Inbox" })).toBeTruthy();
  });

  test("nested-interactive is the only suppression, and only where an action sits", async () => {
    const WithActions = () => (
      <Nav.Root aria-label="Main" defaultExpanded={["workspace"]} render={<nav />}>
        <Nav.List>
          <Nav.Item value="inbox">
            <Nav.Label>Inbox</Nav.Label>
            <Nav.Action aria-label="Inbox options" />
          </Nav.Item>
          <Nav.Group value="workspace">
            <Nav.Trigger>
              <Nav.Label>Workspace</Nav.Label>
              <Nav.Action aria-label="Workspace options" />
            </Nav.Trigger>
            <Nav.List>
              <Nav.Item value="projects">
                <Nav.Label>Projects</Nav.Label>
              </Nav.Item>
            </Nav.List>
          </Nav.Group>
        </Nav.List>
      </Nav.Root>
    );

    const { container } = render(<WithActions />);
    const results = await axe.run(container, { rules: PAGE_LEVEL_RULES });

    expect(results.violations.map((violation) => violation.id)).toEqual(["nested-interactive"]);

    // One per row holding an action, and nothing else. The row without one —
    // Projects — must not appear here.
    const nodes = results.violations.flatMap((violation) => violation.nodes);
    expect(nodes).toHaveLength(2);
    for (const node of nodes) {
      expect(node.html).toMatch(/data-nav-(item|trigger)/);
    }
  });

  test("a toggle on a page row is a named disclosure, with nested-interactive its only finding", async () => {
    // Like an action, the toggle is a real button inside the row, so it shares
    // the one suppressed rule and nothing else.
    const { container, getByRole } = render(
      <Nav.Root aria-label="Main" defaultExpanded={["guides"]} render={<nav />}>
        <Nav.List>
          <Nav.Group value="guides">
            <Nav.Trigger active>
              <Nav.Toggle aria-label="More Guides pages" />
              <Nav.Label>Guides</Nav.Label>
            </Nav.Trigger>
            <Nav.List>
              <Nav.Item value="install">
                <Nav.Label>Install</Nav.Label>
              </Nav.Item>
            </Nav.List>
          </Nav.Group>
        </Nav.List>
      </Nav.Root>,
    );

    expect(await audit(container)).toEqual([]);
    const results = await axe.run(container, { rules: PAGE_LEVEL_RULES });
    expect(results.violations.map((violation) => violation.id)).toEqual(["nested-interactive"]);
    expect(getByRole("button", { name: "More Guides pages", expanded: true })).toBeTruthy();
    expect(getByRole("button", { name: "Guides", current: "page" })).toBeTruthy();
  });

  test("an action is reachable by name, not just by pointer", () => {
    const { getByRole } = render(
      <Nav.Root>
        <Nav.List>
          <Nav.Item value="inbox">
            <Nav.Label>Inbox</Nav.Label>
            <Nav.Action aria-label="Inbox options" />
          </Nav.Item>
        </Nav.List>
      </Nav.Root>,
    );
    expect(getByRole("button", { name: "Inbox options" })).toBeTruthy();
  });

  test("disabled rows say so and leave the tab order", () => {
    const { getByRole } = render(
      <Nav.Root disabled>
        <Nav.List>
          <Nav.Item value="inbox">
            <Nav.Label>Inbox</Nav.Label>
          </Nav.Item>
        </Nav.List>
      </Nav.Root>,
    );

    const row = getByRole("button", { name: "Inbox" });
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.getAttribute("tabindex")).toBe("-1");
  });
});

const Link = (props: ComponentProps<"a">) => <a {...props} />;
const ToLink = ({ to, ...props }: ComponentProps<"a"> & { to: string }) => (
  <a href={to} {...props} />
);

describe("rows rendered as links", () => {
  test("are announced as links, whichever way render gives the anchor", () => {
    const { getByRole } = render(
      <Nav.Root aria-label="Main" defaultExpanded={["guides"]} render={<nav />}>
        <Nav.List>
          <Nav.Item value="home" active render={<Link href="/" />}>
            <Nav.Label>Home</Nav.Label>
          </Nav.Item>
          <Nav.Item value="inbox" render={(props) => <a href="/inbox" {...props} />}>
            <Nav.Label>Inbox</Nav.Label>
          </Nav.Item>
          <Nav.Item value="settings" render={<ToLink to="/settings" />}>
            <Nav.Label>Settings</Nav.Label>
          </Nav.Item>
          <Nav.Group value="guides">
            <Nav.Trigger render={<Link href="/guides" />}>
              <Nav.Toggle aria-label="More Guides pages" />
              <Nav.Label>Guides</Nav.Label>
            </Nav.Trigger>
            <Nav.List>
              <Nav.Item value="install">
                <Nav.Label>Install</Nav.Label>
              </Nav.Item>
            </Nav.List>
          </Nav.Group>
        </Nav.List>
      </Nav.Root>,
    );

    expect(getByRole("link", { name: "Home", current: "page" })).toBeTruthy();
    expect(getByRole("link", { name: "Inbox" })).toBeTruthy();
    expect(getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(getByRole("link", { name: /Guides$/ })).toBeTruthy();
    expect(getByRole("button", { name: "Install" })).toBeTruthy();
  });

  test("an action rendered as a link is a link too", () => {
    const { getByRole } = render(
      <Nav.Root>
        <Nav.List>
          <Nav.Item value="report">
            <Nav.Label>Report</Nav.Label>
            <Nav.Action aria-label="Open Report in a new tab" render={<Link href="/report" />} />
          </Nav.Item>
        </Nav.List>
      </Nav.Root>,
    );
    expect(getByRole("link", { name: "Open Report in a new tab" })).toBeTruthy();
  });

  test("the server render is already a link, before any script runs", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(
      <Nav.Root>
        <Nav.List>
          <Nav.Item value="home" active render={<Link href="/" />}>
            <Nav.Label>Home</Nav.Label>
          </Nav.Item>
          <Nav.Item value="inbox" render={(props) => <a href="/inbox" {...props} />}>
            <Nav.Label>Inbox</Nav.Label>
          </Nav.Item>
          <Nav.Item value="settings" render={<ToLink to="/settings" />}>
            <Nav.Label>Settings</Nav.Label>
          </Nav.Item>
          <Nav.Item value="install">
            <Nav.Label>Install</Nav.Label>
          </Nav.Item>
        </Nav.List>
      </Nav.Root>,
    );

    for (const value of ["home", "inbox", "settings"]) {
      const row = host.querySelector(`[data-nav-item="${value}"]`);
      expect(row?.tagName).toBe("A");
      expect(row?.hasAttribute("role")).toBe(false);
    }
    expect(host.querySelector('[data-nav-item="install"]')?.getAttribute("role")).toBe("button");
  });

  test("a row given some other element takes its role from you", () => {
    const { getByRole } = render(
      <Nav.Root>
        <Nav.List>
          <Nav.Item value="inbox" role="button" render={<span />}>
            <Nav.Label>Inbox</Nav.Label>
          </Nav.Item>
        </Nav.List>
      </Nav.Root>,
    );
    expect(getByRole("button", { name: "Inbox" }).tagName).toBe("SPAN");
  });
});
