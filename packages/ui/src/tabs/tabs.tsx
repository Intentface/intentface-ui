"use client";

import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { createContext, Fragment, use, useCallback, useId, useMemo, useState } from "react";
import { createChangeEventDetails } from "../internal/change-event-details";
import { step } from "../internal/collection";
import { isComposingKey } from "../internal/is-composing-key";
import { useIsomorphicLayoutEffect } from "../internal/iso-layout-effect";
import type { PrimitiveProps } from "../internal/primitive-props";
import type { StateAttributesMapping } from "../internal/render/getStateAttributesProps";
import { useRenderElement } from "../internal/render/useRenderElement";
import type {
  TabsDirection,
  TabsRootChangeEventDetails,
  TabsSelectOnClose,
  TabsState,
  TabsStore,
} from "./store";
import { createTabsStore, TabsStoreContext, useTabsContextStore, useTabsStore } from "./store";

/**
 * An open-ended, closable collection of tabs with at most one open.
 *
 * The parts are the same whether the content sits in the layout or floats
 * above it — that difference is a matter of what you wrap the viewport in, not
 * a prop:
 *
 *   List + Viewport                                in the layout
 *   List + Portal > Positioner > Popup > Viewport  anchored to the open tab
 *
 * The strip and the content both take a function, so neither needs a loop, a
 * key, or a subscription of its own:
 *
 *   <Tabs.Root defaultItems={["a", "b"]} defaultValue="a">
 *     <Tabs.List>
 *       {(id) => (
 *         <Tabs.Trigger value={id}>
 *           <Tabs.Icon />
 *           {id}
 *           <Tabs.Action>
 *             <Tabs.Close />
 *           </Tabs.Action>
 *         </Tabs.Trigger>
 *       )}
 *     </Tabs.List>
 *     <Tabs.Viewport>{(id) => <Document id={id} />}</Tabs.Viewport>
 *   </Tabs.Root>
 *
 * The viewport is one box rather than a panel per tab, and it can sit anywhere
 * in the tree — inside the popup for a floating surface, or in a card three
 * components away while the strip stays in the window chrome.
 *
 * ## Why this is a toolbar and not a tablist
 *
 * ARIA's `tablist` cannot describe this widget, for two independent reasons.
 * A tablist must own only tabs, so there is nowhere to put a close button; and
 * it requires exactly one selected tab, so `value: null` — a dock with
 * everything closed — is not a state it can express. Both are real, and axe
 * fails the first one outright.
 *
 * So the strip is a `toolbar` of buttons, each a disclosure for its panel:
 * `aria-expanded` says whether its panel is showing and `aria-controls` names
 * it. Close buttons are real buttons rather than pointer-only affordances,
 * arrow-key roving focus is exactly what a toolbar is expected to do, and
 * nothing open is an ordinary state.
 *
 * Static, always-one-selected tabs are a different widget, and a `tablist` is
 * the right role for those.
 */

export type TabsOrientation = "horizontal" | "vertical";

export type TabsPartState = {
  orientation: TabsOrientation;
  disabled: boolean;
  /** Nothing is open. A page-tab strip never sees this; a dock does. */
  empty: boolean;
  /** Which way the selection last moved, so panels can slide the right way. */
  direction: TabsDirection;
};

/**
 * `direction` would otherwise emit `data-direction` — the default derivation
 * lowercases rather than kebab-cases — and `none` is not worth an attribute.
 */
const PART_ATTRIBUTES = {
  direction: (value: TabsDirection) =>
    value === "none" ? null : { "data-activation-direction": value },
} satisfies StateAttributesMapping<TabsPartState>;

export type TabsTriggerState = TabsPartState & { selected: boolean };

const selectValue = (tabs: TabsState) => tabs.value;
const selectDirection = (tabs: TabsState) => tabs.direction;
const selectHasViewport = (tabs: TabsState) => tabs.hasViewport;
const selectItems = (tabs: TabsState) => tabs.items;

// ---------------------------------------------------------------------------
// Per-instance context
// ---------------------------------------------------------------------------

type TabsConfig = {
  orientation: TabsOrientation;
  loop: boolean;
  activateOnFocus: boolean;
  /** Set on the Root, and inherited by everything in it. */
  disabled: boolean;
};

const TabsConfigContext = createContext<TabsConfig | null>(null);

