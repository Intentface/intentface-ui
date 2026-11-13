import { describe, expect, test } from "bun:test";
import {
  type Answers,
  type AskUserEvent,
  type AskUserFlow,
  compileAnswers,
  IDLE_FLOW,
  parseQuestions,
  type Questions,
  reduceAskUser,
  viewAskUser,
} from "../src/composer/ask-user-machine";

const questions: Questions = [
  { question: "Q1?", options: [{ label: "A", description: "a" }] },
  {
    question: "Q2?",
    options: [
      { label: "B", description: "b" },
      { label: "C", description: "c" },
    ],
    multiSelect: true,
  },
];

const asking = (step: number, answers: Answers = new Map()): AskUserFlow => ({
  phase: "asking",
  questions,
  step,
  answers,
});

const answered = (): AskUserFlow => ({ phase: "answered", questions, answers: new Map() });

const ANSWER_EVENTS = [
  ["toggle-option", { type: "toggle-option", label: "A" }],
  ["select-option", { type: "select-option", label: "A" }],
  ["clear-selections", { type: "clear-selections" }],
  ["continue-step", { type: "continue-step", freeText: "more" }],
  ["dismiss-step", { type: "dismiss-step" }],
  ["step-back", { type: "step-back", currentText: "" }],
  ["step-forward", { type: "step-forward", currentText: "" }],
] satisfies [string, AskUserEvent][];

describe("reduceAskUser: questions-changed", () => {
  test("a new array asks from the first step and focuses its options after a frame", () => {
    const { flow, effects } = reduceAskUser(IDLE_FLOW, { type: "questions-changed", questions });

    expect(flow).toEqual({ phase: "asking", questions, step: 0, answers: new Map() });
    expect(effects).toEqual([{ type: "focus-options", after: "frame" }]);
  });

  test("the same array again changes nothing, while asking or once answered", () => {
    for (const flow of [asking(1), answered()]) {
      const transition = reduceAskUser(flow, { type: "questions-changed", questions });
      expect(transition.flow).toBe(flow);
      expect(transition.effects).toEqual([]);
    }
  });

  test("another array asks again, even once answered", () => {
    const again: Questions = [...questions];

    const { flow } = reduceAskUser(answered(), { type: "questions-changed", questions: again });
    expect(flow).toEqual({ phase: "asking", questions: again, step: 0, answers: new Map() });
  });

  test("no questions returns to idle", () => {
    const { flow, effects } = reduceAskUser(asking(1), {
      type: "questions-changed",
      questions: null,
    });

    expect(flow).toBe(IDLE_FLOW);
    expect(effects).toEqual([]);
  });
});

