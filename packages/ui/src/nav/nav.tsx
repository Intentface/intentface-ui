"use client";

import type { CSSProperties, RefObject } from "react";
import {
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  use,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIsomorphicLayoutEffect } from "../internal/iso-layout-effect";
import type { PrimitiveProps } from "../internal/primitive-props";
import type { StateAttributesMapping } from "../internal/render/getStateAttributesProps";
import {
  type TransitionStatus,
  useAnimationsFinished,
  useTransitionStatus,
} from "../internal/render/transition";
import { useRenderElement } from "../internal/render/useRenderElement";
import { openStateMapping, transitionStatusMapping } from "../internal/state-mappings";
import type { NavStore } from "./store";
import { createNavStore, NavStoreContext, useNavContextStore, useNavStore } from "./store";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** The depth of the current list. Root provides 0; each list provides its own + 1. */
const NavDepthContext = createContext(0);

type NavGroupContextValue = {
  value: string;
  open: boolean;
  listId: string;
  disabled: boolean;
  /** The group's element. A collapse is usually animated here rather than on
   *  the list — a wrapper can size a track, and a list holding N rows cannot
   *  animate its own — so this is what the exit has to wait for. */
  elementRef: RefObject<HTMLElement | null>;
};

/** The nearest enclosing group. Null at the top level, which is what `nested` means. */
const NavGroupContext = createContext<NavGroupContextValue | null>(null);

/**
 * What a list draws down its left edge, as a ladder rather than three flags.
 *
 * Each rung implies the one before it — a rail lives in the indent lane, an
 * elbow needs a rail to turn off — so they were never independent, and
 * expressing them as booleans meant guarding against combinations that mean
 * nothing.
 */
export type NavGuide = "none" | "indent" | "rail" | "branches";

type NavRovingContextValue = {
  highlighted: string | null;
  setHighlighted: (value: string | null) => void;
  disabled: boolean;
  /** The Root's default, for every list that does not state its own. */
  guide: NavGuide;
};

const NavRovingContext = createContext<NavRovingContextValue | null>(null);

const useRoving = () => {
  const roving = use(NavRovingContext);
  if (!roving) throw new Error("Nav parts must be used within <Nav.Root>");
  return roving;
};

// ---------------------------------------------------------------------------
// State published as attributes
// ---------------------------------------------------------------------------

export type NavPartState = {
  /** How deeply nested this part's list is. 0 is the top level. */
  depth: number;
  nested: boolean;
};

export type NavListState = NavPartState & {
  guide: NavGuide;
  /** Always true for a top-level list — only a group's list collapses. */
  open: boolean;
  transitionStatus: TransitionStatus;
};

export type NavItemState = NavPartState & { active: boolean; disabled: boolean };
export type NavGroupState = NavPartState & { open: boolean };
export type NavTriggerState = NavGroupState & { active: boolean; disabled: boolean };

/*
 * `depth: 0` and `open: false` are both falsy, and the default derivation drops
 * falsy values — which would silently delete the attribute for the top level
 * and for every closed group, the two cases most worth styling.
 */
const DEPTH_ATTRIBUTES = {
  depth: (value: number) => ({ "data-depth": String(value) }),
} satisfies StateAttributesMapping<NavPartState>;

/*
 * One rung of state, three attributes — cumulative, because the rungs are.
 * A stylesheet asking for `[data-rail]` gets branches too, which is what makes
 * the ladder readable in CSS without `:is()` around every selector.
 */
const GUIDE_ATTRIBUTES = {
  guide: (value: NavGuide): Record<string, string> | null => {
    if (value === "none") return null;
    return {
      "data-indent": "",
      ...(value === "rail" || value === "branches" ? { "data-rail": "" } : {}),
      ...(value === "branches" ? { "data-branches": "" } : {}),
    };
  },
} satisfies StateAttributesMapping<{ guide: NavGuide }>;

const LIST_ATTRIBUTES = {
  ...DEPTH_ATTRIBUTES,
  ...openStateMapping,
  ...GUIDE_ATTRIBUTES,
  ...transitionStatusMapping,
} satisfies StateAttributesMapping<NavListState>;

