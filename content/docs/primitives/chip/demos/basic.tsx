"use client";

import { Chip } from "@intentface/ui/chip";
import { Globe } from "@keyline-icons/react";
import type { ReactElement, ReactNode } from "react";

// Chips flow inline with text. The package doesn't style them, so this demo
// tints them through its own data-variant attribute.
export const Basic = () => (
  <p className="max-w-md text-sm text-zinc-700 leading-8 dark:text-zinc-300">
    Pulled results from{" "}
    <Chip.Root data-variant="accent" className={CHIP_CLASS}>
      <Chip.Icon className="flex items-center">
        <Globe className="size-3.5" />
      </Chip.Icon>
      <Chip.Label>web-search</Chip.Label>
    </Chip.Root>{" "}
    and a{" "}
    <Chip.Root className={CHIP_CLASS} renderWithPreview={renderWithPreview}>
      <Chip.Label>document</Chip.Label>
      <Chip.Preview>Hover shows a preview panel for the referenced item.</Chip.Preview>
    </Chip.Root>{" "}
    reference, with one{" "}
    <Chip.Root data-variant="warning" className={CHIP_CLASS}>
      <Chip.Label>deprecated</Chip.Label>
    </Chip.Root>{" "}
    flag.
  </p>
);

const CHIP_CLASS =
  "mx-0.5 inline-flex h-6 items-center gap-1 rounded-full bg-white bg-linear-to-b from-white to-[#fdfdfd] px-2 align-middle font-medium text-xs text-zinc-900 shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] data-[variant=accent]:bg-[#0169cc]/10 data-[variant=accent]:bg-none data-[variant=accent]:text-[#0169cc] data-[variant=accent]:shadow-none data-[variant=warning]:bg-amber-500/12 data-[variant=warning]:bg-none data-[variant=warning]:text-amber-700 data-[variant=warning]:shadow-none dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:data-[variant=accent]:bg-[#4c9bea]/15 dark:data-[variant=accent]:text-[#4c9bea] dark:data-[variant=accent]:shadow-none dark:data-[variant=warning]:bg-amber-500/12 dark:data-[variant=warning]:text-amber-300 dark:data-[variant=warning]:shadow-none";

// Chip.Preview renders nothing on its own — Root hands you the badge and the
// preview content, and you compose whatever popup you want. This one is pure
// CSS so the demo needs no floating library.
const renderWithPreview = (badge: ReactElement, preview: ReactNode) => (
  <span className="group relative inline-block">
    {badge}
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-52 -translate-x-1/2 rounded-xl bg-white p-2.5 text-xs text-zinc-500 leading-snug opacity-0 shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-8px_rgb(0_0_0/0.16)] transition-opacity group-hover:opacity-100 dark:bg-zinc-800 dark:text-zinc-400 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.16),0_12px_32px_-8px_rgb(0_0_0/0.4)]">
      {preview}
    </span>
  </span>
);
