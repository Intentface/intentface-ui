"use client";

import type { ReactNode } from "react";
import { createContext, use, useCallback, useMemo, useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "../internal/iso-layout-effect";
import { Portal } from "../internal/portal";
import type { PrimitiveProps } from "../internal/primitive-props";
import type { AnchorAlign, AnchorSide } from "../internal/render/positioning";
import { useAnchorPositioning } from "../internal/render/positioning";
import {
  type TransitionStatus,
  useAnimationsFinished,
  useTransitionStatus,
} from "../internal/render/transition";
import { useRenderElement } from "../internal/render/useRenderElement";
import { openStateMapping, transitionStatusMapping } from "../internal/state-mappings";
import type { TabsState } from "./store";
import { useTabsContextStore, useTabsStore } from "./store";

/**
 * The floating half of the surface.
 *
 * Wrapping `Tabs.Viewport` in these three parts is the entire difference
 * between a panel that sits in the layout and one that floats above the open
 * tab:
 *
 *   List + Viewport                                in the layout
 *   List + Portal > Positioner > Popup > Viewport  anchored to the open tab
 *
 * One positioner serves the whole collection, anchored to whichever tab is
 * open. A positioner per tab would mean one `autoUpdate` loop each — a
 * ResizeObserver and an IntersectionObserver apiece, still running while
 * closed — and nothing to morph between when the selection moves.
 *
 * Non-modal throughout: no backdrop, no scroll lock, no focus trap, and no
 * dismissal on outside press. A chat dock is something you work *behind*.
 */

export type TabsSide = AnchorSide;
export type TabsAlign = AnchorAlign;

const selectValue = (tabs: TabsState) => tabs.value;

export type TabsPositionerState = {
  side: TabsSide;
  align: TabsAlign;
  open: boolean;
};

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

/**
 * The surface's exit, shared between the part that decides when it is gone and
 * the part that is actually animating. Portal owns the mounting; Popup owns the
 * element, so it is the one that can tell when the animation has finished.
 */
type SurfaceTransition = {
  transitionStatus: TransitionStatus;
  open: boolean;
  onExitFinished: () => void;
};

const SurfaceTransitionContext = createContext<SurfaceTransition | null>(null);

export type TabsPortalProps = {
  children?: ReactNode;
  /** Defaults to `document.body`. */
  container?: HTMLElement | null;
  /**
   * Keep the surface in the DOM while nothing is open. Costs a live
   * positioning loop, so reach for it only when something inside must survive
   * being closed.
   */
  keepMounted?: boolean;
};

export const TabsPortal = ({ children, container, keepMounted = false }: TabsPortalProps) => {
  const store = useTabsContextStore();
  const open = useTabsStore(store, selectValue) !== null;

  // Kept mounted through the exit, so the surface can animate away instead of
  // blinking out. Popup reports when that has finished.
  const { mounted, setMounted, transitionStatus } = useTransitionStatus(open);

  const transition = useMemo<SurfaceTransition>(
    () => ({ transitionStatus, open, onExitFinished: () => setMounted(false) }),
    [transitionStatus, open, setMounted],
  );

  if (!mounted && !keepMounted) return null;

  return (
    <Portal container={container}>
      <SurfaceTransitionContext value={transition}>{children}</SurfaceTransitionContext>
    </Portal>
  );
};

// ---------------------------------------------------------------------------
// Positioner
// ---------------------------------------------------------------------------

export type TabsPositionerProps = PrimitiveProps<"div", TabsPositionerState> & {
  side?: TabsSide;
  align?: TabsAlign;
  sideOffset?: number;
  /** Kept clear of the viewport edges by this much. */
  collisionPadding?: number;
  children?: ReactNode;
};

export const TabsPositioner = ({
  side = "top",
  align = "center",
  sideOffset = 8,
  collisionPadding = 8,
  className,
  render,
  style,
  ...elementProps
}: TabsPositionerProps) => {
  const store = useTabsContextStore();
  const value = useTabsStore(store, selectValue);
  const open = value !== null;

  const positionerRef = useRef<HTMLDivElement | null>(null);

  // The open tab is the anchor — its whole item where there is one, falling
  // back to the button itself. Read on demand rather than subscribed to, so a
  // tab mounted in the same commit has registered by the time this runs.
  const getAnchor = useCallback(
    () => (value === null ? null : (store.anchors.get(value) ?? store.elements.get(value) ?? null)),
    [store, value],
  );

  /*
   * The resolved placement, which is what flip and shift may have changed it
   * to — so a popup that flipped can style itself as the side it ended up on.
   * `null` until the anchor has been measured, a frame later; the hook itself
   * withholds paint until that lands.
   */
  const [placement, setPlacement] = useState<{ side: TabsSide; align: TabsAlign } | null>(null);

  // Fires on every reposition, including scrolls that change nothing, so only
  // a real change is allowed through to state.
  const onPositioned = useCallback((next: { side: TabsSide; align: TabsAlign }) => {
    setPlacement((current) =>
      current && current.side === next.side && current.align === next.align ? current : next,
    );
  }, []);

  useAnchorPositioning(getAnchor, positionerRef, {
    enabled: open,
    side,
    align,
    sideOffset,
    collisionPadding,
    onPositioned,
  });

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { side: placement?.side ?? side, align: placement?.align ?? align, open },
      stateAttributesMapping: {
        ...openStateMapping,
        // data-side / data-align are written imperatively by useAnchorPositioning, so keep the
        // state copy out of the DOM rather than fighting it for the same attributes.
        side: () => null,
        align: () => null,
      },
      ref: positionerRef,
      props: [
        {
          "data-tabs-positioner": "",
          // Positioning belongs to this element and styling to the popup inside
          // it, so the thing being animated is never the thing being moved.
          role: "presentation",
          // Absolute from the first render, so it never spends a frame as a
          // layout participant in whatever it is portaled into. left/top/
          // visibility stay imperative — a React-managed value that *changed*
          // would be cleared out from under the hook; this one never does.
          style: { position: "absolute" },
        },
        elementProps,
      ],
    },
  );
};

