"use client";

import { Composer, type ComposerSubmitData } from "@intentface/ui/composer";
import { ArrowUp } from "@keyline-icons/react";

// Every <Composer.Root> owns an isolated store, so a bare composer needs no
// setup beyond an onSubmit handler.
export const Basic = () => {
  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind === "message") {
      console.log(data.text, data.files);
    }
  };

  return (
    <Composer.Root onSubmit={handleSubmit} className="flex w-full max-w-xl flex-col">
      <Composer.Container className="cursor-text rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.22)]">
        {/* Box and type go on the textarea, so the editor and the placeholder
            overlay share them and the placeholder needs only a color. The
            editable element is engine-owned and out of JSX reach, so it is
            styled through the data-composer-editor variants. */}
        <Composer.Textarea className="max-h-32 min-h-12 overflow-y-auto px-2.5 pt-2.5 text-sm leading-6 text-zinc-900 dark:text-zinc-100 **:data-composer-editor:w-full **:data-composer-editor:max-w-none [&_[data-composer-editor]:focus]:outline-none">
          <Composer.Placeholder
            placeholder="Send a message…"
            className="text-zinc-400 dark:text-zinc-500"
          />
        </Composer.Textarea>
        <Composer.Actions className="flex h-12 items-center justify-end px-2.5">
          <Composer.Submit className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-[#0169cc] bg-linear-to-b from-[oklch(57.2%_0.166_253.2)] to-[oklch(52.9%_0.173_255)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_0_0_1px_oklch(46.5%_0.146_254.8),0_1px_2px_rgb(1_105_204/0.35)] transition-opacity focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40">
            <ArrowUp className="size-[15px]" />
          </Composer.Submit>
        </Composer.Actions>
      </Composer.Container>
    </Composer.Root>
  );
};
