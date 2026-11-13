"use client";

import { type ChipSegment, parseChipSegments } from "@intentface/ui/chip-markdown";
import { useState } from "react";

const TEXT =
  "Compare [pricing.tsx](chip:file:src%2Fapp%2Fpricing.tsx?icon=file) with " +
  "[the Q3 brief \\[draft\\]](chip:doc:q3-brief) and the [changelog](https://example.com/changelog).";

const toPlainText = (segments: ChipSegment[]) =>
  segments.map((segment) => (segment.type === "chip" ? segment.label : segment.text)).join("");

export const Parse = () => {
  const [text, setText] = useState(TEXT);
  const segments = parseChipSegments(text);

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <textarea
        aria-label="Message text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        spellCheck={false}
        className="w-full resize-none rounded-xl bg-white px-3.5 py-2.5 font-mono text-[12.5px] text-zinc-900 leading-5 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] outline-none focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2)]"
      />
      <p className="text-sm text-zinc-700 leading-6 dark:text-zinc-300">
        <span className="mr-2 font-medium text-xs text-zinc-500 dark:text-zinc-400">
          Plain text
        </span>
        {toPlainText(segments)}
      </p>
      <pre className="max-h-72 overflow-auto rounded-xl bg-zinc-50 px-4 py-3 font-mono text-[12px] text-zinc-700 leading-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:bg-white/3 dark:text-zinc-300 dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
        {JSON.stringify(segments, null, 2)}
      </pre>
    </div>
  );
};
