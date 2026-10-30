"use client";

import { Composer, type ComposerSubmitData } from "@intentface/ui/composer";
import { Message } from "@intentface/ui/message";
import { Thread, useThread } from "@intentface/ui/thread";
import { ArrowDown, ArrowUp } from "@keyline-icons/react";
import { useState } from "react";

type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

const INITIAL: ChatMessage[] = [
  { id: "1", role: "user", text: "What does Composer.Root render?" },
  {
    id: "2",
    role: "assistant",
    text: "A form. Enter submits it, and onSubmit receives a ComposerSubmitData describing what was sent.",
  },
  { id: "3", role: "user", text: "Does it clear itself afterwards?" },
  {
    id: "4",
    role: "assistant",
    text: "Yes, once your handler runs. Anything you want to keep — the text, the files — is already in the data you were handed.",
  },
  { id: "5", role: "user", text: "Can I stop an empty message from sending?" },
  {
    id: "6",
    role: "assistant",
    text: "Check the text in onSubmit and return early, the way this demo does.",
  },
  { id: "7", role: "user", text: "Where does the composer put its reply?" },
  {
    id: "8",
    role: "assistant",
    text: "Nowhere — onSubmit hands you the text and you decide. Here it just appends to local state.",
  },
];

// A turn is a user message and whatever answers it, so the newest one lands
// whole — the primitive puts the reserve on the last child.
const toTurns = (messages: ChatMessage[]) =>
  messages.reduce<ChatMessage[][]>((turns, message) => {
    const current = turns.at(-1);
    if (message.role === "user" || !current) turns.push([message]);
    else current.push(message);
    return turns;
  }, []);

// Stage 3 — a docked composer appending to local state. Thread measures the
// dock and publishes the reserve as --thread-dock-inset. Scroll up and
// the button above the composer brings you back to the latest turn.
export const ComposerStage = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL);

  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind !== "message" || !data.text.trim()) return;
    setMessages((current) => [
      ...current,
      { id: `${current.length}`, role: "user", text: data.text },
    ]);
  };

  return (
    <div className="h-[400px] w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.05)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:bg-zinc-900">
      <Thread.Root className="relative flex h-full w-full overflow-hidden">
        {/* A fade over the pt-4 below, which is the gap a landed turn leaves at the top. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-1 h-4 bg-linear-to-b from-white to-transparent dark:from-zinc-900"
        />
        <Thread.Viewport className="h-full w-full overflow-x-hidden overflow-y-auto outline-none [overflow-anchor:auto]">
          <div className="relative flex min-h-full w-full flex-col items-center pt-4 pb-(--thread-dock-inset)">
            <Thread.Content className="mx-auto flex min-h-full w-full flex-col gap-4 px-4">
              {toTurns(messages).map((turn) => (
                <Message.Turn key={turn[0].id} className="flex flex-col gap-4">
                  {turn.map((message) => (
                    <Message.Root
                      key={message.id}
                      role={message.role}
                      isLast={message.id === messages.at(-1)?.id}
                      className="group flex w-full flex-col gap-1.5 data-[role=user]:items-end"
                    >
                      <Message.Text className="text-sm text-zinc-700 leading-6 group-data-[role=user]:max-w-[80%] group-data-[role=user]:rounded-[20px] group-data-[role=user]:bg-white group-data-[role=user]:px-3.5 group-data-[role=user]:py-1.5 group-data-[role=user]:text-zinc-900 group-data-[role=user]:shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.04)] dark:text-zinc-300 dark:group-data-[role=user]:bg-zinc-800 dark:group-data-[role=user]:text-zinc-100 dark:group-data-[role=user]:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16)]">
                        {message.text}
                      </Message.Text>
                    </Message.Root>
                  ))}
                </Message.Turn>
              ))}
            </Thread.Content>
          </div>
        </Thread.Viewport>
        <Thread.Composer className="z-2 w-full">
          <div className="relative flex w-full flex-col items-center px-4 pb-4">
            <ScrollButton />
            <Composer.Root onSubmit={handleSubmit} className="flex w-full flex-col">
              <Composer.Container className="cursor-text rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.22)]">
                <Composer.Textarea className="max-h-32 min-h-12 overflow-y-auto px-2.5 pt-2.5 text-sm text-zinc-900 dark:text-zinc-100 **:data-composer-editor:w-full **:data-composer-editor:max-w-none **:data-composer-editor:leading-6 [&_[data-composer-editor]:focus]:outline-none">
                  <Composer.Placeholder
                    placeholder="Send a message…"
                    className="text-zinc-400 leading-6 dark:text-zinc-500"
                  />
                </Composer.Textarea>
                <Composer.Actions className="flex h-12 items-center justify-end px-2.5">
                  <Composer.Submit className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-[#0169cc] bg-linear-to-b from-[oklch(57.2%_0.166_253.2)] to-[oklch(52.9%_0.173_255)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_0_0_1px_oklch(46.5%_0.146_254.8),0_1px_2px_rgb(1_105_204/0.35)] transition-opacity focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40">
                    <ArrowUp className="size-[15px]" />
                  </Composer.Submit>
                </Composer.Actions>
              </Composer.Container>
            </Composer.Root>
          </div>
        </Thread.Composer>
      </Thread.Root>
    </div>
  );
};

// useThread exposes the scroll state the viewport tracks; the button is yours.
const ScrollButton = () => {
  const { isAtBottom, scrollToBottom } = useThread();

  if (isAtBottom) return null;

  return (
    <button
      type="button"
      onClick={() => scrollToBottom()}
      aria-label="Scroll to latest"
      className="absolute -top-10 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white bg-linear-to-b from-white to-[#fdfdfd] text-zinc-500 shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] transition-colors hover:from-[#fafafa] hover:to-[#f6f6f6] hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:text-zinc-400 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:hover:from-[#38383b] dark:hover:to-[#313134] dark:hover:text-zinc-100"
    >
      <ArrowDown className="size-[15px]" />
    </button>
  );
};
