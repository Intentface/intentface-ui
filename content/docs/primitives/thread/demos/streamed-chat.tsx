"use client";

import { Composer, type ComposerSubmitData } from "@intentface/ui/composer";
import { Message } from "@intentface/ui/message";
import { Thread, type ThreadRootProps } from "@intentface/ui/thread";
import { ArrowUp } from "@keyline-icons/react";
import { useEffect, useRef, useState } from "react";

export type Exchange = { id: string; question: string; answer: string };

const PROMPT = "Is memoising the list enough?";

/*
 * A scripted chat. Sending appends the question and streams `reply` into it
 * word by word, so following is something you can actually watch; the composer
 * refills once the reply is done, so the next send is one click.
 */
export const useStreamedChat = ({
  seed,
  reply,
  firstWordAfter = 0,
  wordInterval = 60,
}: {
  seed: Exchange[];
  reply: string;
  /** Milliseconds from sending to the first word. */
  firstWordAfter?: number;
  /** Milliseconds between words. */
  wordInterval?: number;
}) => {
  const [exchanges, setExchanges] = useState(seed);
  const [draft, setDraft] = useState(PROMPT);
  const [streaming, setStreaming] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStreaming(false);
  };

  const later = (delay: number, run: () => void) => {
    timers.current.push(setTimeout(run, firstWordAfter + delay));
  };

  const send = (data: ComposerSubmitData) => {
    if (data.kind !== "message" || !data.text.trim() || streaming) return;
    stop();

    const id = `${Date.now()}`;
    setExchanges((current) => [...current, { id, question: data.text, answer: "" }]);
    setStreaming(true);

    const words = reply.split(" ");
    words.forEach((_, index) => {
      later(index * wordInterval, () =>
        setExchanges((current) =>
          current.map((exchange) =>
            exchange.id === id
              ? { ...exchange, answer: words.slice(0, index + 1).join(" ") }
              : exchange,
          ),
        ),
      );
    });
    later(words.length * wordInterval, () => {
      setStreaming(false);
      setDraft(PROMPT);
    });
  };

  // Back to the seed. A reply still streaming belongs to the old transcript, so
  // it stops too.
  const reset = () => {
    stop();
    setExchanges(seed);
    setDraft(PROMPT);
  };

  return { exchanges, draft, setDraft, streaming, send, reset };
};

export type StreamedChatState = ReturnType<typeof useStreamedChat>;

// The segmented control above a demo, one button per option.
export const ModeSwitch = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (option: T) => void;
}) => (
  <div className="flex flex-wrap items-center gap-0.5 self-center rounded-full bg-zinc-100 p-0.5 dark:bg-[#131315]">
    {options.map((option) => (
      <button
        key={option}
        type="button"
        aria-pressed={option === value}
        onClick={() => onChange(option)}
        className={[
          "h-7 cursor-pointer rounded-full px-3 font-medium font-mono text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0169cc]/60",
          option === value
            ? `${RAISED} text-zinc-900 dark:text-zinc-100`
            : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
        ].join(" ")}
      >
        {option}
      </button>
    ))}
  </div>
);

// The raised surface of the selected option.
const RAISED =
  "bg-white bg-linear-to-b from-white to-[#fdfdfd] shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]";

/*
 * The chat itself: a thread in a card, with the composer floating over its
 * bottom edge. Everything but `chat` goes to Thread.Root, and `className` adds
 * to its own.
 *
 * Each question and its reply share a Message.Turn, so the reserve lands on the
 * whole turn, the last child. The floating composer is measured, so the reserve
 * fills exactly the visible area.
 */
export const StreamedChat = ({
  chat,
  className,
  ...rootProps
}: Omit<ThreadRootProps, "children"> & { chat: StreamedChatState }) => (
  <div className="h-[26rem] w-full overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.05)] dark:bg-zinc-900 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]">
    <Thread.Root
      {...rootProps}
      className={[
        "relative flex h-full w-full overflow-hidden [--thread-inset-top:1rem] [--thread-composer-gap:2rem]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* A fade over the top inset, the space a landed turn leaves at the top. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-1 h-(--thread-inset-top) bg-linear-to-b from-white to-transparent dark:from-zinc-900"
      />
      <Thread.Viewport className="h-full w-full overflow-x-hidden overflow-y-auto outline-none [overflow-anchor:auto] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0169cc]/60">
        <div className="relative flex min-h-full w-full flex-col">
          <Thread.Content className="flex min-h-full w-full flex-col gap-5 px-4 pt-(--thread-inset-top) pb-(--thread-inset-bottom) [&>*:last-child]:min-h-(--thread-turn-min-height)">
            {chat.exchanges.map((exchange, index) => (
              <Message.Turn key={exchange.id} className="flex flex-col gap-5">
                {/* biome-ignore lint/a11y/useValidAriaRole: `role` is the message's author, not an ARIA role */}
                <Message.Root role="user" className="group flex w-full flex-col items-end">
                  <Message.Text className="max-w-[80%] rounded-[20px] bg-white px-3.5 py-1.5 text-sm text-zinc-900 leading-6 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.04)] dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16)]">
                    {exchange.question}
                  </Message.Text>
                </Message.Root>
                {exchange.answer && (
                  // biome-ignore lint/a11y/useValidAriaRole: `role` is the message's author, not an ARIA role
                  <Message.Root
                    role="assistant"
                    isLast={index === chat.exchanges.length - 1}
                    className="group flex w-full flex-col"
                  >
                    <Message.Text className="text-sm text-zinc-700 leading-6 dark:text-zinc-300">
                      {exchange.answer}
                    </Message.Text>
                  </Message.Root>
                )}
              </Message.Turn>
            ))}
          </Thread.Content>
        </div>
      </Thread.Viewport>
      <Thread.Composer className="absolute inset-x-0 bottom-0 z-2 w-full">
        <div className="flex w-full flex-col px-4 pb-4">
          <Composer.Root onSubmit={chat.send} className="flex w-full flex-col">
            <Composer.Container className="cursor-text rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.22)]">
              <Composer.Textarea
                value={chat.draft}
                onValueChange={chat.setDraft}
                className="max-h-32 min-h-10 overflow-y-auto px-2.5 pt-2.5 text-sm leading-6 text-zinc-900 dark:text-zinc-100 **:data-composer-editor:w-full **:data-composer-editor:max-w-none [&_[data-composer-editor]:focus]:outline-none"
              >
                <Composer.Placeholder
                  placeholder="Ask a follow-up…"
                  className="text-zinc-400 dark:text-zinc-500"
                />
              </Composer.Textarea>
              <Composer.Actions className="flex h-11 items-center justify-end px-2.5">
                <Composer.Submit
                  disabled={chat.streaming}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-[#0169cc] bg-linear-to-b from-[oklch(57.2%_0.166_253.2)] to-[oklch(52.9%_0.173_255)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_0_0_1px_oklch(46.5%_0.146_254.8),0_1px_2px_rgb(1_105_204/0.35)] transition-opacity focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40"
                >
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