/** Rows carry their value in the identity attribute — the DOM is the row order. */
const ROW_SELECTOR = "[data-nav-item],[data-nav-trigger]";

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export type NavRootProps = PrimitiveProps<"div", NavPartState> & {
  /** Groups open when nothing controls them. Read it from the request on the
   *  server, if you persist it, so the first paint is already right. Nothing
   *  here reads storage — `onExpandedChange` is the other half. */
  defaultExpanded?: string[];
  expanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  /** An explicit `Nav.createStore()` handle. Must be stable for the Root's life. */
  store?: NavStore;
  /** What every list draws down its left edge, unless it says otherwise. */
  guide?: NavGuide;
  /** Wrap at the ends when arrowing past the first or last row. */
  loop?: boolean;
  /** Disables every row at once — a read-only view of the tree. */
  disabled?: boolean;
  /** Seek a row by typing its label. */
  typeahead?: boolean;
  children?: ReactNode;
};

const visibleRows = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(ROW_SELECTOR)).filter(
    // A collapsed list unmounts, so its rows are already gone. `keepMounted`
    // leaves them in the DOM behind `hidden`, where they are not navigable.
    (row) => !row.closest("[data-nav-list][hidden]"),
  );

const rowValue = (row: HTMLElement) =>
  row.getAttribute("data-nav-item") ?? row.getAttribute("data-nav-trigger");

/** A field inside the nav owns its own arrow keys, or the caret never moves. */
const ownsTheKeys = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The provider and container. Owns the keyboard handling for the whole tree,
 * so roving focus and typeahead work without any row registering itself.
 * Renders a `<div>` element.
 */
export const NavRoot = ({
  defaultExpanded,
  expanded,
  onExpandedChange,
  store: storeProp,
  guide = "none",
  loop = false,
  disabled = false,
  typeahead = true,
  className,
  render,
  style,
  ...elementProps
}: NavRootProps) => {
  const [fallback] = useState(createNavStore);
  const store = storeProp ?? fallback;

  const [highlighted, setHighlighted] = useState<string | null>(null);
  const search = useRef({ query: "", at: 0 });

  store.controlledRef.current = expanded !== undefined;
  store.onExpandedChangeRef.current = onExpandedChange ?? null;

  // Applied before the first paint rather than in an effect: a group that opens
  // one frame late is the flash this whole storage contract exists to avoid.
  const hydrated = useRef(false);
  if (!hydrated.current) {
    hydrated.current = true;
    store.hydrate({ expanded: expanded ?? defaultExpanded });
  }

  // A controlled Root's prop is the state, so keep the snapshot following it.
  // `notify` here and nowhere else: this is the one hydrate that runs after
  // mount, where a memoised subtree would otherwise never learn of the change.
  useIsomorphicLayoutEffect(() => {
    if (expanded === undefined) return;
    store.hydrate({ expanded }, { notify: true });
  }, [expanded, store]);

  const move = useCallback((rows: HTMLElement[], index: number) => {
    const row = rows[index];
    if (!row) return;
    setHighlighted(rowValue(row));
    row.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const root = store.rootRef.current;
    if (!root || ownsTheKeys(event.target)) return;

    const current = (event.target as HTMLElement).closest<HTMLElement>(ROW_SELECTOR);
    if (!current) return;

    const rows = visibleRows(root);
    const index = rows.indexOf(current);
    if (index === -1) return;

    const last = rows.length - 1;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = index + delta;
      event.preventDefault();
      move(rows, loop ? (next + rows.length) % rows.length : Math.min(Math.max(next, 0), last));
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      move(rows, event.key === "Home" ? 0 : last);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const forward = event.key === "ArrowRight";
      const trigger = current.getAttribute("data-nav-trigger");
      // From the store, not aria-expanded: a page row hands that to its Nav.Toggle.
      const isOpen = trigger !== null && store.getSnapshot().expanded.has(trigger);
      event.preventDefault();

      // On a group: open it, then step into it. On a leaf, or a group already
      // closed: step out to the parent — which is where the row came from.
      if (trigger !== null && forward !== isOpen) {
        store.getSnapshot().setOpen(trigger, forward);
        return;
      }
      if (forward) {
        if (trigger !== null) move(rows, index + 1);
        return;
      }

      const parent = current.parentElement?.closest<HTMLElement>("[data-nav-group]");
      const parentTrigger = parent?.querySelector<HTMLElement>("[data-nav-trigger]");
      if (!parentTrigger) return;
      setHighlighted(rowValue(parentTrigger));
      parentTrigger.focus();
      return;
    }

    // Typeahead. Single printable characters only, so shortcuts still work.
    if (!typeahead || event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const now = Date.now();
    search.current = {
      query: (now - search.current.at > 500 ? "" : search.current.query) + event.key.toLowerCase(),
      at: now,
    };

    // Search from the row after the current one, so repeating a letter walks
    // through the matches rather than sticking to the first.
    const ordered = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
    const match = ordered.find((row) =>
      (row.textContent ?? "").trim().toLowerCase().startsWith(search.current.query),
    );
    if (!match) return;

    event.preventDefault();
    setHighlighted(rowValue(match));
    match.focus();
  };

  /*
   * A collapsed group unmounts its rows, so the highlighted one can simply
   * cease to exist — and a tab stop pointing at nothing leaves the whole nav
   * unreachable by keyboard. Re-home it on the first row instead. The same
   * effect seeds the initial value, since before it runs the tab stop is on
   * whichever row is active, and there may not be one.
   */
  useIsomorphicLayoutEffect(() => {
    const root = store.rootRef.current;
    if (!root) return;

    const rows = visibleRows(root);
    if (highlighted !== null && rows.some((row) => rowValue(row) === highlighted)) return;

    const first = rows[0];
    setHighlighted(first ? rowValue(first) : null);
  });

  const roving = useMemo<NavRovingContextValue>(
    () => ({ highlighted, setHighlighted, disabled, guide }),
    [highlighted, disabled, guide],
  );

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      state: { depth: 0, nested: false },
      stateAttributesMapping: DEPTH_ATTRIBUTES,
      ref: store.rootRef,
      props: [{ "data-nav": "", onKeyDown: handleKeyDown }, elementProps],
    },
  );

  return (
    <NavStoreContext value={store}>
      <NavRovingContext value={roving}>{element}</NavRovingContext>
    </NavStoreContext>
  );
};

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export type NavListProps = PrimitiveProps<"div", NavListState> & {
  /**
   * What this list draws down its left edge, overriding the Root's default:
   * `"indent"` for space alone, `"rail"` for a line down it, `"branches"` to
   * turn that line into each row that forks.
   *
   * Draw them yourself from `data-indent` / `data-rail` / `data-branches` — the
   * package publishes the signal, never the geometry.
   */
  guide?: NavGuide;
  /** Keep a collapsed list in the DOM behind `hidden="until-found"`, so the
   *  browser's find-in-page can reveal it. Costs the rows staying mounted. */
  keepMounted?: boolean;
  children?: ReactNode;
};

