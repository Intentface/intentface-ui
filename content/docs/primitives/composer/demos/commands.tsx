"use client";

import { type CommandItemData, Composer, type ComposerSubmitData } from "@intentface/ui/composer";
import { ArrowUp } from "@keyline-icons/react";

const MENTIONS: CommandItemData[] = [
  { value: "readme", label: "README.md", description: "Project overview" },
  { value: "package", label: "package.json", description: "Dependencies and scripts" },
  { value: "composer", label: "composer.tsx", description: "The composer primitive" },
];

// Type "@" to open the list. Panel takes a callback receiving composer state,
// so the command list shows only while a prefix is active.
export const Commands = () => {
  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind === "message") {
      console.log(data.text);
    }
  };

  return (
    // Reserve height and bottom-anchor so opening the list grows the composer
    // upward instead of shifting the page.
    <div className="flex min-h-[300px] w-full max-w-xl flex-col justify-end">
      <Composer.Root
        onSubmit={handleSubmit}
        commands={{ "@": { kind: "insert", trigger: "word-boundary", items: MENTIONS } }}
        className="flex flex-col"
      >
        {/* anchor={false} makes the panel an in-flow block that grows the
            composer upward; the default is a portaled overlay. */}
        <Composer.Panel
          anchor={false}
          className="mb-2 overflow-hidden rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_4px_8px_-2px_rgb(0_0_0/0.05)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]"
        >
          {(composer) =>
            composer.commands.active ? (
              // data-empty and data-loading land on Command; the group gates
              // which child shows.
              <Composer.Command prefix="@" className="group/list flex flex-col">
                <Composer.CommandEmpty className="hidden h-8 items-center rounded-lg px-2 text-[13px] text-zinc-400 group-data-empty/list:flex dark:text-zinc-500">
                  No files found.
                </Composer.CommandEmpty>
                <Composer.CommandList className="flex max-h-56 flex-col overflow-y-auto group-data-empty/list:hidden">
                  {(item) => (
                    <Composer.CommandItem
                      value={item.value}
                      className="flex h-8 w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-2 text-[13px] outline-none data-highlighted:bg-zinc-950/5 dark:data-highlighted:bg-white/8"
                    >
                      <Composer.CommandItemLabel className="font-medium text-zinc-900 dark:text-zinc-100">
                        {item.label}
                      </Composer.CommandItemLabel>
                      {item.description && (
                        <Composer.CommandItemDescription className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                          {item.description}
                        </Composer.CommandItemDescription>
                      )}
                    </Composer.CommandItem>
                  )}
                </Composer.CommandList>
              </Composer.Command>
            ) : null
          }
        </Composer.Panel>
        <Composer.Container className="cursor-text rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.1)] dark:bg-zinc-800 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.2),0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.22)]">
          <Composer.Textarea className="max-h-32 min-h-12 overflow-y-auto px-2.5 pt-2.5 text-sm leading-6 text-zinc-900 dark:text-zinc-100 **:data-composer-editor:w-full **:data-composer-editor:max-w-none [&_[data-composer-editor]:focus]:outline-none **:data-command-badge:rounded-sm **:data-command-badge:bg-[#0169cc]/10 **:data-command-badge:px-0.5 **:data-command-badge:text-[#0169cc] **:data-command-badge:dark:bg-[#4c9bea]/15 **:data-command-badge:dark:text-[#4c9bea] **:data-command-hint:text-zinc-400 **:data-command-hint:dark:text-zinc-500">
            <Composer.Placeholder
              placeholder="Type @ to mention a file…"
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
    </div>
  );
};
