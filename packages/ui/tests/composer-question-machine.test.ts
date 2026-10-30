import { describe, expect, test } from "bun:test";
import {
  compileAnswers,
  type EditorBuffer,
  INITIAL_QUESTIONS_STATE,
  isLastStep,
  type QuestionsState,
  transitionQuestions,
} from "../src/composer/question-machine";
import type { ComposerQuestion, ComposerSnapshot } from "../src/composer/types";

const questions: ComposerQuestion[] = [
  { id: "q1", label: "Q1?", options: [{ label: "A", description: "a" }] },
  {
    id: "q2",
    label: "Q2?",
    options: [
      { label: "B", description: "b" },
      { label: "C", description: "c" },
    ],
    multiSelect: true,
  },
];

const bufferOf = (text: string): EditorBuffer => ({
  snapshot: { __doc: { text }, __brand: "ComposerSnapshot" } satisfies ComposerSnapshot,
  text,
});

const draftOf = (selected: string[], buffer: EditorBuffer | null = null) => ({
  selected: new Set(selected),
  buffer,
});

describe("transitionQuestions", () => {
  test("select-option on single-select advances a step and shows an empty editor", () => {
    const { next, effects } = transitionQuestions(INITIAL_QUESTIONS_STATE, questions, {
      type: "select-option",
      label: "A",
    });

    expect(next.step).toBe(1);
    expect(next.drafts.get(0)?.selected.has("A")).toBe(true);
    expect(effects).toEqual([
      { type: "load-buffer", buffer: null },
      { type: "reset-highlight" },
      { type: "focus-options" },
    ]);
  });

  test("advancing into a step visited earlier shows what was typed there", () => {
    const saved = bufferOf("typed on q2 earlier");
    const state: QuestionsState = { step: 0, drafts: new Map([[1, draftOf([], saved)]]) };
    const { effects } = transitionQuestions(state, questions, {
      type: "continue-step",
      buffer: bufferOf("q1 answer"),
    });

    expect(effects[0]).toEqual({ type: "load-buffer", buffer: saved });
  });

  test("select-option on the last step compiles and submits", () => {
    const onLast: QuestionsState = { step: 1, drafts: new Map() };
    const { next, effects } = transitionQuestions(onLast, questions, {
      type: "select-option",
      label: "B",
    });

    // Multi-select never auto-advances on select — it toggles.
    expect(next.step).toBe(1);
    expect(effects).toEqual([]);
    expect(next.drafts.get(1)?.selected.has("B")).toBe(true);
  });

  test("continue-step on the last step emits only submit-answers with the compiled payload", () => {
    const state: QuestionsState = { step: 1, drafts: new Map([[0, draftOf(["A"])]]) };
    const withToggle = transitionQuestions(state, questions, { type: "toggle-option", label: "B" });
    const { effects } = transitionQuestions(withToggle.next, questions, {
      type: "continue-step",
      buffer: bufferOf("extra context"),
    });

    expect(effects).toEqual([
      {
        type: "submit-answers",
        answers: [
          { id: "q1", selected: ["A"] },
          { id: "q2", selected: ["B"], text: "extra context" },
        ],
      },
    ]);
  });

  test("continue-step with text on single-select drops the selection", () => {
    const state: QuestionsState = { step: 0, drafts: new Map([[0, draftOf(["A"])]]) };
    const { next } = transitionQuestions(state, questions, {
      type: "continue-step",
      buffer: bufferOf("my own answer"),
    });
    expect(next.drafts.get(0)).toEqual(draftOf([], bufferOf("my own answer")));
  });

  test("continue-step with an empty editor keeps the selection", () => {
    const state: QuestionsState = { step: 0, drafts: new Map([[0, draftOf(["A"])]]) };
    const { next } = transitionQuestions(state, questions, {
      type: "continue-step",
      buffer: bufferOf(""),
    });
    expect(next.drafts.get(0)?.selected.has("A")).toBe(true);
  });

  test("single-select toggle replaces the typed text with the option and empties the editor", () => {
    const state: QuestionsState = {
      step: 0,
      drafts: new Map([[0, draftOf([], bufferOf("typed"))]]),
    };
    const { next, effects } = transitionQuestions(state, questions, {
      type: "toggle-option",
      label: "A",
    });
    expect(next.drafts.get(0)).toEqual(draftOf(["A"]));
    expect(effects).toEqual([{ type: "load-buffer", buffer: null }]);
  });

  test("multiSelect toggle flips membership and keeps the buffer", () => {
    const typed = bufferOf("notes");
    const first = transitionQuestions(
      { step: 1, drafts: new Map([[1, draftOf([], typed)]]) },
      questions,
      { type: "toggle-option", label: "B" },
    );
    expect(first.effects).toEqual([]);
    expect(first.next.drafts.get(1)?.buffer).toBe(typed);

    const second = transitionQuestions(first.next, questions, {
      type: "toggle-option",
      label: "B",
    });
    expect(second.next.drafts.get(1)?.selected.size).toBe(0);
    expect(second.next.drafts.get(1)?.buffer).toBe(typed);
  });

  test("dismiss-step skips the draft entirely", () => {
    const { next } = transitionQuestions(INITIAL_QUESTIONS_STATE, questions, {
      type: "dismiss-step",
    });
    expect(next.step).toBe(1);
    expect(next.drafts.has(0)).toBe(false);
  });

  test("step-back saves the buffer being left and shows the target's", () => {
    const saved = bufferOf("saved");
    const typing = bufferOf("typing on q2");
    const state: QuestionsState = { step: 1, drafts: new Map([[0, draftOf([], saved)]]) };
    const { next, effects } = transitionQuestions(state, questions, {
      type: "step-back",
      buffer: typing,
    });

    expect(next.step).toBe(0);
    expect(next.drafts.get(1)?.buffer).toBe(typing);
    expect(effects[0]).toEqual({ type: "load-buffer", buffer: saved });
  });

  test("step navigation clamps at the ends", () => {
    const atStart = transitionQuestions(INITIAL_QUESTIONS_STATE, questions, {
      type: "step-back",
      buffer: null,
    });
    expect(atStart.next).toBe(INITIAL_QUESTIONS_STATE);
    expect(atStart.effects).toEqual([]);
  });
});