describe("reduceAskUser: answering", () => {
  test("select-option on single-select advances a step and clears input", () => {
    const { flow, effects } = reduceAskUser(asking(0), { type: "select-option", label: "A" });

    expect(flow).toMatchObject({ phase: "asking", step: 1 });
    expect(viewAskUser(flow).answers.get(0)?.selected.has("A")).toBe(true);
    expect(effects).toEqual([
      { type: "clear-input" },
      { type: "reset-highlight" },
      { type: "focus-options", after: "microtask" },
    ]);
  });

  test("select-option on a multi-select step toggles without advancing", () => {
    const { flow, effects } = reduceAskUser(asking(1), { type: "select-option", label: "B" });

    expect(flow).toMatchObject({ phase: "asking", step: 1 });
    expect(effects).toEqual([]);
    expect(viewAskUser(flow).answers.get(1)?.selected.has("B")).toBe(true);
  });

  test("continue-step on the last step ends the flow and submits the compiled answers", () => {
    const start = asking(1, new Map([[0, { selected: new Set(["A"]), freeText: "" }]]));
    const toggled = reduceAskUser(start, { type: "toggle-option", label: "B" });
    const { flow, effects } = reduceAskUser(toggled.flow, {
      type: "continue-step",
      freeText: "extra context",
    });

    expect(flow.phase).toBe("answered");
    expect(effects).toEqual([
      { type: "clear-input" },
      {
        type: "submit-answers",
        answers: [
          { question: "Q1?", option: "A" },
          { question: "Q2?", options: ["B"], text: "extra context" },
        ],
      },
      { type: "focus-input" },
    ]);
  });

  test("a multi-select toggle flips membership and keeps free text", () => {
    const start = asking(1, new Map([[1, { selected: new Set<string>(), freeText: "note" }]]));
    const first = reduceAskUser(start, { type: "toggle-option", label: "B" });
    const second = reduceAskUser(first.flow, { type: "toggle-option", label: "B" });

    const entry = viewAskUser(second.flow).answers.get(1);
    expect(entry?.selected.size).toBe(0);
    expect(entry?.freeText).toBe("note");
  });

  test("dismiss-step skips the answer entirely", () => {
    const start = asking(0, new Map([[0, { selected: new Set(["A"]), freeText: "" }]]));
    const { flow } = reduceAskUser(start, { type: "dismiss-step" });

    expect(flow).toMatchObject({ phase: "asking", step: 1 });
    expect(viewAskUser(flow).answers.has(0)).toBe(false);
  });

  test("step-back preserves in-progress free text and restores the target's", () => {
    const start = asking(1, new Map([[0, { selected: new Set<string>(), freeText: "saved" }]]));
    const { flow, effects } = reduceAskUser(start, {
      type: "step-back",
      currentText: "typing on q2",
    });

    expect(flow).toMatchObject({ phase: "asking", step: 0 });
    expect(viewAskUser(flow).answers.get(1)?.freeText).toBe("typing on q2");
    expect(effects[0]).toEqual({ type: "set-input-text", text: "saved" });
  });

  test("step navigation clamps at the ends", () => {
    const first = asking(0);
    const atStart = reduceAskUser(first, { type: "step-back", currentText: "" });
    expect(atStart.flow).toBe(first);
    expect(atStart.effects).toEqual([]);

    const last = asking(1);
    const atEnd = reduceAskUser(last, { type: "step-forward", currentText: "" });
    expect(atEnd.flow).toBe(last);
    expect(atEnd.effects).toEqual([]);
  });

  test.each(ANSWER_EVENTS)(
    "%s once answered changes nothing and submits nothing",
    (_type, event) => {
      const flow = answered();
      const transition = reduceAskUser(flow, event);
      expect(transition.flow).toBe(flow);
      expect(transition.effects).toEqual([]);
    },
  );

  test.each(ANSWER_EVENTS)("%s while idle changes nothing", (_type, event) => {
    const transition = reduceAskUser(IDLE_FLOW, event);
    expect(transition.flow).toBe(IDLE_FLOW);
    expect(transition.effects).toEqual([]);
  });
});

describe("parseQuestions", () => {
  test("keeps the consumer's array", () => {
    expect(parseQuestions(questions)).toBe(questions);
  });

  test("an empty array or none is no questions", () => {
    expect(parseQuestions([])).toBeNull();
    expect(parseQuestions(undefined)).toBeNull();
    expect(parseQuestions(null)).toBeNull();
  });
});

describe("viewAskUser", () => {
  test("is active only while asking, and reports the last step", () => {
    expect(viewAskUser(asking(0))).toMatchObject({ active: true, isLastStep: false });
    expect(viewAskUser(asking(1))).toMatchObject({ active: true, isLastStep: true });
    expect(viewAskUser(IDLE_FLOW)).toMatchObject({ active: false, questions: null, step: 0 });
  });

  test("once answered, keeps the questions and reads no current question", () => {
    const view = viewAskUser(answered());

    expect(view.active).toBe(false);
    expect(view.questions).toBe(questions);
    expect(view.questions?.[view.step]).toBeUndefined();
  });
});

describe("compileAnswers", () => {
  test("unanswered questions compile to bare entries", () => {
    expect(compileAnswers(questions, new Map())).toEqual([
      { question: "Q1?" },
      { question: "Q2?" },
    ]);
  });

  test("free text on single-select compiles to text entry", () => {
    const answers: Answers = new Map([[0, { selected: new Set<string>(), freeText: " custom " }]]);
    expect(compileAnswers(questions, answers)[0]).toEqual({ question: "Q1?", text: "custom" });
  });
});
