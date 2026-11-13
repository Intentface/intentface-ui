"use client";

import type { ToolPart, ToolPartState } from "@intentface/ui/types";
import { type ReactNode, useState } from "react";

type SearchCall = ToolPart<{ query?: string }, { documents: number }>;

const CALLS: Record<ToolPartState, SearchCall> = {
  "input-streaming": {
    type: "tool-search",
    toolCallId: "call_1",
    state: "input-streaming",
    input: { query: "Q2 rev" },
  },
  "input-available": {
    type: "tool-search",
    toolCallId: "call_1",
    state: "input-available",
    input: { query: "Q2 revenue" },
  },
  "output-available": {
    type: "tool-search",
    toolCallId: "call_1",
    state: "output-available",
    input: { query: "Q2 revenue" },
    output: { documents: 3 },
  },
  "output-error": {
    type: "tool-search",
    toolCallId: "call_1",
    state: "output-error",
    input: { query: "Q2 revenue" },
    errorText: "The archive didn't answer in time.",
  },
};

const STATES: ToolPartState[] = [
  "input-streaming",
  "input-available",
  "output-available",
  "output-error",
];

export const ToolStates = () => {
  const [state, setState] = useState<ToolPartState>("input-streaming");
  const part = CALLS[state];

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex w-full flex-col gap-3">
        <ToolCall part={part} />
        <pre className="overflow-x-auto rounded-xl bg-zinc-50 px-4 py-3 font-mono text-[12px] text-zinc-700 leading-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:bg-white/3 dark:text-zinc-300 dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
          {JSON.stringify(part, null, 2)}
        </pre>
      </div>

      <div
        role="group"
        aria-label="Tool state"
        className="flex flex-wrap items-center justify-center gap-0.5 rounded-2xl bg-zinc-100 p-0.5 dark:bg-white/6"
      >
        {STATES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={state === value}
            onClick={() => setState(value)}
            className="h-7 cursor-pointer rounded-full px-3 font-mono text-[12px] text-zinc-500 transition-[color,background-color,box-shadow] hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 aria-pressed:bg-white aria-pressed:text-zinc-900 aria-pressed:shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] dark:text-zinc-400 dark:aria-pressed:bg-[#2d2d30] dark:aria-pressed:text-zinc-100 dark:hover:text-zinc-100 dark:aria-pressed:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]"
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
};

const ToolCall = ({ part }: { part: SearchCall }) => {
  const state: string = part.state;
  switch (state) {
    case "input-streaming":
      return <Row tone="pending">Searching for {part.input?.query}…</Row>;
    case "input-available":
      return <Row tone="pending">Searching the archive for {part.input?.query}</Row>;
    case "output-available":
      return <Row tone="done">Found {part.output?.documents} documents</Row>;
    case "output-error":
      return <Row tone="error">Search failed. {part.errorText}</Row>;
    default:
      return <Row tone="pending">Search is {state}</Row>;
  }
};

const Row = ({ tone, children }: { tone: "pending" | "done" | "error"; children: ReactNode }) => (
  <p
    data-tone={tone}
    className="group flex items-center gap-2 text-sm text-zinc-700 leading-6 dark:text-zinc-300"
  >
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full bg-zinc-400 group-data-[tone=done]:bg-emerald-500 group-data-[tone=error]:bg-red-500 group-data-[tone=pending]:animate-pulse motion-reduce:animate-none"
    />
    {children}
  </p>
);
