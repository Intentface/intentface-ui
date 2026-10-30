"use client";

import { Message } from "@intentface/ui/message";
import { Thread } from "@intentface/ui/thread";

const MESSAGES = [
  { id: "1", role: "user", text: "What does Message actually render?" },
  {
    id: "2",
    role: "assistant",
    text: "A div with data-role, data-last and data-error on it, plus whatever you put inside. No bubble, no avatar, no alignment.",
  },
  { id: "3", role: "user", text: "So the bubble is mine?" },
  {
    id: "4",
    role: "assistant",
    text: "Entirely. Read data-role through a group and style the two sides differently — that's the whole mechanism.",
  },
];

// Stage 2 — the same thread, with each row now a Message that reports its role.
// autoScroll="bottom" reserves no space for the newest row, so the rows need no Message.Turn
// wrapper yet. Stage 3 groups them into turns and uses the default `follow`.
export const MessagesStage = () => (
  <div className="h-[280px] w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.05)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:bg-zinc-900">
    <Thread.Root autoScroll="bottom" className="relative flex h-full w-full overflow-hidden">
      <Thread.Viewport className="h-full w-full overflow-x-hidden overflow-y-auto outline-none [overflow-anchor:auto]">
        <Thread.Content className="mx-auto flex w-full flex-col gap-4 p-4">
          {MESSAGES.map((message, index) => (
            <Message.Root
              key={message.id}
              role={message.role}
              isLast={index === MESSAGES.length - 1}
              className="group flex w-full flex-col gap-1.5 data-[role=user]:items-end"
            >
              {/* data-role sits on Root, so the bubble reads it through the group. */}
              <Message.Text className="text-sm text-zinc-700 leading-6 group-data-[role=user]:max-w-[80%] group-data-[role=user]:rounded-[20px] group-data-[role=user]:bg-white group-data-[role=user]:px-3.5 group-data-[role=user]:py-1.5 group-data-[role=user]:text-zinc-900 group-data-[role=user]:shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.04)] dark:text-zinc-300 dark:group-data-[role=user]:bg-zinc-800 dark:group-data-[role=user]:text-zinc-100 dark:group-data-[role=user]:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16)]">
                {message.text}
              </Message.Text>
            </Message.Root>
          ))}
        </Thread.Content>
      </Thread.Viewport>
    </Thread.Root>
  </div>
);
