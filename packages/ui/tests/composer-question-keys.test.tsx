import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AskUser } from "../src/ask-user";
import { Composer } from "../src/composer";
import { createComposerStore, useComposer } from "../src/composer/store";
import type { AskUserQuestion } from "../src/composer/types";

// Where a key was pressed decides whether the open question takes it. Each
// case presses one key on one element while the first option holds the
// highlight and the first step already has an answer, SQLite. The composer sits
// in a focusable container, as in a Base UI Popover or Dialog popup, which takes
// focus when a click lands on the composer's chrome.

const QUESTIONS: AskUserQuestion[] = [
  { question: "Which database?", options: [{ label: "PostgreSQL" }, { label: "SQLite" }] },
  { question: "Which host?", options: [{ label: "Vercel" }, { label: "Fly" }] },
];

const Question = () => {
  const askUser = useComposer((composer) => composer.askUser);
  const question = askUser.questions?.[askUser.step];
  if (!question) return null;
  return (
    <AskUser.Options ref={askUser.optionsRef}>
      {question.options.map((option) => (
        <AskUser.Option
          key={option.label}
          value={option.label}
          onSelect={() => askUser.toggleOption(option.label)}
        >
          {option.label}
        </AskUser.Option>
      ))}
    </AskUser.Options>
  );
};

const flushFrames = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const ORIGINS = {
  "the editor": () => screen.getByRole("textbox", { name: "Message" }),
  "an option": () => screen.getByRole("radio", { name: "PostgreSQL" }),
  "a button in the composer": () => screen.getByRole("button", { name: "Attach" }),
  "the page": () => document.body,
  "a container around the composer": () => screen.getByRole("dialog", { name: "Popup" }),
  "another field in the composer": () => screen.getByRole("textbox", { name: "Note" }),
};

type Origin = keyof typeof ORIGINS;

const OUTCOMES = {
  "is left alone": { prevented: false, step: 0, answer: ["SQLite"], focus: "PostgreSQL" },
  "dismisses the step": { prevented: true, step: 1, answer: null },
  "continues the step": { prevented: true, step: 1, answer: ["SQLite"] },
  "changes the step": { prevented: true, step: 1, answer: ["SQLite"] },
  "selects the option": { prevented: true, step: 1, answer: ["PostgreSQL"] },
  "moves through the options": { prevented: true, step: 0, focus: "SQLite" },
  "types the answer": { prevented: true, step: 0, focus: "Message", text: "a" },
};

type Outcome = keyof typeof OUTCOMES;

const TABLE: Record<string, Record<Origin, Outcome>> = {
  Escape: {
    "the editor": "dismisses the step",
    "an option": "dismisses the step",
    "a button in the composer": "dismisses the step",
    "the page": "dismisses the step",
    "a container around the composer": "is left alone",
    "another field in the composer": "is left alone",
  },
  ArrowDown: {
    "the editor": "moves through the options",
    "an option": "moves through the options",
    "a button in the composer": "moves through the options",
    "the page": "moves through the options",
    "a container around the composer": "moves through the options",
    "another field in the composer": "is left alone",
  },
  ArrowRight: {
    "the editor": "is left alone",
    "an option": "changes the step",
    "a button in the composer": "changes the step",
    "the page": "changes the step",
    "a container around the composer": "changes the step",
    "another field in the composer": "is left alone",
  },
  Enter: {
    "the editor": "continues the step",
    "an option": "selects the option",
    "a button in the composer": "is left alone",
    "the page": "selects the option",
    "a container around the composer": "selects the option",
    "another field in the composer": "is left alone",
  },
  " ": {
    "the editor": "is left alone",
    "an option": "selects the option",
    "a button in the composer": "is left alone",
    "the page": "selects the option",
    "a container around the composer": "selects the option",
    "another field in the composer": "is left alone",
  },
  a: {
    "the editor": "is left alone",
    "an option": "types the answer",
    "a button in the composer": "types the answer",
    "the page": "types the answer",
    "a container around the composer": "types the answer",
    "another field in the composer": "is left alone",
  },
};

const KEY_NAMES: Record<string, string> = { " ": "Space", a: "A printable key" };

const ORIGIN_NAMES: Origin[] = [
  "the editor",
  "an option",
  "a button in the composer",
  "the page",
  "a container around the composer",
  "another field in the composer",
];

const CASES = Object.entries(TABLE).flatMap(([key, row]) =>
  ORIGIN_NAMES.map((origin) => [KEY_NAMES[key] ?? key, origin, row[origin], key] as const),
);

const pressOn = async (origin: Origin, key: string) => {
  const store = createComposerStore();
  render(
    <div role="dialog" aria-label="Popup" tabIndex={-1}>
      <Composer.Root store={store} questions={QUESTIONS} onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" />
        <Question />
        <button type="button">Attach</button>
        <input aria-label="Note" />
      </Composer.Root>
    </div>,
  );
  await flushFrames();
  act(() => store.getSnapshot().askUser.toggleOption("SQLite"));

  let prevented = false;
  act(() => {
    prevented = !fireEvent.keyDown(ORIGINS[origin](), { key });
  });

  const { step, answers } = store.getSnapshot().askUser;
  const entry = answers.get(0);
  const focused = document.activeElement;
  return {
    prevented,
    step,
    answer: entry ? [...entry.selected] : null,
    focus: focused?.getAttribute("aria-label") ?? focused?.textContent,
    text: store.controller.getText(),
  };
};

describe("a key while a question is open", () => {
  test.each(CASES)("%s on %s %s", async (_keyName, origin, outcome, key) => {
    expect(await pressOn(origin, key)).toMatchObject(OUTCOMES[outcome]);
  });
});
