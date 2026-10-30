import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Composer, type ComposerStore } from "../src/composer";
import { useComposer } from "../src/composer/store";
import type { ComposerQuestion, ComposerSnapshot, ComposerSubmitData } from "../src/composer/types";

// Every composer mode owns its own editor buffer: the message a user was
// typing waits while questions run, each step keeps its own free text, and
// the message comes back, chips included, once the flow ends. Keystrokes in a
// focused editor stay typing when questions arm.

const TWO: ComposerQuestion[] = [
  {
    id: "database",
    label: "Which database?",
    options: [{ label: "PostgreSQL" }, { label: "SQLite" }],
  },
  { id: "region", label: "Which region?", options: [{ label: "EU" }, { label: "US" }] },
];

const THREE: ComposerQuestion[] = [
  ...TWO,
  { id: "tier", label: "Which tier?", options: [{ label: "Free" }, { label: "Pro" }] },
];

const Prompt = () => {
  const questions = useComposer((composer) => composer.questions);
  const question = questions.items?.[questions.step];
  if (!question) return null;
  const draft = questions.drafts.get(questions.step);

  return (
    <Composer.Question>
      <Composer.QuestionHeader>
        <Composer.QuestionLabel>{question.label}</Composer.QuestionLabel>
        <Composer.QuestionNavigation>
          <Composer.QuestionPrevious type="button" onClick={questions.goBack} />
          <Composer.QuestionNext type="button" onClick={questions.goNext} />
        </Composer.QuestionNavigation>
      </Composer.QuestionHeader>
      <Composer.QuestionOptions ref={questions.optionsRef} multiSelect={!!question.multiSelect}>
        {question.options.map((option) => (
          <Composer.QuestionOption
            key={option.label}
            value={option.label}
            selected={draft?.selected.has(option.label) ?? false}
            onSelect={() => questions.toggleOption(option.label)}
          >
            <Composer.QuestionOptionLabel>{option.label}</Composer.QuestionOptionLabel>
          </Composer.QuestionOption>
        ))}
      </Composer.QuestionOptions>
      <Composer.QuestionDismiss onClick={questions.dismissStep}>Skip</Composer.QuestionDismiss>
      <Composer.QuestionContinue>Continue</Composer.QuestionContinue>
    </Composer.Question>
  );
};

type HarnessProps = {
  store: ComposerStore;
  questions?: ComposerQuestion[];
  onSubmit?: (data: ComposerSubmitData) => void;
  value?: ComposerSnapshot;
  onValueChange?: (snapshot: ComposerSnapshot) => void;
};

const Harness = ({ store, questions, onSubmit = () => {}, value, onValueChange }: HarnessProps) => (
  <Composer.Root
    store={store}
    questions={questions}
    onSubmit={onSubmit}
    value={value}
    onValueChange={onValueChange}
  >
    <Composer.Textarea aria-label="Message" />
    <Prompt />
  </Composer.Root>
);

// activateQuestions settles focus and highlight one frame past the commit
// that mounts the options.
const flushFrames = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const editor = () => screen.getByRole("textbox", { name: "Message" });
const radio = (name: string) => screen.getByRole("radio", { name });
const type = (store: ComposerStore, text: string) => act(() => store.controller.insertText(text));
const press = (target: Element, key: string) => act(() => void fireEvent.keyDown(target, { key }));
const click = (target: Element) => act(() => void fireEvent.click(target));

const collect = () => {
  const submitted: ComposerSubmitData[] = [];
  return { submitted, onSubmit: (data: ComposerSubmitData) => void submitted.push(data) };
};

const typeMessageWithChip = (store: ComposerStore) => {
  type(store, "Ask ");
  act(() => store.controller.insertChip({ prefix: "@", value: "ada", label: "Ada" }));
  type(store, " about the schema");
  return store.controller.serialize().text;
};

