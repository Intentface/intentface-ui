"use client";

import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIsomorphicLayoutEffect } from "../internal/iso-layout-effect";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";
import type { ShellState, ShellStore } from "./store";
import { createShellStore, ShellStoreContext, useShellContextStore, useShellStore } from "./store";

/**
 * The shell: a sidebar that collapses, floats out on hover, and can be dragged
 * wider, next to the viewport it shares the screen with.
 *
 * The package ships no CSS. Parts publish their state as `data-*` attributes
 * and the sidebar's measured width as a custom property; sizing, collapsing
 * geometry and transitions are all yours. In particular **the sidebar's width
 * and the range it may be dragged through are CSS**:
 *
 *   [data-shell-sidebar] {
 *     width: var(--shell-sidebar-width, 240px);
 *     min-width: 200px;
 *     max-width: 400px;
 *   }
 *
 * The drag writes that custom property, the browser clamps it against your
 * `min-width` / `max-width`, and the sidebar reports back whatever the browser
 * settled on. Nothing here second-guesses your stylesheet.
 *
 * No global key binding either. `Shell.Trigger` is the click affordance; a
 * Cmd/Ctrl+B — or whatever your app's shortcut registry says — is four lines
 * around `useShell((shell) => shell.toggle)`, and a package has no business
 * claiming a window-level `keydown` for a key it cannot know is free.
 */

/** Written by the grip; read by your `width`. */
export const SHELL_SIDEBAR_WIDTH_VAR = "--shell-sidebar-width";

// Both delays are intent filters: the open delay stops a pointer merely
// crossing the strip from floating the panel out, and the close grace lets you
// clip a corner on the way from the strip to the panel without losing it.
const PEEK_OPEN_DELAY_MS = 200;
const PEEK_CLOSE_DELAY_MS = 250;

export type ShellPartState = {
  state: "expanded" | "collapsed";
  hotspot: boolean;
  resizing: boolean;
};

export type ShellSidebarState = ShellPartState & { side: "left" | "right" };

const selectOpen = (shell: ShellState) => shell.open;
const selectHotspot = (shell: ShellState) => shell.hotspot;
const selectResizing = (shell: ShellState) => shell.resizing;
const selectWidth = (shell: ShellState) => shell.width;

// Three primitive subscriptions rather than one selector returning an object:
// useSyncExternalStore compares snapshots by identity, so a selector that built
// a fresh object every call would never settle.
const usePartState = (store: ShellStore): ShellPartState => ({
  state: useShellStore(store, selectOpen) ? "expanded" : "collapsed",
  hotspot: useShellStore(store, selectHotspot),
  resizing: useShellStore(store, selectResizing),
});

// ---------------------------------------------------------------------------
// Hotspot choreography
// ---------------------------------------------------------------------------

type HotspotControls = {
  /** The pointer entered the edge strip. */
  request: () => void;
  /** The pointer entered the panel: cancel any pending close. */
  hold: () => void;
  /** The pointer left the strip or the panel. */
  release: () => void;
};

const ShellHotspotContext = createContext<HotspotControls | null>(null);

const useHotspotControls = (store: ShellStore) => {
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  const controls = useMemo<HotspotControls>(
    () => ({
      request: () => {
        // Armed by the collapse that just happened under this pointer.
        if (store.hotspotSuppressionRef.current) return;
        window.clearTimeout(closeTimer.current);
        if (store.getSnapshot().hotspot) return;
        openTimer.current = window.setTimeout(() => {
          // Re-checked on firing, not just on arming. A timer started while the
          // sidebar was still expanded outlives a collapse that happens during
          // the delay, and would then float the panel straight back out from
          // under the pointer that just closed it.
          if (store.hotspotSuppressionRef.current) return;
          store.getSnapshot().setHotspot(true);
        }, PEEK_OPEN_DELAY_MS);
      },
      hold: () => window.clearTimeout(closeTimer.current),
      release: () => {
        // The pointer has moved on, so the bounce-back guard has done its job.
        store.hotspotSuppressionRef.current = false;
        // Darting through the strip never opens it.
        window.clearTimeout(openTimer.current);
        if (!store.getSnapshot().hotspot) return;
        closeTimer.current = window.setTimeout(
          () => store.getSnapshot().setHotspot(false),
          PEEK_CLOSE_DELAY_MS,
        );
      },
    }),
    [store],
  );

  // Cmd-Tab away mid-hotspot fires no pointerleave: without this the panel stays
  // floated and a pending open timer fires into a backgrounded window.
  useEffect(() => {
    const dismiss = () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      store.getSnapshot().setHotspot(false);
    };
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("blur", dismiss);
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    };
  }, [store]);

  return controls;
};

