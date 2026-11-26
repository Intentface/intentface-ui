import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AskUser } from "../src/ask-user";
import { Composer } from "../src/composer";
import { useComposer } from "../src/composer/store";
import type { AskUserQuestion } from "../src/composer/types";

// New questions take focus only when nothing outside the composer holds it.

const QUESTIONS: AskUserQuestion[] = [
  { question: "Which database?", options: [{ label: "PostgreSQL" }, { label: "SQLite" }] },
];

const AskUserOptions = () => {
  const askUser = useComposer((composer) => composer.askUser);
  const question = askUser.questions?.[askUser.step];
  if (!question) return null;
  return (
    <AskUser.Root>
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
    </AskUser.Root>
  );
};

const Page = ({ questions }: { questions?: AskUserQuestion[] }) => (
  <>
    <input aria-label="Event name" />
    <Composer.Root questions={questions} onSubmit={() => {}}>
      <Composer.Textarea aria-label="Message" />
      <AskUserOptions />
    </Composer.Root>
  </>
);

// The entry focus waits a frame past the commit that renders the options.
const flushFrames = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const askAfter = async (focusFirst: () => void) => {
  const { rerender } = render(<Page />);
  focusFirst();
  rerender(<Page questions={QUESTIONS} />);
  await flushFrames();
};

describe("new questions and focus", () => {
  afterEach(cleanup);

  test("leave focus in a field outside the composer", async () => {
    await askAfter(() => screen.getByRole("textbox", { name: "Event name" }).focus());

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Event name" }));
  });

  test("take focus from the composer's own text area", async () => {
    await askAfter(() => screen.getByRole("textbox", { name: "Message" }).focus());

    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "PostgreSQL" }));
  });

  test("take focus when nothing holds it", async () => {
    await askAfter(() => (document.activeElement as HTMLElement | null)?.blur());

    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "PostgreSQL" }));
  });
});
