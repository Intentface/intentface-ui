"use client";

import type { ChatStatus } from "@intentface/ui/types";
import { useState } from "react";

const STATUSES: ChatStatus[] = ["submitted", "streaming", "ready", "error"];

export const Status = () => {
  const [status, setStatus] = useState<ChatStatus>("submitted");
  // "submitted" lasts from the send until the first chunk. Counting it as
  // generating shows the stop button at once, not when the reply starts.
  const isGenerating = status === "submitted" || status === "streaming";

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex min-h-28 w-full flex-col justify-between gap-3 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.05)] dark:bg-zinc-900 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]">
        <Reply status={status} />
        <button
          type="button"
          onClick={() => setStatus(isGenerating ? "ready" : "submitted")}
          className="h-7 cursor-pointer self-end rounded-full bg-[#0169cc] px-3 font-medium text-[13px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_0_0_1px_oklch(46.5%_0.146_254.8),0_1px_2px_rgb(1_105_204/0.35)] focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2"
        >
          {isGenerating ? "Stop" : "Send"}
        </button>
      </div>

      <div
        role="group"
        aria-label="Status"
        className="flex items-center gap-0.5 rounded-full bg-zinc-100 p-0.5 dark:bg-white/6"
      >
        {STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className="h-7 cursor-pointer rounded-full px-3 font-mono text-[12px] text-zinc-500 transition-[color,background-color,box-shadow] hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 aria-pressed:bg-white aria-pressed:text-zinc-900 aria-pressed:shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] dark:text-zinc-400 dark:aria-pressed:bg-[#2d2d30] dark:aria-pressed:text-zinc-100 dark:hover:text-zinc-100 dark:aria-pressed:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]"
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
};

const Reply = ({ status }: { status: ChatStatus }) => {
  switch (status) {
    case "submitted":
      return (
        <p className="text-sm text-zinc-500 leading-6 motion-safe:animate-pulse dark:text-zinc-400">
          Thinking…
        </p>
      );
    case "streaming":
      return (
        <p className="text-sm text-zinc-900 leading-6 dark:text-zinc-100">
          Revenue rose 18%, from €1.20M
        </p>
      );
    case "ready":
      return (
        <p className="text-sm text-zinc-900 leading-6 dark:text-zinc-100">
          Revenue rose 18%, from €1.20M in Q2 to €1.42M in Q3.
        </p>
      );
    case "error":
      return (
        <p className="text-red-600 text-sm leading-6 dark:text-red-400">
          The request failed. Send again to retry.
        </p>
      );
  }
};
