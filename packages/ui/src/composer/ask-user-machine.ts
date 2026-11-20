// Ask-user — the question flow as one union and one total reducer. The store
// owns the flow cell and runs the effects; everything a step does is decided
// here.

import type { AskUserQuestion, ComposerAnswerEntry } from "./types";

// ---------------------------------------------------------------------------
// Types — the flow plus the event/effect vocabulary the store speaks to it in.
// ---------------------------------------------------------------------------

export type AnswerEntry = {
  selected: Set<string>;
  freeText: string;
};

export type Answers = Map<number, AnswerEntry>;

/** The `questions` prop after parsing: never empty, and the consumer's own array, so identity means "the same questions". */
export type Questions = [AskUserQuestion, ...AskUserQuestion[]];

/**
 * `answered` is terminal for its array: it keeps the questions so setting the
 * same array again stays answered, and it ignores every answer event. Only a
 * new array (asking) or none (idle) leaves it. `step` exists only while asking.
 */
export type AskUserFlow =
  | { readonly phase: "idle" }
  | {
      readonly phase: "asking";
      readonly questions: Questions;
      /** 0 <= step < questions.length */
      readonly step: number;
      readonly answers: Answers;
    }
  | { readonly phase: "answered"; readonly questions: Questions; readonly answers: Answers };

type AskingFlow = Extract<AskUserFlow, { phase: "asking" }>;

export const IDLE_FLOW: AskUserFlow = { phase: "idle" };

export type AskUserEvent =
  | { type: "questions-changed"; questions: Questions | null }
  | { type: "toggle-option"; label: string }
  | { type: "select-option"; label: string }
  | { type: "clear-selections" }
  | { type: "continue-step"; freeText: string }
  | { type: "dismiss-step" }
  | { type: "step-back"; currentText: string }
  | { type: "step-forward"; currentText: string };

type AnswerEvent = Exclude<AskUserEvent, { type: "questions-changed" }>;

// Everything a transition may ask of the outside world. The store executes
// these against the editor controller, the options handle, and the submit
// callback.
export type AskUserEffect =
  | { type: "clear-input" }
  | { type: "set-input-text"; text: string }
  | { type: "focus-input" }
  // The step's options mount after the flow changes: a new flow renders them a
  // commit later (a frame), a step change as soon as the highlight resets (a
  // microtask).
  | { type: "focus-options"; after: "frame" | "microtask" }
  | { type: "reset-highlight" }
  | { type: "submit-answers"; answers: ComposerAnswerEntry[] };

export type AskUserTransition = {
  flow: AskUserFlow;
  effects: AskUserEffect[];
};

/** The data half of the public `askUser` slice. */
export type AskUserView = {
  /** True only while asking: false once the last step is answered, with `questions` still set. */
  active: boolean;
  questions: AskUserQuestion[] | null;
  /** Reads questions.length once answered, so `questions[step]` is undefined there. */
  step: number;
  answers: Answers;
  isLastStep: boolean;
  isSingle: boolean;
};

// ---------------------------------------------------------------------------
// Boundary — the prop parse.
// ---------------------------------------------------------------------------

/** Keeps the array's identity. An empty array is no questions. */
export const parseQuestions = (
  questions: AskUserQuestion[] | null | undefined,
): Questions | null => (questions && isNonEmpty(questions) ? questions : null);

const isNonEmpty = <T>(items: T[]): items is [T, ...T[]] => items.length > 0;

// ---------------------------------------------------------------------------
// Reducer — the decide half of the flow, total over phase x event.
// ---------------------------------------------------------------------------

export const reduceAskUser = (flow: AskUserFlow, event: AskUserEvent): AskUserTransition => {
  if (event.type === "questions-changed") return changeQuestions(flow, event.questions);
  if (flow.phase !== "asking") return { flow, effects: [] };
  return answer(flow, event);
};

// Idempotent per array: a StrictMode replay or an explicit store's remount sets
// the same array again and must neither re-ask nor re-focus.
const changeQuestions = (flow: AskUserFlow, questions: Questions | null): AskUserTransition => {
  const current = flow.phase === "idle" ? null : flow.questions;
  if (questions === current) return { flow, effects: [] };
  if (questions === null) return { flow: IDLE_FLOW, effects: [] };
  return {
    flow: { phase: "asking", questions, step: 0, answers: new Map() },
    effects: [{ type: "focus-options", after: "frame" }],
  };
};

// Composed events (select-option = toggle + advance) resolve atomically here,
// so no caller ever chains transitions across a stale snapshot.
const answer = (flow: AskingFlow, event: AnswerEvent): AskUserTransition => {
  const { questions, step, answers } = flow;
  const multiSelect = questions[step]?.multiSelect === true;

  switch (event.type) {
    case "toggle-option":
      return {
        flow: { ...flow, answers: toggleAnswer(answers, step, event.label, multiSelect) },
        effects: multiSelect ? [] : [{ type: "clear-input" }],
      };

    case "select-option": {
      const toggled = toggleAnswer(answers, step, event.label, multiSelect);
      if (multiSelect) return { flow: { ...flow, answers: toggled }, effects: [] };
      return advanceStep(flow, toggled);
    }

    case "clear-selections": {
      const previous = answers.get(step);
      if (!previous || previous.selected.size === 0) return { flow, effects: [] };
      const next = new Map(answers);
      next.set(step, { selected: new Set(), freeText: previous.freeText });
      return { flow: { ...flow, answers: next }, effects: [] };
    }

    case "continue-step":
      return advanceStep(flow, writeFreeText(answers, step, event.freeText.trim(), multiSelect));

    case "dismiss-step":
      return advanceStep(flow, skipStep(answers, step));

    case "step-back":
      return goToStep(flow, Math.max(0, step - 1), event.currentText);

    case "step-forward":
      return goToStep(flow, Math.min(questions.length - 1, step + 1), event.currentText);
  }
};

