"use client";

import { type ChipData, encodeChipMarkdown, parseChipSegments } from "@intentface/ui/chip-markdown";
import { useState } from "react";

const FIELDS = ["label", "prefix", "value", "icon"] as const;

export const Encode = () => {
  const [chip, setChip] = useState<Required<ChipData>>({
    label: "Q3 brief [draft]",
    prefix: "doc",
    value: "reports/q3 brief.pdf",
    icon: "file",
  });
  const token = encodeChipMarkdown(chip);
  const segments = parseChipSegments(token);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((field) => (
          <label
            key={field}
            className="flex flex-col gap-1 font-medium text-xs text-zinc-500 dark:text-zinc-400"
          >
            {field}
            <input
              value={chip[field]}
              onChange={(event) => {
                const next = event.target.value;
                setChip((current) => ({ ...current, [field]: next }));
              }}
              autoComplete="off"
              spellCheck={false}
              className="h-8 rounded-lg bg-white px-2.5 font-mono font-normal text-[12.5px] text-zinc-900 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08)] outline-none focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2)]"
            />
          </label>
        ))}
      </div>
      <Output label="encodeChipMarkdown(chip)">{token}</Output>
      <Output label="parseChipSegments(token)">{JSON.stringify(segments, null, 2)}</Output>
    </div>
  );
};

const Output = ({ label, children }: { label: string; children: string }) => (
  <div className="flex flex-col gap-1">
    <span className="font-medium font-mono text-[11.5px] text-zinc-500 dark:text-zinc-400">
      {label}
    </span>
    <pre className="overflow-x-auto rounded-xl bg-zinc-50 px-4 py-3 font-mono text-[12px] text-zinc-700 leading-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:bg-white/3 dark:text-zinc-300 dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
      {children}
    </pre>
  </div>
);
