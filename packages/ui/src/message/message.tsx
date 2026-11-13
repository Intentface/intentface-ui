"use client";

// Headless message parts. Owns the role/error/last data-attribute contract,
// chip-segment text parsing (with render inversion for markdown/styled chips),
// timestamp formatting, and the text-selection subsystem. Entrance animation,
// popovers, tooltips, icons, and thumbnails belong to the styled layer.
//
// Every part supports the Base UI render prop: pass a ReactElement to swap the
// underlying element (props are merged onto it), or a function `(props, state)`
// for full control. The root's data attributes (data-role, data-error,
// data-last) are generated from its state object, so the render callback and
// CSS consumers see the same state.

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { type ChipSegment, parseChipSegments } from "../chip-markdown";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";

// ---------------------------------------------------------------------------
// Root — data-attribute contract: data-message="", data-role, data-error,
// data-last, generated from MessageState. The selection toolbar and thread
// spacing query these.
// ---------------------------------------------------------------------------

export type MessageState = {
  /** Opaque role string; the consumer owns the concrete set. Surfaced as data-role. */
  role: string;
  /** Present as data-error when true. */
  error: boolean;
  /** Present as data-last when true. */
  last: boolean;
};

export type MessageRootProps = Omit<PrimitiveProps<"div", MessageState>, "role"> & {
  role: string;
  isLast?: boolean;
  isError?: boolean;
};

/**
 * One message's container. Reports the role and position as data attributes
 * and renders no layout of its own, so the bubble, avatar and actions around it
 * stay yours.
 * Renders a `<div>` element.
 */
export const MessageRoot = ({
  role,
  isLast = false,
  isError = false,
  className,
  render,
  style,
  ...elementProps
}: MessageRootProps) => {
  const state = useMemo<MessageState>(
    () => ({ role, error: isError, last: isLast }),
    [role, isError, isLast],
  );

  return useRenderElement(
    "div",
    { className, render, style },
    { state, props: [{ "data-message": "" }, elementProps] },
  );
};

// ---------------------------------------------------------------------------
// Structural parts
// ---------------------------------------------------------------------------

export type MessageTurnProps = PrimitiveProps<"div">;

/**
 * Wraps one exchange, a question and the replies that follow it, in one
 * element. In `"follow"` and `"jump"`, `Thread.Content` lands its last child at
 * the top, so a turn keeps the question in view while its reply streams in.
 * Renders a `<div>` element.
 */
export const MessageTurn = ({ className, render, style, ...elementProps }: MessageTurnProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-message-turn": "" }, elementProps] },
  );

// Layout/marker slots (content, actions, attachments, sources, error, stopped,
// loading) and timestamps are the consumer's — plain elements with a part attribute
// carry no mechanism, and link targets, copy, and date formatting are product
// policy. The package keeps only Root (state attributes), Turn (the grouping
// contract), and Text (chip reconstruction).

// ---------------------------------------------------------------------------
// Text — parses inline chip tokens; the styled layer supplies renderers for
// text runs (e.g. markdown) and chips (styled Chip). Defaults render plainly.
// ---------------------------------------------------------------------------

export type MessageChipSegment = Extract<ChipSegment, { type: "chip" }>;

export type MessageTextProps = Omit<PrimitiveProps<"span">, "children"> & {
  children: string;
  renderText?: (text: string, index: number) => ReactNode;
  renderChip?: (chip: MessageChipSegment, index: number) => ReactNode;
};

/**
 * Message text with inline chips reconstructed from the wire format, so a
 * stored message rebuilds its own chips with no sidecar metadata.
 * Renders a `<span>` element.
 */
export const MessageText = ({
  children,
  className,
  render,
  style,
  renderText,
  renderChip,
  ...elementProps
}: MessageTextProps) => {
  const segments = parseChipSegments(children);

  const segmentNodes = segments.map((segment, index) =>
    segment.type === "text" ? (
      <Fragment key={index}>{renderText ? renderText(segment.text, index) : segment.text}</Fragment>
    ) : (
      <Fragment key={index}>
        {renderChip ? (
          renderChip(segment, index)
        ) : (
          <span data-message-chip="">{segment.label}</span>
        )}
      </Fragment>
    ),
  );

  return useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "data-message-text": "", children: segmentNodes }, elementProps] },
  );
};

// ---------------------------------------------------------------------------
// Selection subsystem — scoped text-selection detection for a message's
// content. The styled layer anchors its own floating toolbar to the returned
// live Range.
// ---------------------------------------------------------------------------

export type MessageSelection = {
  text: string;
  range: Range;
};

export const readMessageSelection = (scope: HTMLElement): MessageSelection | null => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const text = selection.toString();
  if (text.trim().length === 0) return null;

  // Both endpoints must sit inside this message — a cross-message selection
  // has its common ancestor outside the scope and resolves to null.
  const range = selection.getRangeAt(0);
  if (!scope.contains(range.commonAncestorContainer)) return null;

  // Clone so later mutations of the live selection don't move our anchor.
  return { text, range: range.cloneRange() };
};

// Subscribe to the document selection, scoped to `scope`. Samples when the
// gesture settles (mouseup / keyup) instead of on every selectionchange drag
// tick; selectionchange only clears the value once the selection collapses.
export const useMessageSelection = (scope: HTMLElement | null): MessageSelection | null => {
  const [selection, setSelection] = useState<MessageSelection | null>(null);

  useEffect(() => {
    if (!scope) return;

    const readSelection = () => setSelection(readMessageSelection(scope));
    const hideWhenCollapsed = () => {
      const current = window.getSelection();
      if (!current || current.isCollapsed) setSelection(null);
    };

    document.addEventListener("mouseup", readSelection);
    document.addEventListener("keyup", readSelection);
    document.addEventListener("selectionchange", hideWhenCollapsed);
    return () => {
      document.removeEventListener("mouseup", readSelection);
      document.removeEventListener("keyup", readSelection);
      document.removeEventListener("selectionchange", hideWhenCollapsed);
    };
  }, [scope]);

  return selection;
};

/**
 * Resolves the owning message's content element from an invisible anchor node
 * rendered anywhere inside the message. It returns the first
 * `[data-message-content]` inside the anchor's closest `[data-message]`. No
 * part renders that attribute, so the consumer puts it on the content element,
 * and without it `contentElement` stays null. Scoping to message-content keeps
 * the toolbar off markers, sources, and actions elsewhere in the message.
 */
export const useMessageSelectionScope = () => {
  const [contentElement, setContentElement] = useState<HTMLElement | null>(null);

  const anchorRef = useCallback((node: HTMLElement | null) => {
    const messageRoot = node?.closest<HTMLElement>("[data-message]");
    setContentElement(messageRoot?.querySelector<HTMLElement>("[data-message-content]") ?? null);
  }, []);

  return { anchorRef, contentElement };
};

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------