const useTabsConfig = () => {
  const config = use(TabsConfigContext);
  if (!config) throw new Error("Tabs parts must be used within <Tabs.Root>");
  return config;
};

/** Roving focus: which tab `Tab` would land on, separate from which is open. */
type TabsListContextValue = {
  highlighted: string | null;
  setHighlighted: (value: string | null) => void;
};

const TabsListContext = createContext<TabsListContextValue | null>(null);

/** What an `Item` stands for, so its children need not repeat any of it. */
type TabsItemContextValue = { value: string; disabled: boolean };

const TabsItemContext = createContext<TabsItemContextValue | null>(null);

/**
 * Disabled cascades: the Root disables everything, an Item disables its own
 * entry, and a part can disable just itself.
 */
const useDisabled = (own = false) => {
  const { disabled: rootDisabled } = useTabsConfig();
  const item = use(TabsItemContext);
  return rootDisabled || (item?.disabled ?? false) || own;
};

/** The enclosing item's value, if there is one. Does not insist on it. */
const useOptionalItemValue = (explicit?: string) => explicit ?? use(TabsItemContext)?.value ?? null;

const useItemValue = (explicit?: string) => {
  const inherited = use(TabsItemContext)?.value ?? null;
  const value = explicit ?? inherited;
  if (value === null || value === undefined) {
    throw new Error("Tabs parts need a `value`, either their own or from <Tabs.Trigger>");
  }
  return value;
};

const usePartState = (
  store: TabsStore,
  orientation: TabsOrientation,
  disabled = false,
): TabsPartState => ({
  orientation,
  disabled,
  empty: useTabsStore(store, selectValue) === null,
  direction: useTabsStore(store, selectDirection),
});

/**
 * True while a text field should keep an arrow key for itself: there is a
 * selection, Shift is held, or the caret has not yet reached the end it is
 * travelling towards.
 */
const ownsTheArrowKeys = (event: KeyboardEvent<HTMLElement>, forward: string, backward: string) => {
  const target = event.target as HTMLElement | null;
  if (!target || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return false;
  }
  if (target.disabled) return false;

  const { selectionStart, selectionEnd, value } = target;
  if (selectionStart === null || event.shiftKey || selectionStart !== selectionEnd) return true;
  if (event.key !== backward && selectionStart < value.length) return true;
  if (event.key !== forward && selectionStart > 0) return true;

  return false;
};

const tabId = (store: TabsStore, value: string) => `${store.baseId}-tab-${value}`;
const viewportId = (store: TabsStore) => `${store.baseId}-viewport`;

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export type TabsRootProps<Value extends string = string> = Omit<
  PrimitiveProps<"div", TabsPartState>,
  "defaultValue"
> & {
  defaultValue?: Value | null;
  value?: Value | null;
  /** Called before the selection changes. `eventDetails.cancel()` keeps it, except after a close. */
  onValueChange?: (value: Value | null, eventDetails: TabsRootChangeEventDetails) => void;
  defaultItems?: Value[];
  items?: Value[];
  /** Called before a tab is added, removed or moved. Cancelling a close keeps the tab. */
  onItemsChange?: (items: Value[], eventDetails: TabsRootChangeEventDetails) => void;
  /** Where the selection lands when a tab is closed. Unset means nowhere. */
  selectOnClose?: TabsSelectOnClose;
  /** An explicit `Tabs.createStore()` handle. Must be stable for the Root's life. */
  store?: TabsStore;
  orientation?: TabsOrientation;
  /** Wrap at the ends of the collection when arrowing. */
  loop?: boolean;
  /** Select on arrow rather than only on Enter/Space. */
  activateOnFocus?: boolean;
  /** Disables every tab at once — a read-only view of the collection. */
  disabled?: boolean;
  /**
   * Escape closes whatever is open. The only dismissal the primitive takes on:
   * a non-modal surface is one you work behind, so an outside press belongs to
   * the page, not to us.
   */
  dismissOnEscape?: boolean;
  children?: ReactNode;
};

/**
 * The provider and container. Owns the item order, the selection and the
 * roving focus, so every other part reads rather than holds state.
 * Renders a `<div>` element.
 */
