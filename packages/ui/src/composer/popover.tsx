"use client";

// Composer.Popover — the floating alternative to a Composer.Panel for the
// command list. Where a Panel renders in-flow (growing the composer), Popover
// lifts the same CommandList children into a portal above the field, so it
// overlays instead of pushing layout. Like Panel, it's content-driven: the
// consumer gates its children on `commands.active`, so an empty popover (all
// gated out) stays closed. Positioned against the active command badge with
// collision handling (flip / shift / size) via useAnchorPositioning, portaled to
// the body. Exposes data-open/data-closed for the open/close animation plus
// data-side/data-align (from the positioner) so the transition origin can follow
// a flip, and a --anchor-available-height var so the list caps height + scrolls.

import { Children, type ReactNode, useCallback, useRef } from "react";
import { Portal } from "../internal/portal";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useAnchorPositioning } from "../internal/render/positioning";
import { useRenderElement } from "../internal/render/useRenderElement";
import { openStateMapping } from "../internal/state-mappings";
import { type ComposerState, useComposerContent, useComposerContextStore } from "./store";

export type ComposerPopoverState = {
  open: boolean;
};

export type ComposerPopoverProps = Omit<PrimitiveProps<"div", ComposerPopoverState>, "children"> & {
  children?: ReactNode | ((composer: Omit<ComposerState, "size">) => ReactNode);
  /** Hold the placement without collision repositioning (drops flip + shift). Default false. */
  pin?: boolean;
};

export const ComposerPopover = ({
  children,
  className,
  render,
  style,
  pin = false,
  ...elementProps
}: ComposerPopoverProps) => {
  const store = useComposerContextStore();
  const composer = useComposerContent();
  // `children` may be a callback receiving composer state (to gate on a native's
  // active flag) or plain nodes. Open while the resolved content is non-empty —
  // React can't read a child's rendered null off the prop, so count is the test.
  const content = typeof children === "function" ? children(composer) : children;
  const open = Children.toArray(content).length > 0;
  const elementRef = useRef<HTMLDivElement | null>(null);

  // Anchor to the active command badge, opening upward and left-aligned, with collision
  // handling (flip below when there's no room above, shift into view, size to fit), tracked
  // across scroll/resize/container growth. A getter (not a captured element) so the
  // re-rendered badge decoration is always the current one.
  const getBadge = useCallback(
    () => store.editorRef.current?.getRootElement()?.querySelector("[data-command-badge]") ?? null,
    [store],
  );
  useAnchorPositioning(getBadge, elementRef, {
    enabled: open,
    side: "top",
    align: "start",
    sideOffset: 8,
    pin,
  });

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      ref: elementRef,
      state: { open },
      stateAttributesMapping: openStateMapping,
      props: [
        {
          "data-composer-popover": "",
          // position/left/top are written imperatively by useAnchorPositioning; the styled
          // layer only supplies box/animation styling, not positioning.
          // Keep the editor focused when clicking the popover chrome so it
          // doesn't blur-dismiss; command items run their own selection on
          // mousedown. The list never takes focus.
          onMouseDown: (event) => event.preventDefault(),
          children: content,
        },
        elementProps,
      ],
    },
  );

  // Stays mounted (positioning only runs while open, so a closed popover just
  // holds its last position). Open/closed is exposed as data-open/data-closed
  // for the styled layer to animate against — same as the other parts.
  return <Portal>{element}</Portal>;
};
