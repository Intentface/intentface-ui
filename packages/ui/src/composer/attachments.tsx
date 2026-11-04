"use client";

// Composer.Attachments (headless) — the hidden file input plus the config
// sync (accept/max/global-drop) onto the store. The visible strip (items,
// dropzone, error) is presentation: the styled layer composes it from
// useComposer((c) => c.attachments) and the Attachments primitives.

import type { ChangeEvent, ReactNode } from "react";
import { type AttachmentItem, revokeAttachmentUrl, toAttachmentItem } from "../attachments";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";
import { useComposer, useComposerContextStore } from "./store";

export type ComposerAttachmentsProps = {
  // Converts a picked/dropped/pasted File into an item. Defaults to the
  // platform blob ingestion; override (with destroy) for custom ids, extra
  // fields, or upload-backed items.
  convert?: (file: File) => AttachmentItem;
  // Cleanup for a removed item, or a sent one once onSubmit has settled.
  // Defaults to revoking blob URLs.
  destroy?: (item: AttachmentItem) => void;
  // Policy — the package imposes none: accept everything, no caps.
  accept?: string;
  maxFiles?: number;
  maxFileSize?: number;
  multiple?: boolean;
  globalDrop?: boolean;
  children?: ReactNode;
};

export const ComposerAttachments = ({
  convert = toAttachmentItem,
  destroy = revokeAttachmentUrl,
  accept = "",
  maxFiles = Number.POSITIVE_INFINITY,
  maxFileSize = Number.POSITIVE_INFINITY,
  multiple = true,
  globalDrop = false,
  children,
}: ComposerAttachmentsProps) => {
  const store = useComposerContextStore();
  const attachments = useComposer((composer) => composer.attachments);

  store.attachmentConfigRef.current = { accept, maxFiles, maxFileSize, convert, destroy };
  attachments.globalDropRef.current = globalDrop;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files) {
      attachments.add(event.currentTarget.files);
    }
    event.currentTarget.value = "";
  };

  return (
    <>
      <input
        accept={accept}
        style={{ display: "none" }}
        multiple={multiple}
        onChange={handleFileChange}
        ref={attachments.fileInputRef}
        type="file"
      />
      {children}
    </>
  );
};

export type ComposerAttachmentTriggerProps = PrimitiveProps<"button">;

export const ComposerAttachmentTrigger = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerAttachmentTriggerProps) => {
  const attachments = useComposer((composer) => composer.attachments);

  return useRenderElement(
    "button",
    { className, render, style },
    {
      props: [
        {
          // Default overridable name — the trigger is typically icon-only.
          "aria-label": "Add attachment",
          "data-composer-attachment-trigger": "",
          onClick: () => attachments.openFileDialog(),
        },
        elementProps,
      ],
    },
  );
};