/**
 * The collection of rows — at the top level, and again inside every group.
 * One part for both is what makes the tree recursive: a group holds a list,
 * and a list holds groups.
 */
/**
 * Measure the content's true height, with every pinned height lifted.
 *
 * Two reasons the lift cannot stop at this element.
 *
 * Reading `scrollHeight` through its own pinned height is a ratchet: with
 * `overflow: hidden` it returns whichever of the content and the box is larger,
 * so a value once too big measures itself as too big forever.
 *
 * And a *descendant* list may be pinned too — mid-transition, or holding a
 * length it has not released yet. Measuring around one means the parent adopts
 * a height that its content does not actually want, and jumps to the real one
 * the moment the descendant releases. A recursive tree makes that the ordinary
 * case rather than the edge case, which is why this goes further than the
 * single-panel version it is modelled on.
 */
const measure = (element: HTMLElement) => {
  const pinned = [element, ...element.querySelectorAll<HTMLElement>("[data-nav-list]")];
  const restore = pinned.map((node) => {
    const height = node.style.height;
    const priority = node.style.getPropertyPriority("height");
    node.style.setProperty("height", "auto", "important");

    return () => {
      if (height) node.style.setProperty("height", height, priority);
      else node.style.removeProperty("height");
    };
  });

  const size = { height: element.scrollHeight, width: element.scrollWidth };

  for (const put of restore) put();
  return size;
};

/**
 * A level of the tree. A list inside a group is that group's collapsible
 * panel; a top-level list is not collapsible, having no trigger above it.
 * Renders a `<div>` element.
 */
