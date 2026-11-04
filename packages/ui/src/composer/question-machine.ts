// Questions — pure state machine for the question flow. State is a current step
// plus a map of per-step drafts; every transition is an immutable map
// operation, so the store only owns the state cell and the effect execution.

import type { ComposerAnswer, ComposerQuestion } from "./types";

// ---------------------------------------------------------------------------
// Types — the machine state plus the effect/action/transition vocabulary the
// store speaks to it in.
// ---------------------------------------------------------------------------

export type AnswerDraft = {
  selected: Set<string>;
  freeText: string;
};

export type QuestionsState = {
  step: number;
  drafts: Map<number, AnswerDraft>;
};

export const INITIAL_QUESTIONS_STATE: QuestionsState = {
  step: 0,
  drafts: new Map(),
};

// Everything a transition may ask of the outside world. The store executes
// these against the editor controller, the options handle, and the submit
// callback — the transitions below only describe them.
export type QuestionsEffect =
  | { type: "clear-input" }
  | { type: "set-input-text"; text: string }
  | { type: "focus-input" }
  | { type: "focus-options" }
  | { type: "reset-highlight" }
  | { type: "submit-answers"; answers: ComposerAnswer[] };

export type QuestionsAction =
  | { type: "toggle-option"; label: string }
  | { type: "select-option"; label: string }
  | { type: "clear-selections" }
  | { type: "continue-step"; freeText: string }
  | { type: "dismiss-step" }
  | { type: "step-back"; currentText: string }
  | { type: "step-forward"; currentText: string };

export type QuestionsTransition = {
  next: QuestionsState;
  effects: QuestionsEffect[];
};

// ---------------------------------------------------------------------------
// Draft helpers — immutable operations on the per-step draft map, plus the
// projection/query the store reads.
// ---------------------------------------------------------------------------

const emptyDraft = (): AnswerDraft => ({
  selected: new Set<string>(),
  freeText: "",
});

const cloneDrafts = (source: Map<number, AnswerDraft>) => new Map(source);

// Record `text` as the step's free-text answer. Single-select treats text and
// a chosen option as mutually exclusive, so any selection is dropped;
// multi-select keeps existing selections alongside the text. Empty text is a
// no-op (returns an untouched clone).
const writeFreeText = (
  drafts: Map<number, AnswerDraft>,
  step: number,
  text: string,
  multiSelect: boolean,
) => {
  const next = cloneDrafts(drafts);
  if (text.length === 0) return next;
  const previous = next.get(step) ?? emptyDraft();
  next.set(step, {
    selected: multiSelect ? previous.selected : new Set(),
    freeText: text,
  });
  return next;
};

// Remove the step's draft entirely (skip / dismiss).
const skipStep = (drafts: Map<number, AnswerDraft>, step: number): Map<number, AnswerDraft> => {
  const next = cloneDrafts(drafts);
  next.delete(step);
  return next;
};

