"use client";

import { Message } from "@intentface/ui/message";
import {
  isFilePart,
  isReasoningPart,
  isSourceUrlPart,
  isTextPart,
  isToolPart,
  type MessagePart,
} from "@intentface/ui/types";
import type { UIMessage } from "ai";

const MESSAGES: UIMessage[] = [
  {
    id: "1",
    role: "user",
    parts: [
      {
        type: "file",
        mediaType: "application/pdf",
        filename: "q3-report.pdf",
        url: "https://example.com/files/q3-report.pdf",
      },
      { type: "text", text: "How did revenue change from Q2?" },
    ],
  },
  {
    id: "2",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "reasoning",
        text: "The report covers Q3 only, so look up the Q2 figure.",
        state: "done",
      },
      {
        type: "tool-searchArchive",
        toolCallId: "call_1",
        state: "output-available",
        input: { query: "Q2 revenue" },
        output: { revenue: "€1.20M" },
      },
      { type: "text", text: "Revenue rose 18%, from €1.20M in Q2 to €1.42M in Q3.", state: "done" },
      {
        type: "source-url",
        sourceId: "src_1",
        url: "https://example.com/archive/q2-report",
        title: "Q2 report",
      },
      { type: "data-usage", data: { tokens: 812 } },
    ],
  },
];

export const Parts = () => (
  <div className="flex w-full max-w-xl flex-col gap-5">
    {MESSAGES.map((message) => (
      <Message.Root key={message.id} role={message.role} className="flex flex-col gap-2">
        <span className="font-medium text-xs text-zinc-500 dark:text-zinc-400">{message.role}</span>
        {message.parts.map((part, index) => (
          // Parts carry no id, and a message only gains parts at its end, so the index is stable.
          <div key={index} className="grid grid-cols-[9.5rem_1fr] items-baseline gap-3">
            <code className="truncate font-mono text-[11.5px] text-zinc-400 dark:text-zinc-500">
              {part.type}
            </code>
            <PartView part={part} />
          </div>
        ))}
      </Message.Root>
    ))}
  </div>
);

const PartView = ({ part }: { part: MessagePart }) => {
  if (isTextPart(part)) {
    return (
      <Message.Text className="text-sm text-zinc-900 leading-6 dark:text-zinc-100">
        {part.text}
      </Message.Text>
    );
  }
  if (isReasoningPart(part)) {
    return <p className="text-sm text-zinc-500 italic leading-6 dark:text-zinc-400">{part.text}</p>;
  }
  if (isToolPart(part)) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-700 leading-6 dark:text-zinc-300">
        {part.type.slice("tool-".length)}
        <span className="rounded-full bg-zinc-100 px-2 font-mono text-[11px] text-zinc-500 leading-5 dark:bg-white/6 dark:text-zinc-400">
          {part.state}
        </span>
      </p>
    );
  }
  if (isFilePart(part)) {
    return (
      <span className="w-fit rounded-md bg-zinc-100 px-2 py-0.5 text-sm text-zinc-700 dark:bg-white/6 dark:text-zinc-300">
        {part.filename ?? part.mediaType}
      </span>
    );
  }
  if (isSourceUrlPart(part)) {
    return (
      <a
        href={part.url}
        target="_blank"
        rel="noreferrer"
        className="w-fit text-[#0169cc] text-sm underline-offset-2 hover:underline dark:text-[#4c9bea]"
      >
        {part.title ?? part.url}
      </a>
    );
  }
  return <span className="text-sm text-zinc-400 dark:text-zinc-500">Not drawn</span>;
};