export const TabsRoot = <Value extends string = string>({
  defaultValue,
  value,
  onValueChange,
  defaultItems,
  items,
  onItemsChange,
  selectOnClose,
  store: storeProp,
  orientation = "horizontal",
  loop = true,
  activateOnFocus = false,
  disabled = false,
  dismissOnEscape = true,
  className,
  render,
  style,
  ...elementProps
}: TabsRootProps<Value>) => {
  const baseId = useId();

  const [store] = useState(() => {
    const created = storeProp ?? createTabsStore();
    // Before anything has subscribed, so no notify and no write-back.
    created.hydrate({ items: items ?? defaultItems, value: value ?? defaultValue });
    created.baseId = baseId;
    return created;
  });

  // Latest-ref bridges, written during render: idempotent, and current before
  // any event handler can read them.
  store.selectOnCloseRef.current = selectOnClose;
  store.orientationRef.current = orientation;
  store.valueControlledRef.current = value !== undefined;
  store.itemsControlledRef.current = items !== undefined;
  store.onValueChangeRef.current = onValueChange as TabsStore["onValueChangeRef"]["current"];
  store.onItemsChangeRef.current = onItemsChange as TabsStore["onItemsChangeRef"]["current"];

  // Before paint, so a controlled change never shows the old state first.
  useIsomorphicLayoutEffect(() => {
    if (value !== undefined) store.commitValue(value);
  }, [value, store]);

  useIsomorphicLayoutEffect(() => {
    if (items !== undefined) store.commitItems(items);
  }, [items, store]);

  useIsomorphicLayoutEffect(() => {
    if (!dismissOnEscape) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const { value } = store.getSnapshot();
      // The window hears Escape last, so one handled inside (a composer stopping) is spent.
      // During IME composition, Escape cancels the conversion, not the popup (as in Base UI).
      if (event.key !== "Escape" || event.defaultPrevented || value === null) return;
      if (isComposingKey(event)) return;
      event.preventDefault();
      // From inside the popup, focus would drop to the body as it closes; it goes back to the tab.
      const fromPopup = store.popupRef.current?.contains(document.activeElement) ?? false;
      store.selectWithDetails(null, createChangeEventDetails("escape-key", event));
      if (fromPopup) store.elements.get(value)?.focus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dismissOnEscape, store]);

  const config = useMemo<TabsConfig>(
    () => ({ orientation, loop, activateOnFocus, disabled }),
    [orientation, loop, activateOnFocus, disabled],
  );

  // Nothing hover started outlives the strip.
  const releaseHoverOnUnmount = useCallback(() => () => store.hover.release(), [store]);

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      state: usePartState(store, orientation),
      stateAttributesMapping: PART_ATTRIBUTES,
      ref: releaseHoverOnUnmount,
      props: [{ "data-tabs": "" }, elementProps],
    },
  );

  return (
    <TabsStoreContext value={store}>
      <TabsConfigContext value={config}>{element}</TabsConfigContext>
    </TabsStoreContext>
  );
};

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export type TabsListProps = Omit<PrimitiveProps<"div", TabsPartState>, "children"> & {
  /**
   * Plain children when you are laying the strip out yourself. A function
   * renders one call per tab, in order, and saves you the map, the keys and a
   * subscription of your own.
   */
  children?: ReactNode | ((value: string, index: number) => ReactNode);
};

/**
 * The strip. A `toolbar` of disclosures rather than a `tablist`, because a
 * tablist may hold only tabs and must always have one selected.
 * Renders a `<div>` element.
 */