// Toggle an option on the step's draft. Multi-select toggles membership and
// keeps free text; single-select replaces both (option and text are mutually
// exclusive).
const toggleAnswer = (
  drafts: Map<number, AnswerDraft>,
  step: number,
  label: string,
  multiSelect: boolean,
) => {
  const next = cloneDrafts(drafts);
  const previous = next.get(step) ?? emptyDraft();
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

// Project the drafts onto the public flat entry shape, one entry per question in
// order. Selected keys resolve to option values (label fallback); `text` is
// present only when the user typed something.
export const compileAnswers = (
  state: QuestionsState,
  questions: ComposerQuestion[],
): ComposerAnswer[] =>
  questions.map((question, index) => {
    const draft = state.drafts.get(index);
    if (!draft) return { id: question.id, selected: [] };

    // Exact identity first, then a label fallback for consumers who wire
    // `value={option.label}`. Never match value-against-label, so one option's
    // label cannot resolve to another's value.
    const selected = [...draft.selected].map((key) => {
      const option =
        question.options.find((o) => (o.value ?? o.label) === key) ??
        question.options.find((o) => o.label === key);
      return option ? (option.value ?? option.label) : key;
    });
    const text = draft.freeText.trim();

    return text === "" ? { id: question.id, selected } : { id: question.id, selected, text };
  });

export const isLastStep = (state: QuestionsState, questions: ComposerQuestion[]) =>
  state.step >= questions.length - 1;

// ---------------------------------------------------------------------------
// Transitions — the decide half of the flow: map an action onto the next state
// plus the effects to run. transitionQuestions is the single entry point.
// ---------------------------------------------------------------------------

// Commit `nextDrafts`, advance one step, and reset the input — then either
// arm the next question (blurred, highlight reset) or compile and submit on
// the last step (input focused for the follow-up message).
const advanceStep = (
  state: QuestionsState,
  questions: ComposerQuestion[],
  nextDrafts: Map<number, AnswerDraft>,
): QuestionsTransition => {
  const next: QuestionsState = { step: state.step + 1, drafts: nextDrafts };
  if (state.step < questions.length - 1) {
    return {
      next,
      effects: [{ type: "clear-input" }, { type: "reset-highlight" }, { type: "focus-options" }],
    };
  }
  return {
    next,
    effects: [
      { type: "clear-input" },
      { type: "submit-answers", answers: compileAnswers(next, questions) },
      { type: "focus-input" },
    ],
  };
};

// Navigate to `targetStep`, preserving any in-progress free text on the step
// being left and restoring the target step's saved text into the input.
const transitionToStep = (
  state: QuestionsState,
  targetStep: number,
  currentText: string,
): QuestionsTransition => {
  if (targetStep === state.step) return { next: state, effects: [] };

  const trimmed = currentText.trim();
  const drafts = cloneDrafts(state.drafts);
  if (trimmed.length > 0) {
    const previous = drafts.get(state.step) ?? emptyDraft();
    drafts.set(state.step, { ...previous, freeText: trimmed });
  }

  const next: QuestionsState = { step: targetStep, drafts };
  return {
    next,
    effects: [
      { type: "set-input-text", text: drafts.get(targetStep)?.freeText ?? "" },
      { type: "reset-highlight" },
      { type: "focus-options" },
    ],
  };
};

// The decide half of the question flow, mirroring interpretQuestionKey: map an
// action onto the next state plus the effects to run. Composed actions
// (select-option = toggle + advance) resolve atomically here, so no caller
// ever chains transitions across a stale state snapshot.
export const transitionQuestions = (
  state: QuestionsState,
  questions: ComposerQuestion[],
  action: QuestionsAction,
): QuestionsTransition => {
  const multiSelect = !!questions[state.step]?.multiSelect;

  switch (action.type) {
    case "toggle-option":
      return {
        next: {
          ...state,
          drafts: toggleAnswer(state.drafts, state.step, action.label, multiSelect),
        },
        effects: multiSelect ? [] : [{ type: "clear-input" }],
      };

    case "select-option": {
      const toggled = toggleAnswer(state.drafts, state.step, action.label, multiSelect);
      if (multiSelect) return { next: { ...state, drafts: toggled }, effects: [] };
      return advanceStep(state, questions, toggled);
    }

    case "clear-selections": {
      const previous = state.drafts.get(state.step);
      if (!previous || previous.selected.size === 0) return { next: state, effects: [] };
      const drafts = cloneDrafts(state.drafts);
      drafts.set(state.step, { selected: new Set(), freeText: previous.freeText });
      return { next: { ...state, drafts }, effects: [] };
    }

    case "continue-step":
      return advanceStep(
        state,
        questions,
        writeFreeText(state.drafts, state.step, action.freeText.trim(), multiSelect),
      );

    case "dismiss-step":
      return advanceStep(state, questions, skipStep(state.drafts, state.step));

    case "step-back":
      return transitionToStep(state, Math.max(0, state.step - 1), action.currentText);

    case "step-forward":
      return transitionToStep(
        state,
        Math.min(questions.length - 1, state.step + 1),
        action.currentText,
      );
  }
};
