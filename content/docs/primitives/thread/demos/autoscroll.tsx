"use client";

import { useState } from "react";
import { type Exchange, ModeSwitch, StreamedChat, useStreamedChat } from "./streamed-chat";

const SEED: Exchange[] = [
  {
    id: "1",
    question: "Why does my list re-render on every keystroke?",
    answer:
      "Because the parent holding the input state re-renders, and every child re-renders with it unless something stops the cascade.",
  },
  {
    id: "2",
    question: "Can I just memo the list?",
    answer:
      "You can, but only if its props keep reference identity. A fresh array or an inline callback defeats it silently.",
  },
];

const MODES = ["follow", "bottom", "jump", "off"] as const;
type Mode = (typeof MODES)[number];

const CAPTIONS: Record<Mode, string> = {
  follow: "Newest lands at the top and the view follows the stream.",
  bottom: "Newest lands at the bottom and the view follows the stream.",
  jump: "Newest lands at the top; the view does not follow.",
  off: "A plain scroll area — no landing, no follow, no reserve.",
};

const REPLY =
  "Memoisation compares props, so the comparison itself has to be cheaper than the render you are avoiding. That is usually true for a list and rarely true for a single row.";

/*
 * The four modes, on the same transcript.
 *
 * `autoScroll` decides two things at once: where a new turn lands, and whether
 * the view keeps following while text streams into it. The composer comes
 * prefilled — send it in each mode and watch the difference. In `follow` and
 * `jump`, notice the space reserved beneath the newest turn: it is what lets the
 * turn land at the top.
 *
 * Remounting on a mode change is this demo's doing, not a requirement: the key
 * forces a fresh scroll subsystem so each mode is observed from its own
 * opening position rather than wherever the last one left the scroller.
 */
export const AutoScroll = () => {
  const [mode, setMode] = useState<Mode>("follow");
  const chat = useStreamedChat({ seed: SEED, reply: REPLY });

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <ModeSwitch
        options={MODES}
        value={mode}
        onChange={(next) => {
          setMode(next);
          chat.reset();
        }}
      />
      <StreamedChat key={mode} chat={chat} autoScroll={mode} />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">{CAPTIONS[mode]}</p>
    </div>
  );
};