export const NavList = ({
  guide,
  keepMounted = false,
  className,
  render,
  style,
  ...elementProps
}: NavListProps) => {
  const depth = use(NavDepthContext);
  const group = use(NavGroupContext);
  const { guide: fallback } = useRoving();
  const resolved = guide ?? fallback;
  const listRef = useRef<HTMLElement | null>(null);
  // Watched with its subtree, because the transition may be on the list or on
  // the group wrapping it, and the primitive does not get to decide which.
  const runWhenAnimationsFinish = useAnimationsFinished(
    group?.elementRef ?? listRef,
    false,
    true,
    true,
  );

  // A top-level list is not collapsible: there is no trigger above it.
  const open = group ? group.open : true;
  const { mounted, setMounted, transitionStatus } = useTransitionStatus(open);

  /*
   * The measured size, and only while a transition needs one.
   *
   * `height: auto` is not interpolable, so a collapse can only animate between
   * lengths — but a list pinned to a length *permanently* cannot hold a group
   * that expands inside it, and would clip the thing that just opened. So the
   * pin is temporary: taken when a transition starts, released the moment the
   * opening one finishes. An open, settled list is `auto` and grows freely.
   *
   * Base UI's Collapsible does exactly this, and it is the half of the
   * behaviour that is invisible until you nest one inside another.
   */
  const [size, setSize] = useState<{ height: number; width: number } | null>(null);

  /*
   * The closing styles, one frame late.
   *
   * `useTransitionStatus` reports `ending` in the same render that closes the
   * list, so pinning the height and setting `height: 0` would land together and
   * the browser would have nothing to transition between. Holding the styles
   * back for a frame lets the pinned length paint first.
   */
  const [closing, setClosing] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const element = listRef.current;
    if (!element || !mounted || transitionStatus === undefined) return;
    setSize(measure(element));
  }, [transitionStatus, mounted]);

  /*
   * Keep the pin honest while it holds.
   *
   * A pinned length is a snapshot, and the content can change after it is
   * taken — a nested list settling, an icon font arriving, a row wrapping to
   * two lines. Nothing there involves a React render, so nothing re-measures,
   * and a pin that ends up *short* strands the last row behind the clip for the
   * whole transition. It then appears the instant the pin is released, which
   * reads as the row popping in from the bottom rather than being revealed.
   *
   * Observing the children rather than the list: the list's own box is pinned,
   * so it is precisely the thing that cannot report the change.
   */
  useIsomorphicLayoutEffect(() => {
    const element = listRef.current;
    if (!element || size === null || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const next = measure(element);
      // Only when it actually moved, or the observer re-triggers on its own
      // write and never settles.
      setSize((current) =>
        current && current.height === next.height && current.width === next.width ? current : next,
      );
    });

    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [size]);

  useIsomorphicLayoutEffect(() => {
    if (transitionStatus !== "ending") {
      setClosing(false);
      return;
    }
    const frame = requestAnimationFrame(() => setClosing(true));
    return () => cancelAnimationFrame(frame);
  }, [transitionStatus]);

  /*
   * Released once the opening transition settles, so an ancestor is free to
   * grow when a group inside it opens.
   *
   * Keyed off this element's own `height` transition ending rather than off
   * "are any animations running", because at the moment this effect first runs
   * the transition has been triggered in the same commit but not yet
   * registered — so a poll can find nothing, release immediately, and turn the
   * whole reveal into a snap to `auto`. `transitionend` cannot fire early by
   * construction.
   *
   * The animation-frame path stays as the fallback for a consumer who animates
   * with keyframes, or does not animate at all, where no `transitionend` is
   * ever coming.
   */
  useIsomorphicLayoutEffect(() => {
    const element = listRef.current;
    if (!element || !open || !mounted || transitionStatus !== undefined || size === null) return;

    const controller = new AbortController();
    const release = () => setSize(null);

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== element || event.propertyName !== "height") return;
      release();
    };
    element.addEventListener("transitionend", onTransitionEnd, { signal: controller.signal });

    // Nothing to wait for if no height transition was declared; the frame path
    // resolves immediately in that case, which is the right answer.
    if (
      getComputedStyle(element)
        .transitionProperty.split(",")
        .every((property) => {
          const name = property.trim();
          return name !== "height" && name !== "all";
        })
    ) {
      runWhenAnimationsFinish(release, controller.signal);
    }

    return () => controller.abort();
  }, [open, mounted, transitionStatus, size, runWhenAnimationsFinish]);

  // Waits on `closing` rather than on `transitionStatus`, because at the moment the
  // transitionStatus flips there is no animation running yet to wait for.
  useIsomorphicLayoutEffect(() => {
    if (!closing) return;
    const controller = new AbortController();
    runWhenAnimationsFinish(() => setMounted(false), controller.signal);
    return () => controller.abort();
  }, [closing, runWhenAnimationsFinish, setMounted]);

  const hidden = !open && !mounted;

  // `until-found` is a string the DOM understands and React's boolean `hidden`
  // cannot express, so a kept list gets the attribute imperatively. Without it
  // the list stays navigable while collapsed and roving focus walks into rows
  // the visitor just closed.
  useIsomorphicLayoutEffect(() => {
    const element = listRef.current;
    if (!element || !keepMounted) return;
    if (hidden) element.setAttribute("hidden", "until-found");
    else element.removeAttribute("hidden");
  }, [keepMounted, hidden]);
  // `ending` is withheld until the pinned height has had a frame to paint.
  const published = transitionStatus === "ending" && !closing ? undefined : transitionStatus;

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      state: {
        depth,
        nested: group !== null,
        guide: resolved,
        open,
        transitionStatus: published,
      },
      stateAttributesMapping: LIST_ATTRIBUTES,
      ref: listRef,
      props: [
        {
          "data-nav-list": "",
          id: group?.listId,
          // A kept list gets `hidden="until-found"` from the effect above; React
          // can only express the boolean form, so it must not fight over it.
          hidden: keepMounted ? undefined : hidden,
          style: {
            "--nav-depth": depth,
            /*
             * `initial` rather than absent, and that distinction is the whole
             * bug it fixes.
             *
             * Custom properties inherit. Leaving this off a settled list lets it
             * pick up an *ancestor's* pinned length — and since the rule that
             * consumes it is `height: var(--nav-list-height)`, a nested list
             * would take its grandparent's height instead of its own content's,
             * shoving everything after it far down the page and snapping back the
             * moment the ancestor releases.
             *
             * `initial` on an unregistered custom property is the
             * guaranteed-invalid value, so `var()` fails, the declaration is
             * invalid at computed-value time, and `height` lands on `auto` —
             * which is what a settled list wants, without inheriting anything.
             */
            "--nav-list-height": size ? `${size.height}px` : "initial",
            "--nav-list-width": size ? `${size.width}px` : "initial",
          } as CSSProperties,
        },
        elementProps,
      ],
    },
  );

  if (!mounted && !keepMounted) return null;

  return <NavDepthContext value={depth + 1}>{element}</NavDepthContext>;
};

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

