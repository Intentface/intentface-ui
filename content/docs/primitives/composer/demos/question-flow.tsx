"use client";

import { Composer, type ComposerQuestion, type ComposerSubmitData } from "@intentface/ui/composer";
import { ArrowUp } from "@keyline-icons/react";
import { useState } from "react";
import { Controls, Prompt } from "./question";

// Setting `questions` arms the flow and flips questions.active. Answering or
// skipping the last one fires onSubmit with { kind: "questions" } — entries
// keyed by the ids minted here, carrying option values (label fallback).
const QUESTIONS: ComposerQuestion[] = [
  {
    id: "framework",
    label: "Which framework are you deploying to?",
    options: [
      { value: "next", label: "Next.js", description: "App Router on Vercel." },
      { value: "vite", label: "Vite", description: "SPA on any static host." },
      { value: "remix", label: "Remix", description: "Full-stack on a Node server." },
    ],
  },
  {
    id: "features",
    label: "Which features do you need?",
    multiSelect: true,
    options: [
      { value: "auth", label: "Auth", description: "Sessions and sign-in." },
      { value: "database", label: "Database", description: "Persistent storage." },
      { value: "uploads", label: "File uploads", description: "Attachments and media." },
    ],
  },
  {
    id: "priority",
    label: "What matters most for this project?",
    options: [
      { value: "speed", label: "Speed", description: "Ship as fast as possible." },
      { value: "scale", label: "Scale", description: "Handle heavy traffic." },
      { value: "cost", label: "Cost", description: "Keep the bill low." },
    ],
  },
];

export const QuestionFlow = () => {
  const [questions, setQuestions] = useState<ComposerQuestion[]>(QUESTIONS);
  const [done, setDone] = useState(false);

  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind === "answers") setDone(true);
  };

  const reset = () => {
    setDone(false);
    setQuestions([...QUESTIONS]);
  };

  return (
    // Reserve height and bottom-anchor so the panel opening never shifts the page.
    <div className="flex min-h-[440px] w-full max-w-xl flex-col items-center justify-end gap-3">
      <Composer.Root
        questions={done ? undefined : questions}
        onSubmit={handleSubmit}
        className="flex w-full flex-col"
      >
        {/* anchor={false} makes the panel an in-flow block that grows the
            composer upward; the default is a portaled overlay. */}
        <Composer.Panel
          anchor={false}
          className="mb-2 overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.05)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]"
        >
          {!done && <Prompt />}
        </Composer.Panel>
        <Composer.Container className="cursor-text rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.22)]">
          <Composer.Textarea className="max-h-32 min-h-12 overflow-y-auto px-2.5 pt-2.5 text-sm text-zinc-900 dark:text-zinc-100 **:data-composer-editor:w-full **:data-composer-editor:max-w-none **:data-composer-editor:leading-6 [&_[data-composer-editor]:focus]:outline-none">
            <Composer.Placeholder
              placeholder={done ? "All set — reset to try again" : "Or type your own answer…"}
              className="text-zinc-400 leading-6 dark:text-zinc-500"
            />
          </Composer.Textarea>
          <Composer.Actions className="flex h-12 items-center justify-end gap-1.5 px-2.5">
            {done ? (
              <Composer.Submit className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-[#0169cc] bg-linear-to-b from-[oklch(57.2%_0.166_253.2)] to-[oklch(52.9%_0.173_255)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_0_0_1px_oklch(46.5%_0.146_254.8),0_1px_2px_rgb(1_105_204/0.35)] transition-opacity focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40">
                <ArrowUp className="size-[15px]" />
              </Composer.Submit>
            ) : (
              <Controls />
            )}
          </Composer.Actions>
        </Composer.Container>
      </Composer.Root>
      {/* A fixed slot: the button appearing must not push the composer up. */}
      <div className="h-8">
        {done && (
          <button
            type="button"
            onClick={reset}
            className="h-8 cursor-pointer rounded-full bg-white bg-linear-to-b from-white to-[#fdfdfd] px-3 font-medium text-[13px] text-zinc-900 shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] transition-colors hover:from-[#fafafa] hover:to-[#f6f6f6] focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:hover:from-[#38383b] dark:hover:to-[#313134]"
          >
            Reset questions
          </button>
        )}
      </div>
    </div>
  );
};
