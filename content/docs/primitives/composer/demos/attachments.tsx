"use client";

import { Attachments } from "@intentface/ui/attachments";
import { Composer, type ComposerSubmitData, useComposer } from "@intentface/ui/composer";
import { ArrowUp, Paperclip, X } from "@keyline-icons/react";

// Composer.Attachments carries the policy and the hidden file input; the strip
// itself is yours. Files can be picked with the trigger or dropped on the composer.
export const AttachmentsDemo = () => {
  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind === "message") {
      console.log(data.files);
    }
  };

  return (
    // Reserve height so the strip appearing grows the composer upward.
    <div className="flex min-h-[220px] w-full max-w-xl flex-col justify-end">
      <Composer.Root onSubmit={handleSubmit} className="flex flex-col">
        <Composer.Container className="cursor-text rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.22)]">
          <Composer.Attachments accept="image/*,application/pdf" maxFiles={4}>
            <Strip />
          </Composer.Attachments>
          <Composer.Textarea className="max-h-32 min-h-12 overflow-y-auto px-2.5 pt-2.5 text-sm leading-6 text-zinc-900 dark:text-zinc-100 **:data-composer-editor:w-full **:data-composer-editor:max-w-none [&_[data-composer-editor]:focus]:outline-none">
            <Composer.Placeholder
              placeholder="Attach a file, or drag one in…"
              className="text-zinc-400 dark:text-zinc-500"
            />
          </Composer.Textarea>
          <Composer.Actions className="flex h-12 items-center justify-between px-2.5">
            <Composer.AttachmentTrigger
              aria-label="Attach a file"
              className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-white bg-linear-to-b from-white to-[#fdfdfd] text-zinc-700 shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] transition-colors hover:from-[#fafafa] hover:to-[#f6f6f6] hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:text-zinc-300 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:hover:from-[#38383b] dark:hover:to-[#313134] dark:hover:text-zinc-100"
            >
              <Paperclip className="size-[15px]" />
            </Composer.AttachmentTrigger>
            <Composer.Submit className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-[#0169cc] bg-linear-to-b from-[oklch(57.2%_0.166_253.2)] to-[oklch(52.9%_0.173_255)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_0_0_1px_oklch(46.5%_0.146_254.8),0_1px_2px_rgb(1_105_204/0.35)] transition-opacity focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40">
              <ArrowUp className="size-[15px]" />
            </Composer.Submit>
          </Composer.Actions>
        </Composer.Container>
      </Composer.Root>
    </div>
  );
};

// The store holds the items; the parts are structural slots with no opinion
// about how a file should look.
const Strip = () => {
  const attachments = useComposer((composer) => composer.attachments);

  if (attachments.items.length === 0) return null;

  return (
    <Attachments.Root className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
      {attachments.items.map((item) => (
        <Attachments.Item
          key={item.id}
          className="flex h-6 items-center gap-1.5 rounded-[7px] bg-white bg-linear-to-b from-white to-[#fdfdfd] pr-1 pl-2 shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]"
        >
          <span className="max-w-40 truncate font-medium text-xs text-zinc-900 dark:text-zinc-100">
            {item.filename ?? "file"}
          </span>
          <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
            {formatFileSize(item.fileSize)}
          </span>
          <Attachments.Remove
            onRemove={() => attachments.remove(item.id)}
            filename={item.filename}
            className="flex size-4 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-950/5 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 dark:text-zinc-500 dark:hover:bg-white/8 dark:hover:text-zinc-100"
          >
            <X className="size-[11px]" />
          </Attachments.Remove>
        </Attachments.Item>
      ))}
    </Attachments.Root>
  );
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
