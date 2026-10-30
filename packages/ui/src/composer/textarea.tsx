"use client";

// Composer.Textarea — the editor surface: a hand-rolled contenteditable over
// the flat segment engine (useComposerEditor). Acts like a native textarea
// with atomic mention chips: native typing/IME, form participation via a
// hidden input mirror, and the same data-attribute contract as always
// (data-composer-editor="", data-command-badge, data-mention-chip). No
// styling crosses this boundary.
//
// The editable div renders with no JSX children — the engine owns its DOM;
// React never reconciles inside it. The inline white-space styles are load-
// bearing, not cosmetic: without break-spaces, the browser corrupts
// consecutive spaces to NBSP and the model drifts from what's on screen.

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { ChipData } from "../chip-markdown";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";
import type { ComposerSubmitOn } from "./keyboard";
import { useComposer, useComposerContextStore } from "./store";
import { useComposerEditor } from "./use-composer-editor";

export type ComposerTextareaState = {
  /** Present as data-disabled while the editor is non-editable. */
  disabled: boolean;
  /** Present as data-filled while the editor has content. */
  filled: boolean;
};

export type ComposerTextareaProps = Omit<
  PrimitiveProps<"div", ComposerTextareaState>,
  "children"
> & {
  value?: string;
  onValueChange?: (text: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Native-textarea-style placeholder string. For rich placeholder content, pass children instead (children win when both are set). */
  placeholder?: string;
  /** Which Enter chord sends the message; the other inserts a soft break. Consider pairing "shift-enter" with enterKeyHint="enter". */
  submitOn?: ComposerSubmitOn;
  /** Logical-length cap: one per character, one per chip. IME input is capped at composition commit. */
  maxLength?: number;
  /** Native form validation via the hidden input — blocks empty submits. */
  required?: boolean;
  /** Mirrors the serialized text (chips as chip-markdown) into FormData. */
  name?: string;
  spellCheck?: boolean;
  autoCapitalize?: string;
  enterKeyHint?: HTMLAttributes<HTMLElement>["enterKeyHint"];
  inputMode?: HTMLAttributes<HTMLElement>["inputMode"];
  dir?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** Custom renderer for committed chips in the editor. Defaults to a label-only Chip. */
  renderChip?: (chip: ChipData) => ReactNode;
  /** Placeholder overlay content, shown while the editor is empty. */
  children?: ReactNode;
};

// Focusable-but-invisible (not display:none — Chrome refuses to submit forms
// whose invalid control can't be focused for the validation bubble).
const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  border: 0,
};

const ignoreInput = () => {};

export const ComposerTextarea = ({
  value,
  onValueChange,
  className,
  render,
  style,
  disabled = false,
  autoFocus = false,
  placeholder,
  submitOn,
  maxLength,
  required = false,
  name,
  spellCheck = false,
  autoCapitalize,
  enterKeyHint,
  inputMode,
  dir,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  // Interactive callbacks route to the editable element (not the wrapper),
  // native-textarea style: they run before the engine, and preventDefault in
  // onKeyDown/onPaste/onCopy/onCut overrides the engine's handling.
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  onPaste,
  onCopy,
  onCut,
  renderChip,
  children,
  ...elementProps
}: ComposerTextareaProps) => {
  const store = useComposerContextStore();
  // Combobox wiring: expanded state and the highlighted option's id flow from
  // the store mirrors the command machinery already maintains.
  const commandsActive = useComposer((composer) => composer.commands.active);
  const activeOptionId = useComposer((composer) => composer.commands.activeOptionId);
  const { attachRoot, editableProps, chipPortals, hasContent, isComposing, serializedText } =
    useComposerEditor({
      disabled,
      autoFocus,
      submitOn,
      maxLength,
      value,
      onValueChange,
      renderChip,
      onFocus,
      onBlur,
      onKeyDown,
      onKeyUp,
      onPaste,
      onCopy,
      onCut,
    });

  const editorContent = (
    // Relative wrapper so the placeholder overlay sizes to the editable, not
    // the outer slot (which may carry padding/scroll from the styled layer).
    <div style={{ position: "relative" }}>
      <div
        ref={attachRoot}
        // contenteditable="true" is load-bearing: the store's ask-user event
        // scoping and the container's click-passthrough both key off it.
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        // contenteditable is natively focusable; the explicit tabIndex keeps a
        // disabled editor out of the tab order like a native disabled textarea.
        tabIndex={disabled ? -1 : 0}
        aria-multiline="true"
        aria-placeholder={placeholder}
        aria-disabled={disabled || undefined}
        aria-required={required || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        // Combobox wiring, textbox flavor: ARIA 1.2 forbids aria-expanded on
        // textbox and aria-multiline on combobox — for a multiline chat field
        // multiline wins, so the popup announces through haspopup + controls +
        // live activedescendant narration instead (the deliberate deviation is
        // documented in composer.mdx). The popup is portaled to <body>, so
        // these references are the ONLY field↔list association AT perceives.
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls={commandsActive ? store.listboxId : undefined}
        aria-activedescendant={activeOptionId ?? undefined}
        data-composer-editor=""
        spellCheck={spellCheck}
        autoCapitalize={autoCapitalize}
        enterKeyHint={enterKeyHint}
        inputMode={inputMode}
        dir={dir}
        style={{ whiteSpace: "break-spaces", overflowWrap: "break-word" }}
        {...editableProps}
      />
      {/* Hidden during composition too: the browser paints marked text before
          any model commit, so hasContent alone would lag the preview. */}
      {!hasContent && !isComposing && (children ?? placeholder) && (
        <div
          data-composer-placeholder=""
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          aria-hidden="true"
        >
          {children ?? placeholder}
        </div>
      )}
    </div>
  );

  return useRenderElement(
    "div",
    { className, render, style },
    {
      state: { disabled, filled: hasContent },
      props: [
        {
          "data-composer-textarea": "",
          children: (
            <>
              {editorContent}
              {chipPortals}
              {name != null && (
                // Not readOnly: browsers skip constraint validation on readonly
                // inputs, so `required` would never block a form submit.
                <input
                  type="text"
                  tabIndex={-1}
                  aria-hidden="true"
                  name={name}
                  required={required}
                  value={serializedText}
                  onChange={ignoreInput}
                  onFocus={() => store.controller.focus()}
                  style={visuallyHiddenStyle}
                />
              )}
            </>
          ),
        },
        elementProps,
      ],
    },
  );
};