export const TabsList = ({
  children,
  className,
  render,
  style,
  ...elementProps
}: TabsListProps) => {
  const store = useTabsContextStore();
  const { orientation, loop, activateOnFocus } = useTabsConfig();
  const items = useTabsStore(store, selectItems);
  const value = useTabsStore(store, selectValue);

  // Which tab the roving tabindex sits on. Follows the open tab until the
  // arrows move it somewhere else, which is what manual activation means.
  const [highlighted, setHighlighted] = useState<string | null>(null);
  // Validated against `items`, not trusted: closing the focused tab with no
  // `selectOnClose` policy leaves nothing to focus, so no `onFocus` fires to
  // re-seed this. A stale id would leave every trigger at `tabIndex: -1` and
  // the strip unreachable from the keyboard.
  const live = highlighted !== null && items.includes(highlighted) ? highlighted : null;
  const current = live ?? value ?? items[0] ?? null;

  const listContext = useMemo<TabsListContextValue>(
    () => ({ highlighted: current, setHighlighted }),
    [current],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    const backward = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";

    // A text field inside the strip — renaming a tab in place — owns its own
    // arrow keys until the caret reaches the end it is heading for. Without
    // this the roving focus steals them and the caret never moves.
    if (ownsTheArrowKeys(event, forward, backward)) return;

    const next =
      event.key === forward
        ? step(items, current, 1, { loop })
        : event.key === backward
          ? step(items, current, -1, { loop })
          : event.key === "Home"
            ? (items[0] ?? null)
            : event.key === "End"
              ? (items[items.length - 1] ?? null)
              : undefined;

    if (next === undefined) return;
    event.preventDefault();
    if (next === null) return;

    setHighlighted(next);
    const element = store.elements.get(next);
    element?.focus();
    if (!activateOnFocus) return;
    store.selectWithDetails(
      next,
      createChangeEventDetails("list-navigation", event.nativeEvent, element),
    );
  };

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      state: usePartState(store, orientation),
      stateAttributesMapping: PART_ATTRIBUTES,
      props: [
        {
          "data-tabs-list": "",
          role: "toolbar",
          "aria-orientation": orientation,
          onKeyDown: handleKeyDown,
        },
        elementProps,
        {
          children:
            typeof children === "function"
              ? items.map((value, index) => (
                  <Fragment key={value}>{children(value, index)}</Fragment>
                ))
              : children,
        },
      ],
    },
  );

  return <TabsListContext value={listContext}>{element}</TabsListContext>;
};

// ---------------------------------------------------------------------------
// Trigger, Icon, Action, Close
// ---------------------------------------------------------------------------

export type TabsTriggerProps = PrimitiveProps<"div", TabsTriggerState> & {
  /** Required outside a `Tabs.List`; inside one it comes from the collection. */
  value?: string;
  disabled?: boolean;
  /** Open the tab when the mouse rests on it. Touch has no hover, so a tap still presses. */
  openOnHover?: boolean;
  /** How long the mouse rests on the tab before it opens, in ms. Needs `openOnHover`. */
  openDelay?: number;
  /** How long a hover-opened tab stays open after the mouse leaves, in ms. Needs `openOnHover`. */
  closeDelay?: number;
};

/**
 * A tab: the whole pill, and the thing you press.
 *
 * It is a `div` with `role="button"` rather than a `<button>`, so that a close
 * button can live inside it. That nesting is what Linear does and it is what
 * makes the entire pill a click target, but it is not free: `role="button"`
 * has children-presentational in ARIA, so `axe` reports `nested-interactive`
 * and the suite suppresses that one rule with a note. A real `<button>` would
 * be worse — the HTML parser closes an outer button when it meets an inner
 * one, so server-rendered markup would come back reshaped and hydration would
 * mismatch.
 *
 * The price of not being a native button is that activation is ours to
 * implement: Enter and Space, by hand.
 *
 * One part, two situations, decided by where it sits rather than by a prop:
 *
 * - **Inside a `Tabs.List`** it is one of the collection, joins the roving
 *   focus, and selects. `Delete` closes it.
 * - **Outside one** it takes an explicit value, keeps its own tab stop, and
 *   toggles — a panel with no tab behind it, opened anchored to the button
 *   that owns it and promoted to a real tab only when you call `open()`.
 *
 * With `openOnHover`, leaving closes the tab again unless the mouse heads into
 * the popup. A press on the tab, or a press or focus inside the popup, keeps it.
 */