const useHotspotContext = () => {
  const controls = use(ShellHotspotContext);
  if (!controls) throw new Error("Shell parts must be used within <Shell.Root>");
  return controls;
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export type ShellRootProps = PrimitiveProps<"div", ShellPartState> & {
  /**
   * Where the sidebar starts when nothing controls it. Read it from the
   * request on the server, if you persist it, so the first paint is already
   * right rather than snapping a frame later. Nothing here reads storage —
   * see `onOpenChange` for the other half.
   */
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * An explicit `Shell.createStore()` handle, for when the state has to be
   * reachable from outside this tree. Must be stable for the Root's lifetime.
   */
  store?: ShellStore;
  children?: ReactNode;
};

/**
 * The provider and container. Holds the store every other part reads, so
 * `defaultOpen` and the width must arrive here rather than on a child.
 * Renders a `<div>` element.
 */
export const ShellRoot = ({
  defaultOpen,
  open,
  onOpenChange,
  store: storeProp,
  className,
  render,
  style,
  ...elementProps
}: ShellRootProps) => {
  const sidebarId = useId();

  const [store] = useState(() => {
    const created = storeProp ?? createShellStore();
    // Before anything has subscribed, so no notify and no write-back. The
    // controlled value wins over the default: the layout effect below would
    // otherwise correct it only after the server had already shipped the wrong
    // markup, which is the pre-hydration flash `defaultOpen` exists to prevent.
    created.hydrate({ open: open ?? defaultOpen });
    created.sidebarId = sidebarId;
    return created;
  });

  // Latest-ref bridges, written during render: idempotent, and they have to be
  // current before any event handler can read them.
  store.controlledRef.current = open !== undefined;
  store.onOpenChangeRef.current = onOpenChange ?? null;

  // Before paint, so a controlled change never shows the old state first.
  useIsomorphicLayoutEffect(() => {
    if (open !== undefined) store.commitOpen(open);
  }, [open, store]);

  const hotspot = useHotspotControls(store);
  const state = usePartState(store);

  /*
   * The bounce-back guard is armed by every collapse, but it is only *meant* to
   * survive one where the pointer was sitting where the strip is about to
   * appear. Any movement outside the strip proves it wasn't, so it is cleared
   * here — without this, collapsing by keyboard or by a trigger anywhere else
   * arms a guard that then swallows the next genuine hover.
   *
   * Ref write only, no re-render, and it returns immediately when nothing is
   * armed — which is almost always.
   */
  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!store.hotspotSuppressionRef.current) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-shell-hotspot]")) return;
    store.hotspotSuppressionRef.current = false;
  };

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      state,
      ref: store.rootRef,
      props: [{ "data-shell": "", onPointerMove: handlePointerMove }, elementProps],
    },
  );

  return (
    <ShellStoreContext value={store}>
      <ShellHotspotContext value={hotspot}>{element}</ShellHotspotContext>
    </ShellStoreContext>
  );
};

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export type ShellSidebarProps = PrimitiveProps<"div", ShellSidebarState> & {
  side?: "left" | "right";
  /**
   * The panel's settled width, in pixels — fired once a drag ends, never per
   * frame, and whenever anything else resizes it. Persist it if you want it
   * remembered, and restore it as the custom property rather than as a prop:
   * the width is CSS's, and this is only the measurement coming back.
   */
  onResize?: (width: number) => void;
};

/**
 * The panel, and the element whose width is measured and reported back.
 * Carries the `id` the trigger's `aria-controls` points at.
 * Renders a `<div>` element.
 */