// ---------------------------------------------------------------------------
// Popup
// ---------------------------------------------------------------------------

export type TabsPopupState = {
  open: boolean;
  /** Drives `data-starting-style` / `data-ending-style` for the surface itself. */
  transitionStatus: TransitionStatus;
};

export type TabsPopupProps = PrimitiveProps<"div", TabsPopupState>;

/** The surface itself: yours to style and animate. */
export const TabsPopup = ({ className, render, style, ...elementProps }: TabsPopupProps) => {
  const store = useTabsContextStore();
  const open = useTabsStore(store, selectValue) !== null;
  const transition = use(SurfaceTransitionContext);

  const popupRef = useRef<HTMLDivElement | null>(null);
  const runWhenAnimationsFinish = useAnimationsFinished(popupRef);

  useIsomorphicLayoutEffect(() => {
    if (!transition || transition.open) return;
    const controller = new AbortController();
    runWhenAnimationsFinish(transition.onExitFinished, controller.signal);
    return () => controller.abort();
  }, [transition, runWhenAnimationsFinish]);

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { open, transitionStatus: transition?.transitionStatus },
      stateAttributesMapping: { ...openStateMapping, ...transitionStatusMapping },
      ref: [popupRef, store.popupRef],
      props: [
        {
          "data-tabs-popup": "",
          onPointerEnter: store.hover.enterPopup,
          onPointerLeave: store.hover.leavePopup,
          // A press or focus inside means it is in use, so the mouse leaving no longer closes it.
          onPointerDown: store.hover.claim,
          onFocus: store.hover.claim,
        },
        elementProps,
      ],
    },
  );
};
