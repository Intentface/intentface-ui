"use client";

// Composer.Container — the visual dock chrome. Clicking anywhere on the
// chrome (not the editor or interactive controls) focuses the editor without
// cancelling in-editor text selection.

import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";
import { useComposerInternals } from "./internals";
import { useComposerContextStore } from "./store";

export type ComposerContainerProps = PrimitiveProps<"div">;

export const ComposerContainer = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerContainerProps) => {
  const store = useComposerContextStore();
  const { attachContainer } = useComposerInternals();

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // The editor and interactive controls own their mouse behavior. Calling
    // preventDefault on a mousedown inside the editable area would cancel the
    // browser's text-selection drag, so only hijack focus when the click lands
    // on the surrounding chrome.
    if (target.closest("button, a, input, [data-composer-editor]")) {
      return;
    }

    event.preventDefault();
    store.controller.ensureFocus();
  };

  return useRenderElement(
    "div",
    { className, render, style },
    {
      // Register the element so Composer.Popover can observe it for repositioning,
      // and so Root measures it for --composer-container-*.
      ref: [store.containerRef, attachContainer],
      // No role/tabIndex: the chrome is a mouse-only focus passthrough, not a
      // control — keyboard users tab straight to the editor, and an unnamed
      // focusable "button" would only add a broken tab stop.
      props: [
        {
          "data-composer-container": "",
          onMouseDown: handleMouseDown,
        },
        elementProps,
      ],
    },
  );
};
