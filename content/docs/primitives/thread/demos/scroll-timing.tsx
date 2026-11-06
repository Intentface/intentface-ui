"use client";

import { spring } from "motion";
import { type CSSProperties, useState } from "react";
import { type Exchange, ModeSwitch, StreamedChat, useStreamedChat } from "./streamed-chat";

const SEED: Exchange[] = [
  {
    id: "1",
    question: "Why does my list re-render on every keystroke?",
    answer:
      "Because the parent holding the input state re-renders, and every child re-renders with it unless something stops the cascade.",
  },
];

// Each preset is plain CSS on the root. Static timings are Tailwind classes;
// the spring is computed by Motion, so it goes through `style`.
const PRESETS = {
  native: { className: "", style: {}, caption: "No timing set: the browser's own smooth scroll." },
  snappy: {
    className: "[--thread-scroll:250ms_cubic-bezier(0.2,0.8,0.2,1)]",
    style: {},
    caption: "A short ease-out for every scroll.",
  },
  spring: {
    className: "",
    // bounce 0: an overshoot past the bottom is clamped by the scroller.
    style: { "--thread-scroll": String(spring(0.6, 0)) },
    caption: "Motion's spring(), as a linear() easing.",
  },
  paced: {
    className: "[--thread-scroll-speed:1200] [--thread-scroll-duration:700ms]",
    style: {},
    caption: "1200px/s, capped at 700ms: short scrolls are quick.",
  },
  slow: {
    className: "[--thread-scroll:5s_ease-in-out]",
    style: {},
    caption: "A 5s land: the reply streams in while it is still landing.",
  },
} satisfies Record<string, { className: string; style: object; caption: string }>;

type Preset = keyof typeof PRESETS;

const REPLY =
  "Memoisation compares props, so the comparison itself has to be cheaper than the render you are avoiding. That is usually true for a list and rarely true for a single row. Measure first: the profiler shows which renders are worth skipping, and which ones were never the problem. Then memoise the expensive subtree, keep its props stable, and leave the cheap rows alone.";

/*
 * Scroll timing, set from CSS.
 *
 * With no timing, smooth scrolls are the browser's own. Set `--thread-scroll`
 * (or its longhands, or a speed) on the root and the thread animates them
 * itself, and pins the follow. Every preset times the landing; the slow one
 * shows a reply streaming in while the landing is still under way. Scroll by
 * hand at any point and the animation stops.
 */
export const ScrollTiming = () => {
  const [preset, setPreset] = useState<Preset>("spring");
  // The reply starts a beat after the send, once the landing is under way.
  const chat = useStreamedChat({ seed: SEED, reply: REPLY, firstWordAfter: 300, wordInterval: 50 });
  const { className, style, caption } = PRESETS[preset];

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <ModeSwitch
        options={Object.keys(PRESETS) as Preset[]}
        value={preset}
        onChange={(next) => {
          setPreset(next);
          chat.reset();
        }}
      />
      <StreamedChat
        key={preset}
        chat={chat}
        autoScroll="follow"
        style={style as CSSProperties}
        className={className}
      />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">{caption}</p>
    </div>
  );
};
