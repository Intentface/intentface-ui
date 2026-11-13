"use client";

// Headless attachments: generic structural parts, accept matching, and the
// platform-default ingestion (a blob URL that doubles as the id — the
// browser-native way to reference a picked File; override via
// Composer.Attachments' create/destroy for upload-to-storage etc.). Policy
// (accepted types, counts, sizes), media taxonomy, send serialization, and copy
// are the consumer's. Card visuals belong to the styled layer.

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// A minimal, generic file descriptor — NOT welded to the AI SDK FilePart wire
// format. `mediaType` is a raw string (whatever the source set); categorization
// into image/pdf/file is the consumer's job in their styled layer.
export type AttachmentItem = {
  id: string;
  url: string;
  filename?: string;
  mediaType?: string;
  fileSize?: number;
};

// Structured validation reasons — the machine emits codes, never copy; the
// consumer maps codes to their own (localized) messages.
export type AttachmentErrorCode = "accept" | "max_file_size" | "max_files";

// ---------------------------------------------------------------------------
// Default ingestion — platform-native, no policy: a picked File becomes an
// item referencing it by blob URL. Overridable per composer (create/destroy).
// ---------------------------------------------------------------------------

// Every createObjectURL call mints a fresh `blob:<origin>/<uuid>`, so the URL
// is also a unique id — even for the same File added twice.
export const toAttachmentItem = (file: File): AttachmentItem => {
  const url = URL.createObjectURL(file);
  return { id: url, url, filename: file.name, mediaType: file.type, fileSize: file.size };
};

export const revokeAttachmentUrl = (item: Pick<AttachmentItem, "url">) => {
  if (item.url?.startsWith("blob:")) {
    URL.revokeObjectURL(item.url);
  }
};

export const revokeAllAttachmentUrls = (items: Pick<AttachmentItem, "url">[]) => {
  for (const item of items) {
    revokeAttachmentUrl(item);
  }
};

// ---------------------------------------------------------------------------
// Accept matching — standard HTML `accept` semantics.
// ---------------------------------------------------------------------------

export const matchesAccept = (file: File, accept: string): boolean => {
  if (!accept || accept.trim() === "") {
    return true;
  }

  const patterns = accept
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  return patterns.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return file.type.startsWith(prefix);
    }
    return file.type === pattern;
  });
};

// ---------------------------------------------------------------------------
// Structural parts
// ---------------------------------------------------------------------------

export type AttachmentsRootProps = PrimitiveProps<"div">;

/**
 * The tray container. Mount it only when there are items to show; it renders
 * no layout of its own.
 * Renders a `<div>` element.
 */
export const AttachmentsRoot = ({
  className,
  render,
  style,
  ...elementProps
}: AttachmentsRootProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-attachments": "" }, elementProps] },
  );

export type AttachmentsItemProps = PrimitiveProps<"div">;

// Generic structural slot for one attachment. It carries no media taxonomy —
// categorization (image/pdf/file, icons, thumbnails) belongs to the styled
// layer, which reads the item's raw mediaType however it wants.
/**
 * One attachment, as a structural slot with no media taxonomy of its own.
 * Read the item's `mediaType` and decide what an image or a PDF looks like.
 * Renders a `<div>` element.
 */
export const AttachmentsItem = ({
  className,
  render,
  style,
  ...elementProps
}: AttachmentsItemProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-attachments-item": "" }, elementProps] },
  );

export type AttachmentsRemoveProps = PrimitiveProps<"button"> & {
  onRemove: () => void;
  /** Names the control per item ("Remove report.pdf") — without it, N remove buttons announce identically. */
  filename?: string;
};

/**
 * The removal affordance. Named "Remove attachment" by default, or
 * "Remove {filename}" when `filename` is set, so a row of them does not
 * announce identically.
 * Renders a `<button>` element.
 */
export const AttachmentsRemove = ({
  onRemove,
  filename,
  className,
  render,
  style,
  ...elementProps
}: AttachmentsRemoveProps) =>
  useRenderElement(
    "button",
    { className, render, style },
    {
      props: [
        {
          "aria-label": filename ? `Remove ${filename}` : "Remove attachment",
          "data-attachments-remove": "",
          onClick: onRemove,
        },
        elementProps,
      ],
    },
  );

export type AttachmentsDropzoneState = {
  /** Present as data-visible while files are dragged over the scope. */
  visible: boolean;
};

export type AttachmentsDropzoneProps = PrimitiveProps<"div", AttachmentsDropzoneState> & {
  visible?: boolean;
  /**
   * Keep the dropzone mounted when not visible. It renders without
   * data-visible and is not hidden, so hide it in CSS.
   */
  keepMounted?: boolean;
  /** CSS selector to portal the dropzone into (e.g. an app shell region). */
  portalSelector?: string;
  children?: ReactNode;
};

/**
 * The drop overlay. `portalSelector` only moves where it renders (e.g. over an
 * app shell region); where files can be dropped is `Composer.Attachments`'
 * `globalDrop`, not this part.
 * Renders a `<div>` element.
 */
export const AttachmentsDropzone = ({
  visible = false,
  keepMounted = false,
  portalSelector,
  children,
  className,
  render,
  style,
  ...elementProps
}: AttachmentsDropzoneProps) => {
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  useEffect(() => {
    if (!portalSelector) return;
    setPortalTarget(document.querySelector(portalSelector));
  }, [portalSelector]);

  const content = useRenderElement(
    "div",
    { className, render, style },
    {
      enabled: visible || keepMounted,
      state: { visible },
      props: [{ "data-attachments-dropzone": "", children }, elementProps],
    },
  );

  if (!content) return null;
  if (portalTarget) return createPortal(content, portalTarget);
  return content;
};

export type AttachmentsErrorProps = PrimitiveProps<"span">;

// role="alert" (assertive): a rejected pick/drop is a user-action failure that
// should announce immediately. The copy inside stays the consumer's.
/**
 * The validation slot, as a live region: whatever appears inside announces
 * immediately. Validation emits a code, never copy, so the message is yours.
 * Renders a `<span>` element with `role="alert"`.
 */
export const AttachmentsError = ({
  className,
  render,
  style,
  ...elementProps
}: AttachmentsErrorProps) =>
  useRenderElement(
    "span",
    { className, render, style },
    { props: [{ role: "alert", "data-attachments-error": "" }, elementProps] },
  );

export type AttachmentsTriggerProps = PrimitiveProps<"button">;

/**
 * The file-picker button, named "Add attachment" by default. The package owns
 * no file input; wire this to your own.
 * Renders a `<button>` element.
 */
export const AttachmentsTrigger = ({
  className,
  render,
  style,
  ...elementProps
}: AttachmentsTriggerProps) =>
  useRenderElement(
    "button",
    { className, render, style },
    {
      // Default overridable name — the trigger is typically icon-only.
      props: [{ "aria-label": "Add attachment", "data-attachments-trigger": "" }, elementProps],
    },
  );
