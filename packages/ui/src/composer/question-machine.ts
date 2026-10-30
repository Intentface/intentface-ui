// Questions — pure state machine for the question flow. State is a current step
// plus a map of per-step drafts; every transition is an immutable map
// operation, so the store only owns the state cell and the effect execution.

import type { ComposerAnswer, ComposerQuestion, ComposerSnapshot } from "./types";

// ---------------------------------------------------------------------------
// Types — the machine state plus the effect/action/transition vocabulary the
// store speaks to it in.
// ---------------------------------------------------------------------------

export type EditorBuffer = {
  snapshot: ComposerSnapshot;
  text: string;
};

export type AnswerDraft = {
  selected: Set<string>;
  /** The editor content saved when the user last left this step; null when none was. */
  buffer: EditorBuffer | null;
};

export type QuestionsState = {
  step: number;
  drafts: Map<number, AnswerDraft>;
};

export const INITIAL_QUESTIONS_STATE: QuestionsState = {
  step: 0,
  drafts: new Map(),
};

export type QuestionsEffect =
  | { type: "load-buffer"; buffer: EditorBuffer | null }
  | { type: "focus-options" }
  | { type: "reset-highlight" }
  | { type: "submit-answers"; answers: ComposerAnswer[] };

export type QuestionsAction =
  | { type: "toggle-option"; label: string }
  | { type: "select-option"; label: string }
  | { type: "clear-selections" }
  | { type: "continue-step"; buffer: EditorBuffer | null }
  | { type: "dismiss-step" }
  | { type: "step-back"; buffer: EditorBuffer | null }
  | { type: "step-forward"; buffer: EditorBuffer | null };

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
  buffer: null,
});

const cloneDrafts = (source: Map<number, AnswerDraft>) => new Map(source);

const hasText = (buffer: EditorBuffer | null) => buffer !== null && buffer.text.trim().length > 0;

const saveStepBuffer = (
  drafts: Map<number, AnswerDraft>,
  step: number,
  buffer: EditorBuffer | null,
  multiSelect: boolean,
) => {
  const next = cloneDrafts(drafts);
  const previous = next.get(step) ?? emptyDraft();
  next.set(step, {
    selected: multiSelect || !hasText(buffer) ? previous.selected : new Set(),
    buffer,
  });
  return next;
};

// Remove the step's draft entirely (skip / dismiss).
const skipStep = (drafts: Map<number, AnswerDraft>, step: number): Map<number, AnswerDraft> => {
  const next = cloneDrafts(drafts);
  next.delete(step);
  return next;
};

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
  next.set(step, { selected, buffer: multiSelect ? previous.buffer : null });
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
    const text = draft.buffer?.text.trim() ?? "";

    return text === "" ? { id: question.id, selected } : { id: question.id, selected, text };
  });

export const isLastStep = (state: QuestionsState, questions: ComposerQuestion[]) =>
  state.step >= questions.length - 1;

// ---------------------------------------------------------------------------
// Transitions — the decide half of the flow: map an action onto the next state
// plus the effects to run. transitionQuestions is the single entry point.
// ---------------------------------------------------------------------------

const showStep = (next: QuestionsState): QuestionsTransition => ({
  next,
  effects: [
    { type: "load-buffer", buffer: next.drafts.get(next.step)?.buffer ?? null },
    { type: "reset-highlight" },
    { type: "focus-options" },
  ],
});

const advanceStep = (
  state: QuestionsState,
  questions: ComposerQuestion[],
  nextDrafts: Map<number, AnswerDraft>,
): QuestionsTransition => {
  const next: QuestionsState = { step: state.step + 1, drafts: nextDrafts };
  if (state.step < questions.length - 1) return showStep(next);
  return {
    next,
    effects: [{ type: "submit-answers", answers: compileAnswers(next, questions) }],
  };
};

const transitionToStep = (
  state: QuestionsState,
  targetStep: number,
  buffer: EditorBuffer | null,
  multiSelect: boolean,
): QuestionsTransition => {
  if (targetStep === state.step) return { next: state, effects: [] };
  return showStep({
    step: targetStep,
    drafts: saveStepBuffer(state.drafts, state.step, buffer, multiSelect),
  });
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
        effects: multiSelect ? [] : [{ type: "load-buffer", buffer: null }],
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
      drafts.set(state.step, { selected: new Set(), buffer: previous.buffer });
      return { next: { ...state, drafts }, effects: [] };
    }

    case "continue-step":
      return advanceStep(
        state,
        questions,
        saveStepBuffer(state.drafts, state.step, action.buffer, multiSelect),
      );

    case "dismiss-step":
      return advanceStep(state, questions, skipStep(state.drafts, state.step));

    case "step-back":
      return transitionToStep(state, Math.max(0, state.step - 1), action.buffer, multiSelect);

    case "step-forward":
      return transitionToStep(
        state,
        Math.min(questions.length - 1, state.step + 1),
        action.buffer,
        multiSelect,
      );
  }
};