export const TabsTrigger = ({
  value: explicitValue,
  disabled: ownDisabled,
  openOnHover = false,
  openDelay = 50,
  closeDelay = 50,
  className,
  render,
  style,
  ...elementProps
}: TabsTriggerProps) => {
  const store = useTabsContextStore();
  const { orientation, disabled: rootDisabled } = useTabsConfig();
  const list = use(TabsListContext);
  const inList = list !== null;

  const value = useItemValue(explicitValue);
  const disabled = rootDisabled || (ownDisabled ?? false);

  const selected = useTabsStore(store, selectValue) === value;
  const hasViewport = useTabsStore(store, selectHasViewport);

  const context = useMemo(() => ({ value, disabled }), [value, disabled]);

  const hovers = openOnHover && !disabled;

  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      // The same element is both the focus target and what a floating surface
      // lines up with, now that the pill and the button are one thing.
      store.registerElement(value, element);
      store.registerAnchor(value, element);
      const unregisterHover = element && hovers ? store.hover.register(element) : undefined;
      return () => {
        store.registerElement(value, null);
        store.registerAnchor(value, null);
        unregisterHover?.();
      };
    },
    [store, value, hovers],
  );

  useIsomorphicLayoutEffect(() => {
    store.registerDisabled(value, disabled);
    return () => store.registerDisabled(value, false);
  }, [store, value, disabled]);

  const activate = (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    // A press on a tab the mouse opened keeps it open, rather than toggling it shut.
    const hoverOpened = store.hover.owns(value);
    store.hover.claim();
    store.selectWithDetails(
      !inList && selected && !hoverOpened ? null : value,
      createChangeEventDetails("trigger-press", event.nativeEvent, event.currentTarget),
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      // A div does not do this for us.
      event.preventDefault();
      activate(event);
      return;
    }
    // Delete closes a tab — the keyboard equivalent of the × beside it.
    if (!inList || disabled) return;
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    event.preventDefault();
    closeAndRefocus(
      store,
      value,
      createChangeEventDetails("keyboard", event.nativeEvent, event.currentTarget),
    );
  };

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      state: { ...usePartState(store, orientation, disabled), selected },
      stateAttributesMapping: PART_ATTRIBUTES,
      ref,
      props: [
        {
          "data-tabs-trigger": "",
          role: "button",
          id: tabId(store, value),
          "aria-expanded": selected,
          // Only claim a viewport that is really in the document.
          "aria-controls": hasViewport ? viewportId(store) : undefined,
          "aria-disabled": disabled || undefined,
          tabIndex: inList ? (list.highlighted === value ? 0 : -1) : 0,
          onClick: activate,
          onFocus: inList ? () => list.setHighlighted(value) : undefined,
          onKeyDown: handleKeyDown,
          ...(hovers && {
            onPointerEnter: (event: PointerEvent<HTMLDivElement>) =>
              store.hover.enterTab({ value, openDelay, closeDelay }, event),
            onPointerMove: store.hover.moveOnTab,
            onPointerLeave: store.hover.leaveTab,
          }),
        },
        elementProps,
      ],
    },
  );

  return <TabsItemContext value={context}>{element}</TabsItemContext>;
};

/**
 * Close, then put focus somewhere deliberate.
 *
 * The store commits synchronously, so the tab that takes over is already known
 * by the time this reads it back — and focus moves there before React unmounts
 * the tab that was closed. Left alone, focus would fall to the body.
 */
const closeAndRefocus = (
  store: TabsStore,
  value: string,
  eventDetails: TabsRootChangeEventDetails,
) => {
  store.closeWithDetails(value, eventDetails);
  if (eventDetails.isCanceled) return;
  const successor = store.getSnapshot().value;
  if (successor) store.elements.get(successor)?.focus();
};

export type TabsIconProps = PrimitiveProps<"span", TabsTriggerState> & { value?: string };

/**
 * A decorative mark inside a trigger.
 *
 * `aria-hidden`, deliberately: the trigger already has an accessible name, and
 * an icon that repeats it only makes the announcement longer. It carries the
 * part state too, so the mark can respond to its tab being open without the
 * consumer reaching for a group selector.
 */
export const TabsIcon = ({
  value: explicitValue,
  className,
  render,
  style,
  ...elementProps
}: TabsIconProps) => {
  const store = useTabsContextStore();
  const { orientation } = useTabsConfig();
  const value = useOptionalItemValue(explicitValue);
  const disabled = useDisabled();
  const selected = useTabsStore(store, selectValue) === value && value !== null;

  return useRenderElement(
    "span",
    { className, render, style },
    {
      state: { ...usePartState(store, orientation, disabled), selected },
      stateAttributesMapping: PART_ATTRIBUTES,
      props: [{ "data-tabs-icon": "", "aria-hidden": true }, elementProps],
    },
  );
};

export type TabsActionProps = PrimitiveProps<"div", TabsTriggerState> & {
  /** Only outside a tab, where there is none to inherit from. */
  value?: string;
};

/**
 * The trailing slot inside a tab — where the close button lives.
 *
 * Its own part rather than a div of yours for one reason: a tab narrow enough
 * to truncate has nowhere to put a control. Give this `position: absolute` and
 * a background that fades to the tab's own colour, and the label runs the full
 * width and disappears under it instead of colliding with it. A flex box with
 * padding then centres whatever is inside.
 *
 * All of that is your CSS. What the part supplies is the element and the
 * trigger's state on it — `data-selected` above all, since the fade has to end
 * in whatever colour the tab currently is.
 */
