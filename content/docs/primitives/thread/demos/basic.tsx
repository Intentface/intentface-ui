"use client";

import { Composer, type ComposerSubmitData } from "@intentface/ui/composer";
import { Message } from "@intentface/ui/message";
import { Thread, useThread } from "@intentface/ui/thread";
import { ArrowDown, ArrowUp } from "@keyline-icons/react";
import { useState } from "react";

type DemoMessage = { id: string; role: "user" | "assistant"; text: string };

const INITIAL: DemoMessage[] = [
  { id: "1", role: "user", text: "What's the difference between useMemo and useCallback?" },
  {
    id: "2",
    role: "assistant",
    text: "useMemo caches a computed value; useCallback caches a function reference. In fact useCallback(fn, deps) is just useMemo(() => fn, deps).",
  },
  { id: "3", role: "user", text: "So when do I actually need useCallback?" },
  {
    id: "4",
    role: "assistant",
    text: "Mainly when you pass a callback to a memo-wrapped child or as another hook's dependency — a fresh function each render would break their memoization. Otherwise you usually don't.",
  },
];

const REPLY = "Good question — the short answer is it depends on what you're optimizing for.";

// Thread measures its docked composer and publishes the reserve as
// --thread-dock-inset, so the scroll area never hides behind it.
// autoScroll="bottom" pins the transcript to the composer: the latest turn sits
// right above it instead of landing at the top over an empty reserve. Messages
// and composer share one centred column, narrower than the window.
export const Basic = () => {
  const [messages, setMessages] = useState<DemoMessage[]>(INITIAL);

  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind !== "message" || !data.text.trim()) return;
    setMessages((current) => [
      ...current,
      { id: `${current.length}-u`, role: "user", text: data.text },
      { id: `${current.length}-a`, role: "assistant", text: REPLY },
    ]);
  };

  return (
    <div className="h-[440px] w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.05)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:bg-zinc-900">
      <Thread.Root autoScroll="bottom" className="relative flex h-full w-full overflow-hidden">
        <Thread.Viewport className="h-full w-full overflow-x-hidden overflow-y-auto outline-none [overflow-anchor:auto]">
          <div className="relative flex min-h-full w-full flex-col items-center pt-4 pb-(--thread-dock-inset)">
            <Thread.Content className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-end gap-5 px-4">
              {messages.map((message, index) => (
                <Message.Root
                  key={message.id}
                  role={message.role}
                  isLast={index === messages.length - 1}
                  className="group flex w-full flex-col gap-1.5 data-[role=user]:items-end"
                >
                  <Message.Text className="text-sm text-zinc-700 leading-6 group-data-[role=user]:max-w-[80%] group-data-[role=user]:rounded-[20px] group-data-[role=user]:bg-white group-data-[role=user]:px-3.5 group-data-[role=user]:py-1.5 group-data-[role=user]:text-zinc-900 group-data-[role=user]:leading-6 group-data-[role=user]:shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.04)] dark:text-zinc-300 dark:group-data-[role=user]:bg-zinc-800 dark:group-data-[role=user]:text-zinc-100 dark:group-data-[role=user]:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16)]">
                    {message.text}
                  </Message.Text>
                </Message.Root>
              ))}
            </Thread.Content>
          </div>
        </Thread.Viewport>
        <Thread.Composer className="z-2 w-full">
          <div className="relative mx-auto flex w-full max-w-lg flex-col items-center px-4 pb-4">
            <ScrollButton />
            <Composer.Root onSubmit={handleSubmit} className="flex w-full flex-col">
              <Composer.Container className="cursor-text rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.22)]">
                <Composer.Textarea className="max-h-32 min-h-12 overflow-y-auto px-2.5 pt-2.5 text-sm text-zinc-900 dark:text-zinc-100 **:data-composer-editor:w-full **:data-composer-editor:max-w-none **:data-composer-editor:leading-6 [&_[data-composer-editor]:focus]:outline-none">
                  <Composer.Placeholder
                    placeholder="Ask a follow-up…"
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
      className="absolute -top-10 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white bg-linear-to-b from-white to-[#fdfdfd] shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] text-zinc-500 transition-colors hover:text-zinc-900 hover:from-[#fafafa] hover:to-[#f6f6f6] dark:hover:from-[#38383b] dark:hover:to-[#313134] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0169cc]/60 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <ArrowDown className="size-[15px]" />
    </button>
  );
};
