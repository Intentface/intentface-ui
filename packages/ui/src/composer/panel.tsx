"use client";

// Composer.Panel — a surface region for the command list / ask-user / steps. `children`
// is either normal nodes or a callback receiving the composer state, so you can pick what to
// show by priority: `{(c) => c.commands.active ? <CommandList/> : …}`. The state omits `size`,
// which moves on every wrapped line and would re-render the content; read it with useComposer.
//
// Two layouts:
//   • positioned overlay (default, `anchor`) — collision-aware (flip/shift/size) + portaled to
//     the body via useAnchorPositioning; `anchor` (`true`) anchors to the composer Container, a
//     ref/element anchors elsewhere. The positioner publishes --anchor-width /
//     --anchor-available-height for the styling layer (e.g. width: var(--anchor-width)); it
//     doesn't set the panel's own width. `pin` opts out of flip/shift (holds side/align).
//   • in-flow block (`anchor={false}`) — grows the composer; contained by the styling layer's
//     max-height. No positioning, no portal.
//
// Base UI-style open/close lifecycle either way: `open` tracks whether the resolved content is
// non-empty (flips false the instant the source closes); the host stays mounted through its
// close animation (keeps rendering the last content, exposes data-ending-style) and unmounts
// only once animations finish (useOpenChangeComplete → store.finalizePanelClose clears the
// native slices' sticky `present`). Seam: data-open / data-closed / data-starting-style /
// data-ending-style (+ data-side/data-align when positioned) — animate with CSS or Motion.

import { Children, type ReactNode, type RefObject, useCallback, useRef } from "react";
import { Portal } from "../internal/portal";
import type { PrimitiveProps } from "../internal/primitive-props";
import {
  type AnchorAlign,
  type AnchorSide,
  useAnchorPositioning,
} from "../internal/render/positioning";
import { type TransitionStatus, useOpenTransition } from "../internal/render/transition";
import { useRenderElement } from "../internal/render/useRenderElement";
import { openStateMapping, transitionStatusMapping } from "../internal/state-mappings";
import { type ComposerState, useComposerContent, useComposerContextStore } from "./store";

export type ComposerPanelState = {
  open: boolean;
  transitionStatus: TransitionStatus;
};

export type ComposerPanelChildren =
  | ReactNode
  | ((composer: Omit<ComposerState, "size">) => ReactNode);

export type ComposerPanelProps = Omit<PrimitiveProps<"div", ComposerPanelState>, "children"> & {
  children?: ComposerPanelChildren;
  /**
   * Positioned, portaled overlay (default `true`, anchored to the composer Container) or an
   * in-flow block (`false`). Pass a ref/element to anchor elsewhere. Match the anchor's width
   * with `width: var(--anchor-width)` in your styling.
   */
  anchor?: boolean | Element | RefObject<Element | null>;
  /** Overlay preferred side; flips to the opposite on collision. Default "top". */
  side?: AnchorSide;
  /** Overlay alignment along the side. Default "center". */
  align?: AnchorAlign;
  /** Overlay gap between the anchor and the panel. Default 0. */
  sideOffset?: number;
  /** Hold `side`/`align` without collision repositioning (drops flip + shift). Default false. */
  pin?: boolean;
};

export const ComposerPanel = ({
  className,
  render,
  style,
  children,
  anchor = true,
  side = "top",
  align = "center",
  sideOffset = 0,
  pin = false,
  ...elementProps
}: ComposerPanelProps) => {
  const store = useComposerContextStore();
  const composer = useComposerContent();
  const content = typeof children === "function" ? children(composer) : children;
  // Logical open — from the raw, source-gated content, so it goes false immediately on close.
  const open = Children.toArray(content).length > 0;

  const ref = useRef<HTMLDivElement>(null);

  // Freeze the last non-empty content so the panel keeps rendering it while it animates closed.
  // React reconciles by type+position, so the content fiber (e.g. the command list) isn't
  // remounted — and it survives store-driven nulling because the native slices' sticky
  // `present` flag keeps its own gate open until finalizePanelClose() below.
  const lastContentRef = useRef(content);
  if (open) lastContentRef.current = content;
  const rendered = open ? content : lastContentRef.current;

  // Stay mounted through the exit; once the close animation finishes, unmount and clear
  // `present` (via onClosed) so the frozen content can drop.
  const { mounted, transitionStatus } = useOpenTransition(open, ref, {
    onClosed: store.finalizePanelClose,
  });

  // Overlay mode: position against the anchor with collision handling + portal. `anchor` omitted
  // (or false) → in-flow block, no positioning.
  const positioned = anchor != null && anchor !== false;
  const getAnchor = useCallback((): Element | null => {
    if (anchor === true) return store.containerRef.current;
    if (anchor instanceof Element) return anchor;
    if (anchor && typeof anchor === "object" && "current" in anchor) return anchor.current;
    return null;
  }, [anchor, store]);
  useAnchorPositioning(getAnchor, ref, {
    enabled: positioned && mounted,
    side,
    align,
    sideOffset,
    pin,
  });

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      enabled: mounted,
      state: { open, transitionStatus },
      stateAttributesMapping: { ...openStateMapping, ...transitionStatusMapping },
      ref,
      props: [{ "data-composer-panel": "", children: rendered }, elementProps],
    },
  );

  return positioned ? <Portal>{element}</Portal> : element;
};