export type NavGroupProps = PrimitiveProps<"div", NavGroupState> & {
  /** Identifies the group in the expanded set, and in persistence. */
  value: string;
  disabled?: boolean;
  children?: ReactNode;
};

/**
 * A collapsible branch. Recursive by construction — a group's list may hold
 * further groups, to any depth, with no second set of parts for the nesting.
 */
export const NavGroup = ({
  value,
  disabled = false,
  className,
  render,
  style,
  ...elementProps
}: NavGroupProps) => {
  const store = useNavContextStore();
  const depth = use(NavDepthContext);
  const parent = use(NavGroupContext);
  const { disabled: rootDisabled } = useRoving();
  const listId = useId();
  const elementRef = useRef<HTMLElement | null>(null);

  const open = useNavStore(store, (nav) => nav.expanded.has(value));

  const context = useMemo<NavGroupContextValue>(
    () => ({ value, open, listId, disabled: disabled || rootDisabled, elementRef }),
    [value, open, listId, disabled, rootDisabled],
  );

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      state: { depth, nested: parent !== null, open },
      stateAttributesMapping: { ...DEPTH_ATTRIBUTES, ...openStateMapping },
      ref: elementRef,
      props: [{ "data-nav-group": value }, elementProps],
    },
  );

  return <NavGroupContext value={context}>{element}</NavGroupContext>;
};

// ---------------------------------------------------------------------------
// Rows — Item and Trigger
// ---------------------------------------------------------------------------

/** A button handles Enter and Space itself; a link handles only Enter. */
const activatesItself = (element: HTMLElement, key: string) =>
  element.tagName === "BUTTON" ||
  (key === "Enter" && element.tagName === "A" && element.hasAttribute("href"));

/** Only the part's own `div` needs the role; an element passed to `render` is yours to name. */
const buttonRole = (render: unknown) => (render ? undefined : "button");

/**
 * What `Item` and `Trigger` have in common: one tab stop for the whole nav,
 * focus that follows the arrows, and hand-wired Enter/Space — the price of not
 * being a real `<button>`, which is the price of holding an action inside.
 */
