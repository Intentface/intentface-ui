import { describe, expect, mock, test } from "bun:test";
import { createComposerStore } from "../src/composer/store";
import type { AskUserQuestion } from "../src/composer/types";

const QUESTIONS: AskUserQuestion[] = [
  { question: "Which database?", options: [{ label: "PostgreSQL" }, { label: "SQLite" }] },
];

const createAnsweringStore = () => {
  const store = createComposerStore();
  const onSubmit = mock();
  store.onSubmitRef.current = onSubmit;
  return { store, onSubmit };
};

describe("composer store: the question flow", () => {
  test("askUser.active turns false once the last step is answered, and the step is not answered twice", () => {
    const { store, onSubmit } = createAnsweringStore();
    store.setQuestions(QUESTIONS);

    store.getSnapshot().askUser.dismissStep();
    expect(store.getSnapshot().askUser.active).toBe(false);
    store.getSnapshot().askUser.dismissStep();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("an empty questions array asks nothing", () => {
    const store = createComposerStore();
    store.setQuestions([]);
    expect(store.getSnapshot().askUser.active).toBe(false);
  });
});