describe("compileAnswers", () => {
  test("skipped questions compile to empty-selection entries keyed by id", () => {
    expect(compileAnswers(INITIAL_QUESTIONS_STATE, questions)).toEqual([
      { id: "q1", selected: [] },
      { id: "q2", selected: [] },
    ]);
  });

  test("free text on single-select compiles to a trimmed text entry", () => {
    const state: QuestionsState = {
      step: 0,
      drafts: new Map([[0, draftOf([], bufferOf(" custom "))]]),
    };
    expect(compileAnswers(state, questions)[0]).toEqual({ id: "q1", selected: [], text: "custom" });
  });

  test("text is omitted entirely when the user typed nothing", () => {
    const state: QuestionsState = {
      step: 0,
      drafts: new Map([[0, draftOf(["A"], bufferOf("  "))]]),
    };
    const entry = compileAnswers(state, questions)[0];
    expect(entry).toBeDefined();
    expect(entry && "text" in entry).toBe(false);
  });

  test("option values are echoed when present, labels as fallback", () => {
    const valued: ComposerQuestion[] = [
      {
        id: "framework",
        label: "Which framework?",
        options: [{ value: "next", label: "Next.js" }, { label: "Remix" }],
        multiSelect: true,
      },
    ];
    // Toggle keys are labels (how the widget wires Option value today).
    const state: QuestionsState = {
      step: 0,
      drafts: new Map([[0, draftOf(["Next.js", "Remix"])]]),
    };
    expect(compileAnswers(state, valued)[0]).toEqual({
      id: "framework",
      selected: ["next", "Remix"],
    });
  });

  test("a label colliding with another option's value resolves to the selected option", () => {
    const colliding: ComposerQuestion[] = [
      {
        id: "pick",
        label: "Pick one",
        options: [
          { value: "c", label: "b" }, // this label equals the next option's value
          { value: "b", label: "Alpha" },
        ],
      },
    ];
    // The widget stores an option's identity (value ?? label) — here, "b" for
    // the second option. A cross-field lookup would match the first option's
    // label instead and wrongly emit "c".
    const state: QuestionsState = { step: 0, drafts: new Map([[0, draftOf(["b"])]]) };
    expect(compileAnswers(state, colliding)[0]).toEqual({ id: "pick", selected: ["b"] });
  });

  test("keys already stored as values resolve to the same values", () => {
    const valued: ComposerQuestion[] = [
      { id: "db", label: "Database?", options: [{ value: "pg", label: "PostgreSQL" }] },
    ];
    const state: QuestionsState = { step: 0, drafts: new Map([[0, draftOf(["pg"])]]) };
    expect(compileAnswers(state, valued)[0]).toEqual({ id: "db", selected: ["pg"] });
  });
});

describe("isLastStep", () => {
  test("reports the final question", () => {
    expect(isLastStep({ step: 0, drafts: new Map() }, questions)).toBe(false);
    expect(isLastStep({ step: 1, drafts: new Map() }, questions)).toBe(true);
  });
});