const useRow = (value: string, disabled: boolean, active: boolean, activate: () => void) => {
  const { highlighted, setHighlighted } = useRoving();

  return {
    // Exactly one row is tabbable. Before the roving state is seeded — a server
    // render, or the frame before hydration — the active row carries it, which
    // is both the conventional place for it and the one that keeps a row
    // rendered as a real anchor reachable without JavaScript.
    tabIndex: disabled ? -1 : (highlighted === null ? active : highlighted === value) ? 0 : -1,
    "aria-disabled": disabled || undefined,
    // `active` is the route being shown; your own `aria-current` still overrides it.
    "aria-current": active ? ("page" as const) : undefined,
    onFocus: () => setHighlighted(value),
    onClick: disabled ? (event: MouseEvent<HTMLElement>) => event.preventDefault() : undefined,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target !== event.currentTarget) return;
      if (activatesItself(event.currentTarget, event.key)) return;
      // Space scrolls the page otherwise, and the row is the thing being
      // pressed — not the document behind it.
      event.preventDefault();
      if (!disabled) activate();
    },
  };
};

export type NavItemProps = PrimitiveProps<"div", NavItemState> & {
  /** Identifies the row for roving focus and typeahead. */
  value: string;
  /** The route this row points at is the one being shown. */
  active?: boolean;
  disabled?: boolean;
  children?: ReactNode;
};

/**
 * A leaf row. A `div[role="button"]` rather than an anchor, so an action can
 * sit inside it — swap the element with `render={<Link href="…" />}` when you
 * want a real navigation, which drops the role, or handle `onClick` and route
 * yourself.
 */
export const NavItem = ({
  value,
  active = false,
  disabled,
  className,
  render,
  style,
  ...elementProps
}: NavItemProps) => {
  const depth = use(NavDepthContext);
  const group = use(NavGroupContext);
  const { disabled: rootDisabled } = useRoving();
  const isDisabled = disabled ?? rootDisabled;
  const ref = useRef<HTMLElement | null>(null);

  const row = useRow(value, isDisabled, active, () => ref.current?.click());

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { depth, nested: group !== null, active, disabled: isDisabled },
      stateAttributesMapping: DEPTH_ATTRIBUTES,
      ref,
      props: [{ ...row, role: buttonRole(render), "data-nav-item": value }, elementProps],
    },
  );
};

export type NavTriggerProps = PrimitiveProps<"div", NavTriggerState> & {
  active?: boolean;
  disabled?: boolean;
  children?: ReactNode;
};

/** The trigger a `Nav.Toggle` sits in: its disabled state, and how the caret announces itself. */
const NavTriggerContext = createContext<{
  disabled: boolean;
  setHasToggle: (present: boolean) => void;
} | null>(null);

/**
 * The row that opens a group — its heading and its disclosure in one, because
 * in a sidebar they are the same thing you click. Takes no `value`: it belongs
 * to the group it is written inside.
 *
 * Put a `Nav.Toggle` inside it and the two come apart: pressing the row
 * activates it like `Nav.Item`, and the caret opens the group and carries
 * `aria-expanded`. The arrow keys open and close it from the row either way.
 */
export const NavTrigger = ({
  active = false,
  disabled,
  className,
  render,
  style,
  ...elementProps
}: NavTriggerProps) => {
  const store = useNavContextStore();
  const depth = use(NavDepthContext);
  const group = use(NavGroupContext);
  if (!group) throw new Error("<Nav.Trigger> must be used within <Nav.Group>");

  const ref = useRef<HTMLElement | null>(null);
  const isDisabled = disabled ?? group.disabled;
  const toggle = () => store.getSnapshot().toggle(group.value);
  // A row holding a Nav.Toggle is a page: a press activates it, and the caret is the disclosure.
  const [hasToggle, setHasToggle] = useState(false);
  // Enter and Space activate a page row as a click would, reaching your onClick or the link.
  const row = useRow(group.value, isDisabled, active, () =>
    hasToggle ? ref.current?.click() : toggle(),
  );
  const context = useMemo(() => ({ disabled: isDisabled, setHasToggle }), [isDisabled]);

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      state: {
        depth,
        nested: depth > 0,
        open: group.open,
        active,
        disabled: isDisabled,
      },
      stateAttributesMapping: { ...DEPTH_ATTRIBUTES, ...openStateMapping },
      ref,
      props: [
        {
          ...row,
          role: buttonRole(render),
          "data-nav-trigger": group.value,
          // On a page row the caret announces the open state, not the row.
          "aria-expanded": hasToggle ? undefined : group.open,
          "aria-controls": hasToggle ? undefined : group.listId,
          onClick: (event: MouseEvent<HTMLElement>) => {
            if (isDisabled) event.preventDefault();
            else if (!hasToggle) toggle();
          },
        },
        elementProps,
      ],
    },
  );

  return <NavTriggerContext value={context}>{element}</NavTriggerContext>;
};

