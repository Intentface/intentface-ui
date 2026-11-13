"use client";

// Composer.Placeholder — the textarea's empty-state overlay content. Renders a
// plain element with a part attribute; it carries no styling. Rotating through
// several placeholders (and any crossfade) is a presentation concern and lives
// in the styled layer, not here.

import type { ReactNode } from "react";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";

export type ComposerPlaceholderProps = Omit<PrimitiveProps<"div">, "children"> &
  ({ placeholder: string; children?: never } | { placeholder?: never; children: ReactNode });

/**
 * The placeholder's content, placed as Composer.Textarea's child. The textarea renders it inside
 * its overlay, which already starts where the caret does, so it takes a color only.
 */
export const ComposerPlaceholder = ({
  placeholder,
  children,
  className,
  render,
  style,
  ...elementProps
}: ComposerPlaceholderProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    {
      props: [
        { "data-composer-placeholder-text": "", children: placeholder ?? children },
        elementProps,
      ],
    },
  );
