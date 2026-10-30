"use client";

import { Chip } from "@intentface/ui/chip";
import { Message, type MessageChipSegment } from "@intentface/ui/message";
import { File, FileText, Wrench } from "@keyline-icons/react";

/*
 * A message whose text carries inline chip references, and the renderers that
 * turn them back into chips.
 *
 * The wire format is a markdown-shaped link: `[Label](chip:prefix:value)`, with
 * everything the chip needs riding along inside the token. That is the point —
 * a stored message reconstructs its own chips from its text alone, with no
 * sidecar array of metadata to keep in sync or migrate.
 *
 * `Message.Text` parses the tokens and calls `renderChip` for each one. What a
 * chip looks like, and whether a prefix earns a different variant, is decided
 * here at render time rather than baked into the stored text.
 */
const TEXT =
  "I compared [pricing.tsx](chip:file:src/app/pricing.tsx) against " +
  "[the Q3 brief](chip:doc:q3-brief) and pulled figures from " +
  "[web-search](chip:tool:web-search). The deprecated rate in " +
  "[legacy.ts](chip:file:src/legacy.ts) is the only mismatch.";

export const Chips = () => (
  <div className="w-full max-w-xl">
    {/* biome-ignore lint/a11y/useValidAriaRole: `role` is the message's author, not an ARIA role */}
    <Message.Root role="assistant">
      <Message.Text
        renderChip={renderChip}
        className="text-sm text-zinc-700 leading-8 dark:text-zinc-300"
      >
        {TEXT}
      </Message.Text>
    </Message.Root>
  </div>
);

/** The prefix decides the variant and the icon; neither is stored in the text. */
const renderChip = (chip: MessageChipSegment, index: number) => (
  <Chip.Root
    key={`${chip.prefix}-${chip.value}-${index}`}
    data-variant={chip.prefix === "tool" ? "accent" : "primary"}
    className="mx-0.5 inline-flex h-6 items-center gap-1 rounded-full bg-white bg-linear-to-b from-white to-[#fdfdfd] px-2 align-middle font-medium text-xs text-zinc-900 shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] data-[variant=accent]:bg-[#0169cc]/10 data-[variant=accent]:bg-none data-[variant=accent]:text-[#0169cc] data-[variant=accent]:shadow-none dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:data-[variant=accent]:bg-[#4c9bea]/15 dark:data-[variant=accent]:text-[#4c9bea] dark:data-[variant=accent]:shadow-none"
  >
    <Chip.Icon className="flex items-center">
      {chip.prefix === "file" ? (
        <File className="size-3.5" />
      ) : chip.prefix === "doc" ? (
        <FileText className="size-3.5" />
      ) : (
        <Wrench className="size-3.5" />
      )}
    </Chip.Icon>
    <Chip.Label>{chip.label}</Chip.Label>
  </Chip.Root>
);