export const TabsAction = ({
  value: explicitValue,
  className,
  render,
  style,
  ...elementProps
}: TabsActionProps) => {
  const store = useTabsContextStore();
  const { orientation } = useTabsConfig();
  const value = useOptionalItemValue(explicitValue);
  const disabled = useDisabled();
  const selected = useTabsStore(store, selectValue) === value && value !== null;

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { ...usePartState(store, orientation, disabled), selected },
      stateAttributesMapping: PART_ATTRIBUTES,
      props: [{ "data-tabs-action": "" }, elementProps],
    },
  );
};

export type TabsCloseProps = PrimitiveProps<"div", TabsTriggerState> & {
  value?: string;
  disabled?: boolean;
};

/**
 * The × inside a tab.
 *
 * Also a `div` with `role="button"`, for the same reason its parent is. It
 * keeps out of the roving order — arrowing along a strip should walk tabs, not
 * alternate between each tab and its close button — so the keyboard route to
 * closing is `Delete` on the tab itself. Every event it handles stops there:
 * nested inside the trigger, anything that escaped would open the tab on its
 * way out of closing it.
 */
export const TabsClose = ({
  value: explicitValue,
  disabled: ownDisabled,
  className,
  render,
  style,
  ...elementProps
}: TabsCloseProps) => {
  const store = useTabsContextStore();
  const { orientation } = useTabsConfig();
  const disabled = useDisabled(ownDisabled);
  const value = useItemValue(explicitValue);
  const selected = useTabsStore(store, selectValue) === value;

  const close = (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    if (disabled) return;
    closeAndRefocus(
      store,
      value,
      createChangeEventDetails("close-press", event.nativeEvent, event.currentTarget),
    );
  };

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { ...usePartState(store, orientation, disabled), selected },
      stateAttributesMapping: PART_ATTRIBUTES,
      props: [
        {
          "data-tabs-close": "",
          role: "button",
          "aria-disabled": disabled || undefined,
          tabIndex: -1,
          onClick: close,
          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            close(event);
          },
        },
        elementProps,
      ],
    },
  );
};

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

export type TabsViewportState = TabsPartState & {
  /** The open tab, or null when nothing is. */
  value: string | null;
};

export type TabsViewportProps = Omit<PrimitiveProps<"div", TabsViewportState>, "children"> & {
  /** Renders the content for whatever is open. Not called when nothing is. */
  children?: (value: string) => ReactNode;
};

/**
 * The one box that shows a tab's content.
 *
 * There is no per-tab element and nothing mounts or unmounts as you switch —
 * the same box stays put and re-renders its children for whichever value is
 * open. That is what makes a floating surface simply move rather than tear
 * itself down, and it is why nothing here needs overlaying or a mount flag.
 *
 * The corollary, and it is deliberate: nothing off-screen exists. A tab you
 * are not looking at has no component, so anything that must keep running
 * while you are elsewhere — a reply still streaming — belongs in a store
 * rather than in the panel's own state.
 */
export const TabsViewport = ({
  children,
  className,
  render,
  style,
  ...elementProps
}: TabsViewportProps) => {
  const store = useTabsContextStore();
  const { orientation } = useTabsConfig();
  const value = useTabsStore(store, selectValue);

  // A trigger only claims a viewport that is really in the document.
  useIsomorphicLayoutEffect(() => {
    store.registerViewport(true);
    return () => store.registerViewport(false);
  }, [store]);

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { ...usePartState(store, orientation), value },
      stateAttributesMapping: {
        ...PART_ATTRIBUTES,
        // The open tab's id is not a styling hook; keep it out of the DOM.
        value: () => null,
      },
      props: [
        {
          "data-tabs-viewport": "",
          id: viewportId(store),
          // A bare div maps to the `generic` role, whose name is prohibited, so
          // `aria-labelledby` on one is discarded. `group` is the lightest role
          // that accepts a name without claiming the tabpanel semantics this
          // widget deliberately does not have.
          role: value === null ? undefined : "group",
          // Named by whichever tab is open, so the box is not anonymous.
          "aria-labelledby": value === null ? undefined : tabId(store, value),
        },
        elementProps,
        { children: value === null ? null : children?.(value) },
      ],
    },
  );
};
