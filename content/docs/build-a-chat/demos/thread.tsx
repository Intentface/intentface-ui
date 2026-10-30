"use client";

import { Thread } from "@intentface/ui/thread";

const LINES = [
  "Thread owns the scroll container and nothing else.",
  "It tracks whether you are at the bottom, follows new content while you are, and releases the moment you scroll away.",
  "Viewport is the scrolling element. Content is the column inside it.",
  "Neither imposes width, spacing, or colour — that is all yours.",
  "Scroll this box to see the follow behaviour release.",
  "Everything below is plain text for now; messages come next.",
];

// Stage 1 — just the scroll container, filled with plain rows.
// autoScroll="bottom" reserves no space for the newest row, so the rows need no Message.Turn
// wrapper yet. Stage 3 groups them into turns and uses the default `follow`.
export const ThreadStage = () => (
  <div className="h-[280px] w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.05)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:bg-zinc-900">
    <Thread.Root autoScroll="bottom" className="relative flex h-full w-full overflow-hidden">
      <Thread.Viewport className="h-full w-full overflow-x-hidden overflow-y-auto outline-none [overflow-anchor:auto]">
        <Thread.Content className="mx-auto flex w-full flex-col gap-4 p-4">
          {LINES.map((line) => (
            <p key={line} className="text-sm text-zinc-700 leading-6 dark:text-zinc-300">
              {line}
            </p>
          ))}
        </Thread.Content>
      </Thread.Viewport>
    </Thread.Root>
  </div>
);