describe("the message buffer around a question flow", () => {
  test("is back in the editor, chip included, after the answers go out, and is in no answer", async () => {
    const store = Composer.createStore();
    const { submitted, onSubmit } = collect();
    const { rerender } = render(<Harness store={store} onSubmit={onSubmit} />);
    const message = typeMessageWithChip(store);
    expect(message).toBe("Ask [Ada](chip:@:ada) about the schema");

    rerender(<Harness store={store} onSubmit={onSubmit} questions={TWO} />);
    await flushFrames();
    expect(store.controller.getText()).toBe("");

    press(radio("PostgreSQL"), "Enter");
    press(radio("EU"), "Enter");

    expect(submitted).toEqual([
      {
        kind: "answers",
        answers: [
          { id: "database", selected: ["PostgreSQL"] },
          { id: "region", selected: ["EU"] },
        ],
      },
    ]);
    expect(store.controller.serialize().text).toBe(message);
    expect(document.activeElement).toBe(editor());

    // A host that clears `questions` once it has the answers ends nothing twice.
    rerender(<Harness store={store} onSubmit={onSubmit} />);
    expect(store.controller.serialize().text).toBe(message);
  });

  test("is back after every step was skipped", async () => {
    const store = Composer.createStore();
    const { submitted, onSubmit } = collect();
    const { rerender } = render(<Harness store={store} onSubmit={onSubmit} />);
    const message = typeMessageWithChip(store);

    rerender(<Harness store={store} onSubmit={onSubmit} questions={TWO} />);
    await flushFrames();
    click(screen.getByRole("button", { name: "Skip" }));
    click(screen.getByRole("button", { name: "Skip" }));

    expect(submitted.map((data) => data.kind)).toEqual(["answers"]);
    expect(JSON.stringify(submitted)).not.toContain("schema");
    expect(store.controller.serialize().text).toBe(message);
  });

  test("is back when the host removes questions mid-flow, with nothing submitted", async () => {
    const store = Composer.createStore();
    const { submitted, onSubmit } = collect();
    const { rerender } = render(<Harness store={store} onSubmit={onSubmit} />);
    const message = typeMessageWithChip(store);

    rerender(<Harness store={store} onSubmit={onSubmit} questions={TWO} />);
    await flushFrames();
    press(radio("PostgreSQL"), "Enter");
    type(store, "a half-typed answer");

    rerender(<Harness store={store} onSubmit={onSubmit} />);

    expect(submitted).toEqual([]);
    expect(store.controller.serialize().text).toBe(message);
    expect(document.activeElement).toBe(editor());
  });

  test("survives new questions arriving mid-flow, which reset only the steps", async () => {
    const store = Composer.createStore();
    const { submitted, onSubmit } = collect();
    const { rerender } = render(<Harness store={store} onSubmit={onSubmit} />);
    const message = typeMessageWithChip(store);

    rerender(<Harness store={store} onSubmit={onSubmit} questions={TWO} />);
    await flushFrames();
    type(store, "typed on the first question");

    rerender(<Harness store={store} onSubmit={onSubmit} questions={[...THREE]} />);
    await flushFrames();
    expect(store.controller.getText()).toBe("");

    press(radio("PostgreSQL"), "Enter");
    press(radio("EU"), "Enter");
    press(radio("Pro"), "Enter");

    expect(JSON.stringify(submitted)).not.toContain("first question");
    expect(submitted[0]?.kind).toBe("answers");
    expect(store.controller.serialize().text).toBe(message);
  });
});

describe("step buffers", () => {
  test("a step's free text survives Back, Next, and Continue to a step visited earlier", async () => {
    const store = Composer.createStore();
    const { submitted, onSubmit } = collect();
    render(<Harness store={store} onSubmit={onSubmit} questions={THREE} />);
    await flushFrames();
    const previous = () => screen.getByRole("button", { name: "Previous question" });
    const next = () => screen.getByRole("button", { name: "Next question" });
    const continueButton = () => screen.getByRole("button", { name: "Continue" });

    type(store, "answer one");
    click(continueButton());
    expect(store.getSnapshot().questions.step).toBe(1);
    expect(store.controller.getText()).toBe("");

    type(store, "answer two");
    click(previous());
    expect(store.controller.getText()).toBe("answer one");
    click(next());
    expect(store.controller.getText()).toBe("answer two");

    click(continueButton());
    expect(store.getSnapshot().questions.step).toBe(2);
    expect(store.controller.getText()).toBe("");
    click(previous());
    click(previous());
    expect(store.controller.getText()).toBe("answer one");

    // Continue into a step visited earlier shows what was typed there instead
    // of an empty editor.
    click(continueButton());
    expect(store.controller.getText()).toBe("answer two");
    click(continueButton());
    click(continueButton());

    expect(submitted).toEqual([
      {
        kind: "answers",
        answers: [
          { id: "database", selected: [], text: "answer one" },
          { id: "region", selected: [], text: "answer two" },
          { id: "tier", selected: [] },
        ],
      },
    ]);
  });

  test("Enter in an empty step with nothing selected does nothing; with a selection it continues", async () => {
    const store = Composer.createStore();
    const { submitted, onSubmit } = collect();
    render(<Harness store={store} onSubmit={onSubmit} questions={TWO} />);
    await flushFrames();
    act(() => editor().focus());

    const notPrevented = fireEvent.keyDown(editor(), { key: "Enter" });
    expect(notPrevented).toBe(false);
    expect(store.getSnapshot().questions.step).toBe(0);
    expect(submitted).toEqual([]);

    // Whitespace alone is no answer either: a Space typed before Enter must
    // not turn Enter into a skip.
    type(store, "  ");
    expect(fireEvent.keyDown(editor(), { key: "Enter" })).toBe(false);
    expect(store.getSnapshot().questions.step).toBe(0);

    click(radio("SQLite"));
    press(editor(), "Enter");
    expect(store.getSnapshot().questions.step).toBe(1);
  });
});