export const ShellSidebar = ({
  side = "left",
  onResize,
  className,
  render,
  style,
  ...elementProps
}: ShellSidebarProps) => {
  const store = useShellContextStore();
  // Latest-ref bridge, written during render: idempotent, and current before
  // the measurement below can report anything.
  store.onResizeRef.current = onResize ?? null;
  const hotspot = useHotspotContext();
  const partState = usePartState(store);

  // Report the width the browser settled on, so persistence and the resize
  // handle's aria-valuenow describe what is actually on screen.
  useIsomorphicLayoutEffect(() => {
    const element = store.sidebarRef.current;
    if (!element) return;

    const measure = () => {
      const measured = element.offsetWidth;
      // Zero means the element is not laid out — display:none, a breakpoint
      // that hides it, a test environment without layout. That carries no
      // information, and persisting it would throw away the width the user
      // actually chose.
      if (measured > 0) store.getSnapshot().setWidth(measured);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    // The border box, to match offsetWidth: padding or a border can change
    // while the content box, the default, stays the same.
    observer.observe(element, { box: "border-box" });
    return () => observer.disconnect();
  }, [store]);

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { ...partState, side },
      ref: store.sidebarRef,
      props: [
        {
          "data-shell-sidebar": "",
          id: store.sidebarId,
          onPointerEnter: hotspot.hold,
          onPointerLeave: hotspot.release,
        },
        elementProps,
      ],
    },
  );
};

// ---------------------------------------------------------------------------
// Viewport, hotspot, trigger
// ---------------------------------------------------------------------------

export type ShellViewportProps = PrimitiveProps<"div", ShellPartState>;

/**
 * The content area beside the sidebar. Carries the same state attributes as
 * the root, so it can react to the sidebar without a group selector.
 * Renders a `<div>` element.
 */
export const ShellViewport = ({ className, render, style, ...elementProps }: ShellViewportProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    {
      state: usePartState(useShellContextStore()),
      props: [{ "data-shell-viewport": "" }, elementProps],
    },
  );

export type ShellHotspotProps = PrimitiveProps<"div", ShellPartState>;

/**
 * The strip along the screen edge that floats a collapsed sidebar out on
 * hover. Give it a width and a position in CSS. Omitting it is how you opt out
 * of hotspot entirely — there is no prop to turn it off, because not rendering it
 * already says that.
 */
export const ShellHotspot = ({ className, render, style, ...elementProps }: ShellHotspotProps) => {
  const hotspot = useHotspotContext();

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: usePartState(useShellContextStore()),
      props: [
        {
          "data-shell-hotspot": "",
          "aria-hidden": true,
          onPointerEnter: hotspot.request,
          onPointerLeave: hotspot.release,
        },
        elementProps,
      ],
    },
  );
};

export type ShellTriggerProps = PrimitiveProps<"button", ShellPartState>;

/**
 * Toggles the sidebar, and pins a floated-out one open rather than closing it.
 * Ships no copy — supply the label as children.
 * Renders a `<button>` element.
 */
export const ShellTrigger = ({ className, render, style, ...elementProps }: ShellTriggerProps) => {
  const store = useShellContextStore();
  const state = usePartState(store);

  const handleClick = useCallback(() => {
    const shell = store.getSnapshot();
    // Clicking the trigger inside a floated sidebar pins it open.
    shell.setOpen(shell.hotspot ? true : !shell.open);
  }, [store]);

  return useRenderElement(
    "button",
    { className, render, style },
    {
      state,
      props: [
        {
          type: "button",
          "data-shell-trigger": "",
          "aria-expanded": state.state === "expanded",
          "aria-controls": store.sidebarId,
          onClick: handleClick,
        },
        elementProps,
      ],
    },
  );
};

// ---------------------------------------------------------------------------
// Grip
// ---------------------------------------------------------------------------

export type ShellGripProps = PrimitiveProps<"div", ShellPartState> & {
  /** Pixels moved per arrow-key press. */
  step?: number;
};

type Bounds = { min: number; max: number };

/** The drag range, straight from the stylesheet. `max-width: none` means unbounded. */
const readBounds = (element: HTMLElement): Bounds => {
  const computed = getComputedStyle(element);
  const min = Number.parseFloat(computed.minWidth);
  const max = Number.parseFloat(computed.maxWidth);
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : Number.POSITIVE_INFINITY,
  };
};

const clamp = (value: number, { min, max }: Bounds) => Math.min(Math.max(value, min), max);

