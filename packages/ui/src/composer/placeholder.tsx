"use client";

// Composer.Placeholder — rich or animated placeholder content for the custom
// path. It overlays the editable and gates itself on the editor's state, so it
// shows only while the editor is empty and not composing. A plain string hint
// belongs on Composer.Textarea's `placeholder` prop instead. Beyond the overlay
// position it carries no styling; rotation and crossfades are a presentation
// concern for the styled layer.

import type { CSSProperties, ReactNode } from "react";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";
import { useComposerTextareaState } from "./textarea-context";

export type ComposerPlaceholderState = {
  /** Present as data-hidden while the placeholder would be hidden. Only visible with keepMounted. */
  hidden: boolean;
};

export type ComposerPlaceholderProps = Omit<
  PrimitiveProps<"div", ComposerPlaceholderState>,
  "children"
> & {
  children: ReactNode;
  /** Keep rendering while the editor has content or composes, marked data-hidden. Default false. */
  keepMounted?: boolean;
};

const overlayStyle: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };

export const ComposerPlaceholder = ({
  children,
  keepMounted = false,
  className,
  render,
  style,
  ...elementProps
}: ComposerPlaceholderProps) => {
  const { filled, composing } = useComposerTextareaState("Placeholder");
  const hidden = filled || composing;

  return useRenderElement(
    "div",
    { className, render, style },
    {
      enabled: !hidden || keepMounted,
      state: { hidden },
      props: [
        {
          "data-composer-placeholder": "",
          "aria-hidden": true,
          style: overlayStyle,
          children,
        },
        elementProps,
      ],
    },
  );
};