describe("arming", () => {
  test("keeps the caret in a focused editor, where Space and Enter pick nothing", async () => {
    const store = Composer.createStore();
    const { submitted, onSubmit } = collect();
    const { rerender } = render(<Harness store={store} onSubmit={onSubmit} />);
    type(store, "hello wor");
    act(() => editor().focus());

    rerender(<Harness store={store} onSubmit={onSubmit} questions={TWO} />);
    await flushFrames();
    expect(document.activeElement).toBe(editor());

    press(editor(), " ");
    press(editor(), "Enter");
    expect(submitted).toEqual([]);
    expect(store.getSnapshot().questions.step).toBe(0);
    expect(screen.queryAllByRole("radio", { checked: true })).toEqual([]);

    // The arrows still enter the options, at the first one.
    press(editor(), "ArrowDown");
    expect(document.activeElement).toBe(radio("PostgreSQL"));
    press(radio("PostgreSQL"), "Enter");
    press(radio("EU"), "Enter");
    expect(JSON.stringify(submitted)).not.toContain("hello wor");
    expect(store.controller.getText()).toBe("hello wor");
  });

  test("lets Space and Enter through even in the frame before the options settle", async () => {
    const store = Composer.createStore();
    const { submitted, onSubmit } = collect();
    const { rerender } = render(<Harness store={store} onSubmit={onSubmit} />);
    type(store, "hello");
    act(() => editor().focus());

    // No frame flush: the options have mounted and highlighted their first
    // item, and activateQuestions has not settled yet.
    rerender(<Harness store={store} onSubmit={onSubmit} questions={TWO} />);
    press(editor(), " ");
    press(editor(), "Enter");

    expect(store.getSnapshot().questions.step).toBe(0);
    expect(screen.queryAllByRole("radio", { checked: true })).toEqual([]);
    expect(submitted).toEqual([]);
    await flushFrames();
  });

  test("moves focus to the first option when the editor is not focused", async () => {
    const store = Composer.createStore();
    const { rerender } = render(<Harness store={store} />);
    type(store, "hello");
    expect(document.activeElement).not.toBe(editor());

    rerender(<Harness store={store} questions={TWO} />);
    await flushFrames();
    expect(document.activeElement).toBe(radio("PostgreSQL"));
  });
});

describe("a controlled composer", () => {
  const Controlled = ({
    store,
    questions,
    onSubmit,
    onChange,
    expose,
  }: {
    store: ComposerStore;
    questions?: ComposerQuestion[];
    onSubmit: (data: ComposerSubmitData) => void;
    onChange: (snapshot: ComposerSnapshot) => void;
    expose: (setValue: (snapshot: ComposerSnapshot) => void) => void;
  }) => {
    const [value, setValue] = useState<ComposerSnapshot | undefined>(undefined);
    expose(setValue);
    return (
      <Harness
        store={store}
        questions={questions}
        onSubmit={onSubmit}
        value={value}
        onValueChange={(snapshot) => {
          onChange(snapshot);
          setValue(snapshot);
        }}
      />
    );
  };

  test("never sees step text through onValueChange and shows its latest value after the flow", async () => {
    const store = Composer.createStore();
    const { submitted, onSubmit } = collect();
    const reported: ComposerSnapshot[] = [];
    let setValue: (snapshot: ComposerSnapshot) => void = () => {};
    const props = {
      store,
      onSubmit,
      onChange: (snapshot: ComposerSnapshot) => void reported.push(snapshot),
      expose: (setter: typeof setValue) => {
        setValue = setter;
      },
    };
    const { rerender } = render(<Controlled {...props} />);

    type(store, "first");
    const first = reported.at(-1);
    type(store, " second");
    expect(reported.length).toBeGreaterThan(1);
    if (!first) throw new Error("typing reported no snapshot");

    rerender(<Controlled {...props} questions={TWO} />);
    await flushFrames();
    const reportsBeforeSteps = reported.length;
    type(store, "step answer");
    expect(reported.length).toBe(reportsBeforeSteps);

    // The host's value changes mid-flow: the editor keeps showing the step.
    act(() => setValue(first));
    expect(store.controller.getText()).toBe("step answer");

    click(screen.getByRole("button", { name: "Continue" }));
    press(radio("EU"), "Enter");

    expect(submitted[0]).toEqual({
      kind: "answers",
      answers: [
        { id: "database", selected: [], text: "step answer" },
        { id: "region", selected: ["EU"] },
      ],
    });
    expect(store.controller.getText()).toBe("first");
    expect(reported.length).toBeGreaterThan(reportsBeforeSteps);
  });
});
