"use client";

// Composer.ContextWindow / Actions / Submit. ContextWindow is content-driven
// like the panels — open (data-open / data-closed) while it has content and no
// panel is active, yielding to an active panel. Submit owns the send↔stop
// behavior via useComposerSubmit and renders a plain button — the styled layer
// applies the same hook to its own button component.

import { Children, useEffect } from "react";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";
import { openStateMapping } from "../internal/state-mappings";
import { useAsRef } from "./internals";
import { useComposer, useComposerContextStore } from "./store";

// ---------------------------------------------------------------------------
// Context window — content-driven strip, open while it has content and no panel
// is active.
// ---------------------------------------------------------------------------

export type ComposerContextWindowState = {
  /** Open (data-open) while the strip has content and no panel is active. */
  open: boolean;
};

export type ComposerContextWindowProps = PrimitiveProps<"div", ComposerContextWindowState>;

export const ComposerContextWindow = ({
  children,
  className,
  render,
  style,
  ...elementProps
}: ComposerContextWindowProps) => {
  // Yield while any native panel is active — the strip slides back out once they
  // close. (Union of the native slices; no central registry.)
  const anyPanelActive = useComposer(
    (composer) => composer.commands.active || composer.questions.active,
  );
  const hasContent = Children.toArray(children).length > 0;
  const open = hasContent && !anyPanelActive;

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { open },
      stateAttributesMapping: openStateMapping,
      props: [{ "data-composer-context-window": "", children }, elementProps],
    },
  );
};

// ---------------------------------------------------------------------------
// Actions — the trailing action row.
// ---------------------------------------------------------------------------

export type ComposerActionsProps = PrimitiveProps<"div">;

export const ComposerActions = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerActionsProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-composer-actions": "" }, elementProps] },
  );

// ---------------------------------------------------------------------------
// Submit — the send↔stop hook and the button that renders it.
// ---------------------------------------------------------------------------

export type UseComposerSubmitOptions = {
  isGenerating?: boolean;
  onStop?: () => void;
  disabled?: boolean;
};

export type ComposerSubmitState = {
  /** "button" while generating (click stops), "submit" otherwise. */
  type: "button" | "submit";
  disabled: boolean;
  isGenerating: boolean;
};

/**
 * Send↔stop behavior: auto-disables while empty or submitting, flips the
 * button type while generating, and aborts on Escape inside this composer
 * (unless something closer — the command list — already handled it).
 */
export const useComposerSubmit = ({
  isGenerating = false,
  onStop,
  disabled,
}: UseComposerSubmitOptions): ComposerSubmitState => {
  const hasContent = useComposer((composer) => composer.textarea.hasContent);
  const isSubmitting = useComposer((composer) => composer.isSubmitting);
  const attachments = useComposer((composer) => composer.attachments);

  // While generating, hand the stop to Composer.Root, which calls it on Escape.
  const store = useComposerContextStore();
  const onStopRef = useAsRef(onStop);
  // Without an onStop there is nothing to stop, so Escape stays free for surfaces around it.
  const hasOnStop = onStop !== undefined;
  useEffect(() => {
    if (!isGenerating || !hasOnStop) return;
    const stopGenerating = () => onStopRef.current?.();
    store.stopGeneratingRef.current = stopGenerating;
    return () => {
      if (store.stopGeneratingRef.current !== stopGenerating) return;
      store.stopGeneratingRef.current = null;
    };
  }, [isGenerating, hasOnStop, store]);

  const autoDisabled =
    disabled ?? ((!hasContent && attachments.items.length === 0) || isSubmitting);

  return {
    type: isGenerating ? "button" : "submit",
    disabled: isGenerating ? false : autoDisabled,
    isGenerating,
  };
};

export type ComposerSubmitButtonState = {
  /** Present as data-generating while the stop affordance is active. */
  generating: boolean;
};

export type ComposerSubmitProps = PrimitiveProps<"button", ComposerSubmitButtonState> & {
  // While generating, the button morphs into a stop control: the type flips
  // to "button" and clicking it (or pressing Escape) calls onStop instead of
  // submitting the form.
  isGenerating?: boolean;
  onStop?: () => void;
};

export const ComposerSubmit = ({
  disabled,
  isGenerating = false,
  onStop,
  onClick,
  className,
  render,
  style,
  ...elementProps
}: ComposerSubmitProps) => {
  const submit = useComposerSubmit({ isGenerating, onStop, disabled });

  return useRenderElement(
    "button",
    { className, render, style },
    {
      state: { generating: isGenerating },
      props: [
        {
          type: submit.type,
          "data-composer-submit": "",
          // Default overridable names for the (typically icon-only) morphing
          // control — both states announce, not just the stop affordance.
          "aria-label": isGenerating ? "Stop generating" : "Send message",
          disabled: submit.disabled,
          // Replaces (not chains) the consumer's onClick while generating —
          // a stop click must never fall through to submit handlers.
          onClick: isGenerating ? () => onStop?.() : onClick,
        },
        elementProps,
      ],
    },
  );
};
