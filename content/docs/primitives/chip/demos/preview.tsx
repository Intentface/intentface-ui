"use client";

import { Chip } from "@intentface/ui/chip";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";

/*
 * `Chip.Preview` renders nothing itself. `renderWithPreview` hands you the
 * badge and the preview content and lets you decide what surface they go in,
 * which is the seam that keeps the package free of a floating library.
 *
 * Whatever you build there inherits the hover-card obligations: it has to open
 * on keyboard focus as well as hover, and Escape has to dismiss it. A CSS-only
 * `:hover` panel looks right and is unreachable without a pointer.
 */
export const Preview = () => (
  <p className="max-w-md text-sm text-zinc-700 leading-8 dark:text-zinc-300">
    Cited{" "}
    <Chip.Root className={chipClass} renderWithPreview={renderWithPreview}>
      <Chip.Label>rfc-1149</Chip.Label>
      <Chip.Preview>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          A Standard for the Transmission of IP Datagrams on Avian Carriers
        </span>
        <span className="mt-1 block">Network Working Group, April 1990.</span>
      </Chip.Preview>
    </Chip.Root>{" "}
    and{" "}
    <Chip.Root data-variant="accent" className={chipClass} renderWithPreview={renderWithPreview}>
      <Chip.Label>rfc-2324</Chip.Label>
      <Chip.Preview>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          Hyper Text Coffee Pot Control Protocol
        </span>
        <span className="mt-1 block">Network Working Group, April 1998.</span>
      </Chip.Preview>
    </Chip.Root>
    . Tab to a chip, or hover it.
  </p>
);

/**
 * Hover and focus both open it, Escape and blur both close it, and the panel is
 * `aria-hidden` while closed so it never reaches a screen reader out of turn.
 * A real app would reach for a positioned hover card instead of hand-rolling
 * this; the obligations are the same either way.
 */
const renderWithPreview = (badge: ReactElement, preview: ReactNode) => (
  <PreviewSurface badge={badge} preview={preview} />
);

const PreviewSurface = ({ badge, preview }: { badge: ReactElement; preview: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <span ref={host} className="relative inline-block">
      {/* A real button, not a span with a tabIndex: this is the control that
          discloses the preview, so it should be one. It carries the pointer and
          focus handlers too, which keeps every listener on an element that can
          actually receive them. */}
      <button
        type="button"
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex cursor-pointer rounded-full align-middle focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2"
      >
        {badge}
      </button>

      <span
        aria-hidden={!open}
        className={[
          "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-56 -translate-x-1/2",
          "rounded-xl bg-white p-2.5 text-left text-xs text-zinc-500 leading-snug shadow-[0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-8px_rgb(0_0_0/0.16)]",
          "transition-opacity duration-150 dark:bg-zinc-800 dark:text-zinc-400 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.07),0_0_0_1px_rgb(0_0_0/0.16),0_12px_32px_-8px_rgb(0_0_0/0.4)]",
          open ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {preview}
      </span>
    </span>
  );
};

const chipClass =
  "mx-0.5 inline-flex h-6 items-center gap-1 rounded-full bg-white bg-linear-to-b from-white to-[#fdfdfd] px-2 align-middle font-medium text-xs text-zinc-900 shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] data-[variant=accent]:bg-[#0169cc]/10 data-[variant=accent]:bg-none data-[variant=accent]:text-[#0169cc] data-[variant=accent]:shadow-none dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)] dark:data-[variant=accent]:bg-[#4c9bea]/15 dark:data-[variant=accent]:text-[#4c9bea] dark:data-[variant=accent]:shadow-none";