// Commit the step's answers, then either ask the next question or, on the
// last, end the flow and submit (input focused for a follow-up message).
const advanceStep = (flow: AskingFlow, answers: Answers): AskUserTransition => {
  const { questions, step } = flow;
  if (step < questions.length - 1) {
    return {
      flow: { ...flow, step: step + 1, answers },
      effects: [
        { type: "clear-input" },
        { type: "reset-highlight" },
        { type: "focus-options", after: "microtask" },
      ],
    };
  }
  return {
    flow: { phase: "answered", questions, answers },
    effects: [
      { type: "clear-input" },
      { type: "submit-answers", answers: compileAnswers(questions, answers) },
      { type: "focus-input" },
    ],
  };
};

// Keep any in-progress free text on the step being left and restore the
// target step's saved text into the input.
const goToStep = (flow: AskingFlow, targetStep: number, currentText: string): AskUserTransition => {
  if (targetStep === flow.step) return { flow, effects: [] };

  const trimmed = currentText.trim();
  const answers = new Map(flow.answers);
  if (trimmed.length > 0) {
    const previous = answers.get(flow.step) ?? emptyEntry();
    answers.set(flow.step, { ...previous, freeText: trimmed });
  }

  return {
    flow: { ...flow, step: targetStep, answers },
    effects: [
      { type: "set-input-text", text: answers.get(targetStep)?.freeText ?? "" },
      { type: "reset-highlight" },
      { type: "focus-options", after: "microtask" },
    ],
  };
};

// ---------------------------------------------------------------------------
// Projections — the public view and the submitted payload.
// ---------------------------------------------------------------------------

const NO_ANSWERS: Answers = new Map();

export const viewAskUser = (flow: AskUserFlow): AskUserView => {
  switch (flow.phase) {
    case "idle":
      return {
        active: false,
        questions: null,
        step: 0,
        answers: NO_ANSWERS,
        isLastStep: false,
        isSingle: false,
      };
    case "asking":
      return {
        active: true,
        questions: flow.questions,
        step: flow.step,
        answers: flow.answers,
        isLastStep: flow.step === flow.questions.length - 1,
        isSingle: flow.questions.length === 1,
      };
    case "answered":
      return {
        active: false,
        questions: flow.questions,
        step: flow.questions.length,
        answers: flow.answers,
        isLastStep: true,
        isSingle: flow.questions.length === 1,
      };
  }
};

// One entry per question, in order. The chosen branch encodes the invariant:
// single-select carries `option` *or* `text`; multi-select carries both; an
// unanswered question is bare `{ question }`.
export const compileAnswers = (questions: Questions, answers: Answers): ComposerAnswerEntry[] =>
  questions.map(({ question, multiSelect }, index) => {
    const entry = answers.get(index);
    if (!entry) return { question };

    const selected = [...entry.selected];
    const text = entry.freeText.trim();

    if (multiSelect) {
      if (selected.length === 0 && text === "") return { question };
      return { question, options: selected, text };
    }

    const firstSelected = selected[0];
    if (firstSelected !== undefined) return { question, option: firstSelected };
    if (text !== "") return { question, text };
    return { question };
  });

// ---------------------------------------------------------------------------
// Answer helpers — immutable operations on the per-step answer map.
// ---------------------------------------------------------------------------

const emptyEntry = (): AnswerEntry => ({
  selected: new Set<string>(),
  freeText: "",
});

// Single-select treats text and a chosen option as mutually exclusive, so any
// selection is dropped; multi-select keeps existing selections alongside the
// text. Empty text leaves the step's entry as it was.
const writeFreeText = (answers: Answers, step: number, text: string, multiSelect: boolean) => {
  const next = new Map(answers);
  if (text.length === 0) return next;
  const previous = next.get(step) ?? emptyEntry();
  next.set(step, {
    selected: multiSelect ? previous.selected : new Set(),
    freeText: text,
  });
  return next;
};

const skipStep = (answers: Answers, step: number): Answers => {
  const next = new Map(answers);
  next.delete(step);
  return next;
};

// Multi-select toggles membership and keeps free text; single-select replaces
// both (option and text are mutually exclusive).
const toggleAnswer = (answers: Answers, step: number, label: string, multiSelect: boolean) => {
  const next = new Map(answers);
  const previous = next.get(step) ?? emptyEntry();
  const selected = new Set(previous.selected);
  if (multiSelect) {
    if (selected.has(label)) selected.delete(label);
    else selected.add(label);
  } else {
    selected.clear();
    selected.add(label);
  }
  next.set(step, { selected, freeText: multiSelect ? previous.freeText : "" });
  return next;
};
