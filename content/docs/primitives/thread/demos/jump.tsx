"use client";

import { Message } from "@intentface/ui/message";
import { Thread, useThread, useThreadVisibility } from "@intentface/ui/thread";

const EXCHANGES = [
  {
    question: "How does scrollToMessage find a row?",
    answer: "By the data-message-id attribute you put on it, looked up at call time.",
  },
  {
    question: "Do rows have to be registered first?",
    answer: "No. Nothing is registered up front, so there is no wrapper part to render.",
  },
  {
    question: "What does a long transcript cost?",
    answer: "The same as a short one: rows are resolved lazily, only when you jump.",
  },
  {
    question: "How does the outline know what I'm reading?",
    answer: "useThreadVisibility reads the same attribute to report which rows are on screen.",
  },
  {
    question: "And when nothing subscribes to it?",
    answer: "Its observers are created on the first subscriber, so an unused one costs nothing.",
  },
  {
    question: "Can I align the target differently?",
    answer: "Pass align: start, center or end; this outline lands each question at the top.",
  },
  {
    question: "Does it work with streaming?",
    answer: "Yes. Jumping releases the follow, the same as scrolling away by hand.",
  },
];

// Every message is addressable; the outline jumps to questions.
const TURNS = EXCHANGES.flatMap((exchange, index) => [
  { id: `q-${index + 1}`, role: "user" as const, text: exchange.question },
  { id: `a-${index + 1}`, role: "assistant" as const, text: exchange.answer },
]);

const QUESTIONS = TURNS.filter((turn) => turn.role === "user");

/*
 * Addressing a row without registering it.
 *
 * `scrollToMessage` finds a row by the `data-message-id` attribute you put on
 * it. There is no wrapper part and no registry: rows are resolved lazily at
 * call time, so a long transcript adds no per-row setup, only the lookup.
 *
 * `useThreadVisibility` is the other half. It reads the same attribute to
 * report which rows are on screen, and it creates its observers on the first
 * subscriber — a thread that never calls it pays nothing.
 */
export const Jump = () => (
  <div className="h-80 w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.05)] dark:bg-zinc-900 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]">
    <Thread.Root autoScroll="off" className="relative flex h-full w-full overflow-hidden">
      {/* scroll-padding: a question jumped to lands 24px below the top, not flush against it. */}
      <Thread.Viewport className="h-full min-w-0 flex-1 overflow-y-auto scroll-pt-6 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0169cc]/60">
        {/* Right padding keeps the text clear of the ladder. */}
        <Thread.Content className="flex w-full flex-col gap-5 py-4 pr-12 pl-4">
          {TURNS.map((turn) => (
            <Message.Root
              key={turn.id}
              role={turn.role}
              data-message-id={turn.id}
              className="group flex w-full flex-col data-[role=user]:items-end"
            >
              <Message.Text className="text-sm text-zinc-700 leading-6 group-data-[role=user]:max-w-[80%] group-data-[role=user]:rounded-[20px] group-data-[role=user]:bg-white group-data-[role=user]:px-3.5 group-data-[role=user]:py-1.5 group-data-[role=user]:text-zinc-900 group-data-[role=user]:shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.04)] dark:text-zinc-300 dark:group-data-[role=user]:bg-zinc-800 dark:group-data-[role=user]:text-zinc-100 dark:group-data-[role=user]:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16)]">
                {turn.text}
              </Message.Text>
            </Message.Root>
          ))}
        </Thread.Content>
      </Thread.Viewport>

      {/* Inside the Root, which is how it reaches the scroll context; the
          ladder is this demo's, not a part of the package. */}
      <Ladder />
    </Thread.Root>
  </div>
);

/**
 * A Notion-style ladder on the right edge: one tick per question, the one being
 * read in ink. Hovering it (or tabbing into it) opens the outline in its place.
 */
const Ladder = () => {
  const { scrollToMessage } = useThread();
  const { currentMessageId } = useThreadVisibility();

  // A reply belongs to the question before it, so either one marks that turn.
  const currentIndex = TURNS.findIndex((turn) => turn.id === currentMessageId);
  const activeId = currentIndex === -1 ? null : TURNS[currentIndex - (currentIndex % 2)].id;

  return (
    <nav
      aria-label="Transcript outline"
      className="group/ladder absolute top-1/2 right-1.5 z-10 -translate-y-1/2"
    >
      {/* Decorative: the outline below carries the buttons. */}
      <div
        aria-hidden="true"
        className="flex flex-col items-end gap-2.5 p-2 transition-opacity group-focus-within/ladder:opacity-0 group-hover/ladder:opacity-0"
      >
        {QUESTIONS.map((question) => (
          <span
            key={question.id}
            className={[
              "h-0.5 w-4 rounded-full transition-colors",
              question.id === activeId
                ? "bg-zinc-900 dark:bg-zinc-100"
                : "bg-zinc-300 dark:bg-zinc-600",
            ].join(" ")}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute top-1/2 right-0 flex w-60 origin-right -translate-y-1/2 scale-95 flex-col gap-px rounded-xl bg-white p-1 opacity-0 shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-8px_rgb(0_0_0/0.16)] transition-[opacity,scale] duration-150 group-focus-within/ladder:pointer-events-auto group-focus-within/ladder:scale-100 group-focus-within/ladder:opacity-100 group-hover/ladder:pointer-events-auto group-hover/ladder:scale-100 group-hover/ladder:opacity-100 dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.16),0_12px_32px_-8px_rgb(0_0_0/0.4)]">
        {QUESTIONS.map((question) => (
          <button
            key={question.id}
            type="button"
            aria-current={question.id === activeId ? "true" : undefined}
            onClick={() => scrollToMessage(question.id, { align: "start" })}
            className={[
              "flex h-8 shrink-0 cursor-pointer items-center rounded-lg px-2.5 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:-outline-offset-2",
              question.id === activeId
                ? "bg-zinc-950/5 font-medium text-zinc-900 dark:bg-white/8 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/8 dark:hover:text-zinc-100",
            ].join(" ")}
          >
            <span className="truncate">{question.text}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
