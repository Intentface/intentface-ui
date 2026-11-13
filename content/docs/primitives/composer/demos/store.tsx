"use client";

import { Composer, type ComposerSubmitData } from "@intentface/ui/composer";
import { ArrowUp } from "@keyline-icons/react";

// A store handle created outside the tree. The button drives the composer
// through store.controller — no context, no hook, no ref threading.
const store = Composer.createStore();

export const Store = () => {
  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind === "message") {
      console.log(data.text);
    }
  };

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3">
      <Composer.Root store={store} onSubmit={handleSubmit} className="flex w-full flex-col">
        <Composer.Container className="cursor-text rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.22)]">
          <Composer.Textarea className="max-h-32 min-h-12 overflow-y-auto px-2.5 pt-2.5 text-sm leading-6 text-zinc-900 dark:text-zinc-100 **:data-composer-editor:w-full **:data-composer-editor:max-w-none [&_[data-composer-editor]:focus]:outline-none">
            <Composer.Placeholder
              placeholder="Driven by an external store handle…"
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
      <button
        type="button"
        onClick={() => store.controller.insertText("@channel ")}
        className="h-8 cursor-pointer rounded-full bg-white bg-linear-to-b from-white to-[#fdfdfd] px-3 font-medium text-[13px] text-zinc-900 shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] transition-colors hover:from-[#fafafa] hover:to-[#f6f6f6] focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:hover:from-[#38383b] dark:hover:to-[#313134]"
      >
        Insert from outside
      </button>
    </div>
  );
};