/**
 * Publish the width on the root, not the sidebar, so anything else in the
 * shell can size itself to match. Clamped here rather than left to the
 * browser: `min-width` would constrain only the sidebar, and a spacer reading
 * the raw value would then disagree with it past either end of the range.
 */
const publishWidth = (store: ShellStore, width: number, bounds: Bounds) => {
  store.rootRef.current?.style.setProperty(SHELL_SIDEBAR_WIDTH_VAR, `${clamp(width, bounds)}px`);
};

/** Dragging right widens a left sidebar and narrows a right one. */
const widenDirection = (sidebar: HTMLElement) => (sidebar.dataset.side === "right" ? -1 : 1);

/**
 * The drag affordance. Give it a width and a cursor in CSS; the drag range
 * comes from the sidebar's own `min-width` and `max-width`.
 * Renders a `<div>` element with `role="separator"`.
 */
export const ShellGrip = ({
  step = 16,
  className,
  render,
  style,
  ...elementProps
}: ShellGripProps) => {
  const store = useShellContextStore();
  const state = usePartState(store);
  const width = useShellStore(store, selectWidth);

  const [bounds, setBounds] = useState<Bounds>({ min: 0, max: Number.POSITIVE_INFINITY });
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    bounds: Bounds;
  } | null>(null);

  // Re-read after every commit rather than on a dependency, so a stylesheet
  // that swaps the range at a breakpoint reaches aria-valuemin/max too. Cheap:
  // the identity guard stops it looping, and it is skipped mid-drag, where the
  // range cannot change and the drag holds its own copy anyway.
  useIsomorphicLayoutEffect(() => {
    const sidebar = store.sidebarRef.current;
    if (!sidebar || state.resizing) return;
    const next = readBounds(sidebar);
    setBounds((current) => (current.min === next.min && current.max === next.max ? current : next));
  });

  const endDrag = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    store.getSnapshot().setResizing(false);
  }, [store]);

  // A drag can end without a pointerup: cmd-tab away, or the tab going to the
  // background. Left unhandled the flag sticks and everything downstream of
  // `data-resizing` stays wrong until a reload.
  useEffect(() => {
    if (!state.resizing) return;
    window.addEventListener("blur", endDrag);
    document.addEventListener("visibilitychange", endDrag);
    return () => {
      window.removeEventListener("blur", endDrag);
      document.removeEventListener("visibilitychange", endDrag);
    };
  }, [state.resizing, endDrag]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const sidebar = store.sidebarRef.current;
    if (!sidebar || event.button !== 0) return;

    event.preventDefault();
    // Not every environment implements pointer capture; without it the drag
    // still works, it just stops tracking once the pointer leaves the handle.
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebar.offsetWidth,
      // Read once, at the start: the range cannot change mid-drag, and
      // re-reading computed style on every pointermove would be a needless
      // style recalculation per frame.
      bounds: readBounds(sidebar),
    };
    store.getSnapshot().setResizing(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const sidebar = store.sidebarRef.current;
    if (!drag.current || !sidebar || event.pointerId !== drag.current.pointerId) return;

    const travelled = (event.clientX - drag.current.startX) * widenDirection(sidebar);
    publishWidth(store, drag.current.startWidth + travelled, drag.current.bounds);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const sidebar = store.sidebarRef.current;
    if (!sidebar) return;

    const towards = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (towards === 0) return;

    event.preventDefault();
    const next = sidebar.offsetWidth + towards * widenDirection(sidebar) * step;
    publishWidth(store, next, readBounds(sidebar));
  };

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state,
      props: [
        {
          "data-shell-grip": "",
          role: "separator",
          "aria-orientation": "vertical",
          // A focusable separator must always carry a value; omitting it until
          // the first measurement lands would leave the widget invalid for that
          // window. The minimum is the least misleading stand-in, and it is
          // corrected on the next frame.
          "aria-valuenow": width ?? bounds.min,
          "aria-valuemin": bounds.min,
          "aria-valuemax": Number.isFinite(bounds.max) ? bounds.max : undefined,
          tabIndex: 0,
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          onKeyDown: handleKeyDown,
        },
        elementProps,
      ],
    },
  );
};