export type NavToggleState = NavPartState & { open: boolean; disabled: boolean };

export type NavToggleProps = PrimitiveProps<"div", NavToggleState> & { children?: ReactNode };

/**
 * The caret inside a row — the control that opens a branch whose row is also a
 * page. Mounting it makes pressing the row activate the page. Out of the roving
 * order, like `Nav.Action`, since the arrow keys already open the group from
 * the row, and it stops every event it handles: anything that escaped would
 * activate the row, or follow its link, on its way out of opening the group.
 */
export const NavToggle = ({ className, render, style, ...elementProps }: NavToggleProps) => {
  const store = useNavContextStore();
  const depth = use(NavDepthContext);
  const group = use(NavGroupContext);
  const trigger = use(NavTriggerContext);
  if (!group || !trigger) throw new Error("<Nav.Toggle> must be used within <Nav.Trigger>");

  // Mounting it is what makes its row a page.
  const { setHasToggle } = trigger;
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      setHasToggle(true);
      return () => setHasToggle(false);
    },
    [setHasToggle],
  );

  const stop = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const toggle = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    stop(event);
    event.preventDefault();
    if (!trigger.disabled) store.getSnapshot().toggle(group.value);
  };

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { depth, nested: depth > 0, open: group.open, disabled: trigger.disabled },
      stateAttributesMapping: { ...DEPTH_ATTRIBUTES, ...openStateMapping },
      ref,
      props: [
        {
          "data-nav-toggle": "",
          role: "button",
          tabIndex: -1,
          "aria-expanded": group.open,
          "aria-controls": group.listId,
          "aria-disabled": trigger.disabled || undefined,
          onClick: toggle,
          onPointerDown: stop,
          onDoubleClick: stop,
          onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.key === "Enter" || event.key === " ") toggle(event);
          },
        },
        elementProps,
      ],
    },
  );
};

// ---------------------------------------------------------------------------
// Row contents — Label, Icon, Action
// ---------------------------------------------------------------------------

export type NavLabelProps = PrimitiveProps<"span", NavPartState>;

/** The row's text. Its own element so it can truncate while the row does not. */
export const NavLabel = ({ className, render, style, ...elementProps }: NavLabelProps) => {
  const depth = use(NavDepthContext);
  const group = use(NavGroupContext);

  return useRenderElement(
    "span",
    { className, render, style },
    {
      state: { depth, nested: group !== null },
      stateAttributesMapping: DEPTH_ATTRIBUTES,
      props: [{ "data-nav-label": "" }, elementProps],
    },
  );
};

export type NavIconProps = PrimitiveProps<"span", NavPartState>;

/** Decoration. `aria-hidden`, so it stays out of the row's accessible name. */
export const NavIcon = ({ className, render, style, ...elementProps }: NavIconProps) => {
  const depth = use(NavDepthContext);
  const group = use(NavGroupContext);

  return useRenderElement(
    "span",
    { className, render, style },
    {
      state: { depth, nested: group !== null },
      stateAttributesMapping: DEPTH_ATTRIBUTES,
      props: [{ "data-nav-icon": "", "aria-hidden": true }, elementProps],
    },
  );
};

export type NavActionProps = PrimitiveProps<"div", NavPartState> & { children?: ReactNode };

/**
 * A control inside a row — the "…" that opens a menu. Out of the roving order,
 * so arrowing walks rows rather than stopping at every affordance, and it stops
 * every event it handles: anything that escaped would activate the row on its
 * way out of opening the menu.
 */
export const NavAction = ({ className, render, style, ...elementProps }: NavActionProps) => {
  const depth = use(NavDepthContext);
  const group = use(NavGroupContext);

  const stop = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { depth, nested: group !== null },
      stateAttributesMapping: DEPTH_ATTRIBUTES,
      props: [
        {
          "data-nav-action": "",
          role: buttonRole(render),
          tabIndex: -1,
          onClick: stop,
          onPointerDown: stop,
          onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          },
        },
        elementProps,
      ],
    },
  );
};
