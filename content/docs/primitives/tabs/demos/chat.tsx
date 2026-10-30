"use client";

import { Composer, type ComposerSubmitData } from "@intentface/ui/composer";
import { Message } from "@intentface/ui/message";
import { Thread } from "@intentface/ui/thread";
import { ArrowUp, Sparkles, Stop } from "@keyline-icons/react";
import type { KeyboardEvent } from "react";

export type Turn = { id: string; role: "user" | "assistant"; text: string };
export type Chat = { name: string; turns: Turn[] };

export const REPLIES = [
  "Right — and the reason is that a function is compared by identity, so a fresh one each render reads as a change.",
  "In this case, nothing: the parent only re-renders when its own state moves, and none of it does here.",
  "It depends what is downstream of it. A memo-wrapped child cares; a plain one doesn't.",
];

// Different lengths on purpose: switching tabs has to visibly change the
// panel, since that is what the dock is here to demonstrate.
export const SEEDED: Record<string, Chat> = {
  "chat-1": {
    name: "Notes",
    turns: [
      { id: "1", role: "user", text: "What's the difference between useMemo and useCallback?" },
      {
        id: "2",
        role: "assistant",
        text: "useMemo caches a computed value; useCallback caches a function reference. useCallback(fn, deps) is just useMemo(() => fn, deps).",
      },
      { id: "3", role: "user", text: "So when do I actually need useCallback?" },
      { id: "4", role: "assistant", text: REPLIES[2] as string },
    ],
  },
  "chat-2": {
    name: "Follow-up",
    turns: [
      { id: "1", role: "user", text: "Does the parent re-render when I pass a new callback?" },
      { id: "2", role: "assistant", text: REPLIES[1] as string },
    ],
  },
  "chat-3": {
    name: "Summary",
    turns: [
      { id: "1", role: "user", text: "Summarise the thread so far." },
      {
        id: "2",
        role: "assistant",
        text: "Cache values with useMemo, cache functions with useCallback, and reach for either only when something downstream is memoised.",
      },
      { id: "3", role: "user", text: "Why does identity matter for the function case?" },
      { id: "4", role: "assistant", text: REPLIES[0] as string },
      { id: "5", role: "user", text: "Got it." },
      { id: "6", role: "assistant", text: "That's the whole of it." },
    ],
  },
};

// Thread measures its docked composer and publishes the reserve as
// --thread-dock-inset, so the last message never hides behind it.
export const ChatThread = ({
  chat,
  onSend,
  generating,
  onStop,
}: {
  chat: Chat | undefined;
  onSend: (text: string) => void;
  generating: boolean;
  onStop: () => void;
}) => {
  if (!chat) return null;

  // `bottom` rather than the default `follow`: it is the one mode that reserves
  // no viewport for the last turn. In a dock this small the reserve would push
  // every earlier turn out of sight, so each chat would look like one exchange.
  // Escape in the transcript stops the reply too; the composer handles its own first.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented || !generating) return;
    event.preventDefault();
    onStop();
  };

  return (
    <Thread.Root
      autoScroll="bottom"
      onKeyDown={handleKeyDown}
      className="relative flex h-full w-full overflow-hidden"
    >
      <Thread.Viewport className="h-full w-full overflow-x-hidden overflow-y-auto outline-none [overflow-anchor:auto]">
        <div className="relative flex min-h-full w-full flex-col pt-3 pb-(--thread-dock-inset)">
          <Thread.Content className="flex w-full flex-col justify-end gap-4 px-2.5">
            {chat.turns.map((turn, index) => (
              <Message.Root
                key={turn.id}
                role={turn.role}
                isLast={index === chat.turns.length - 1}
                className="group flex w-full flex-col data-[role=user]:items-end"
              >
                <Message.Text className="text-sm text-zinc-700 leading-6 group-data-[role=user]:max-w-[80%] group-data-[role=user]:rounded-[20px] group-data-[role=user]:bg-white group-data-[role=user]:px-3.5 group-data-[role=user]:py-1.5 group-data-[role=user]:text-zinc-900 group-data-[role=user]:leading-6 group-data-[role=user]:shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.04)] dark:text-zinc-300 dark:group-data-[role=user]:bg-zinc-800 dark:group-data-[role=user]:text-zinc-100 dark:group-data-[role=user]:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16)]">
                  {turn.text}
                </Message.Text>
              </Message.Root>
            ))}
          </Thread.Content>
        </div>
      </Thread.Viewport>
      <Thread.Composer className="z-2 w-full p-1 pt-0">
        <DockComposer
          placeholder="Reply…"
          onSubmit={onSend}
          generating={generating}
          onStop={onStop}
        />
      </Thread.Composer>
    </Thread.Root>
  );
};

/**
 * A chat that does not exist yet. The one place real words survive: a draft
 * that looks like an empty chat gives no hint that sending it creates a tab.
 */
export const NewChat = ({ onStart }: { onStart: (text: string) => void }) => (
  <div className="flex h-full flex-col">
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
      <Sparkles className="size-5 text-zinc-500 dark:text-zinc-400" />
      <p className="font-medium text-[13px] text-zinc-900 dark:text-zinc-100">Ask the agent</p>
      <p className="text-[13px] text-zinc-500 leading-5 dark:text-zinc-400">
        This is a draft — it becomes a tab once you send something.
      </p>
    </div>
    <div className="shrink-0 p-1 pt-0">
      <DockComposer placeholder="Ask anything…" onSubmit={onStart} />
    </div>
  </div>
);

// The composer clears itself on submit, so the handler only has to act on the
// text. Every Composer.Root owns an isolated store — no setup beyond onSubmit.
const DockComposer = ({
  placeholder,
  onSubmit,
  generating = false,
  onStop,
}: {
  placeholder: string;
  onSubmit: (text: string) => void;
  generating?: boolean;
  onStop?: () => void;
}) => {
  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind !== "message") return;
    const text = data.text.trim();
    if (text) onSubmit(text);
  };

  return (
    <Composer.Root onSubmit={handleSubmit} className="flex w-full flex-col">
      <Composer.Container className="cursor-text rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.22)]">
        <Composer.Textarea className="max-h-32 min-h-12 overflow-y-auto px-2.5 pt-2.5 text-sm text-zinc-900 dark:text-zinc-100 **:data-composer-editor:w-full **:data-composer-editor:max-w-none **:data-composer-editor:leading-6 [&_[data-composer-editor]:focus]:outline-none">
          <Composer.Placeholder
            placeholder={placeholder}
            className="text-zinc-400 leading-6 dark:text-zinc-500"
          />
        </Composer.Textarea>
        <Composer.Actions className="flex h-12 items-center justify-end px-2.5">
          {/* While a reply is coming, the button and Escape in the composer stop it. */}
          <Composer.Submit
            isGenerating={generating}
            onStop={onStop}
            aria-label={generating ? "Stop" : "Send"}
            className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-[#0169cc] bg-linear-to-b from-[oklch(57.2%_0.166_253.2)] to-[oklch(52.9%_0.173_255)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_0_0_1px_oklch(46.5%_0.146_254.8),0_1px_2px_rgb(1_105_204/0.35)] transition-opacity focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40"
          >
            {generating ? <Stop className="size-[15px]" /> : <ArrowUp className="size-[15px]" />}
          </Composer.Submit>
        </Composer.Actions>
      </Composer.Container>
    </Composer.Root>
  );
};
