"use client";

// Composer store — all reactive composer state in one store, so useComposer
// can offer Zustand-style selectors and components re-render only for the
// slice they read. Actions and refs are created once and survive every
// update; a slice's identity changes only when that slice's data changes.
//
// Instance model: every Composer.Root owns a store (an explicit
// Composer.createStore() handle, or one created per mount) and provides it via
// ComposerStoreContext. Inside the tree, useComposer resolves it implicitly;
// outside, useComposerStore(store, selector) and store.controller take an
// explicit handle — no global fallback, so state is never read or driven by
// accident. SSR-safe by invariant: every write happens in an effect or event
// handler (client-only), so server renders only ever read the pristine
// snapshot.

import { createContext, type RefObject, use, useSyncExternalStore } from "react";
import {
  type AttachmentErrorCode,
  type AttachmentItem,
  revokeAttachmentUrl,
  toAttachmentItem,
} from "../attachments";
import {
  type AttachmentStoreAction,
  type AttachmentStoreConfig,
  attachmentReducer,
  INITIAL_ATTACHMENT_STATE,
} from "./attachments-machine";
import { interpretQuestionKey } from "./keyboard";
import type { ComposerQuestionOptionsHandle } from "./question";
import {
  type AnswerDraft,
  type EditorBuffer,
  INITIAL_QUESTIONS_STATE,
  isLastStep,
  type QuestionsAction,
  type QuestionsEffect,
  transitionQuestions,
} from "./question-machine";
import { segmentsToSnapshot } from "./segments";
import type {
  ComposerAnswer,
  ComposerEditorHandle,
  ComposerQuestion,
  ComposerSnapshot,
  RegisteredEditor,
} from "./types";

// ---------------------------------------------------------------------------
// Editor controller — the null-safe imperative surface over the store's
// registered editor. Safe to hold before any editor mounts and across
// engine swaps; every call no-ops (or returns an empty value) while no
// editor is registered.
// ---------------------------------------------------------------------------

export type ComposerEditorState = ComposerEditorHandle & {
  getText: () => string;
  setText: (text: string) => void;
  serialize: () => { text: string };
  ensureFocus: () => void;
};

const createEditorController = (
  editorRef: RefObject<RegisteredEditor | null>,
): ComposerEditorState => ({
  focus: (options) => editorRef.current?.focus(options),
  blur: () => editorRef.current?.blur(),
  clear: () => editorRef.current?.clear(),
  insertText: (text) => editorRef.current?.insertText(text),
  insertChip: (chip) => editorRef.current?.insertChip(chip),
  getText: () => editorRef.current?.getText() ?? "",
  setText: (text) => editorRef.current?.setText(text),
  serialize: () => editorRef.current?.serialize() ?? { text: "" },
  ensureFocus: () => {
    const editor = editorRef.current;
    if (editor && !editor.isFocused()) editor.focus();
  },
});

// ---------------------------------------------------------------------------
// State slices
// ---------------------------------------------------------------------------

export type ComposerAttachmentsState = {
  items: AttachmentItem[];
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  openFileDialog: () => void;
  error: AttachmentErrorCode | null;
  isDragging: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  globalDropRef: RefObject<boolean>;
};

export type ComposerQuestionsState = ComposerPanelSlice & {
  items: ComposerQuestion[] | null;
  step: number;
  drafts: Map<number, AnswerDraft>;
  toggleOption: (label: string) => void;
  /** Continue with the editor's content as the step's free-text answer (plus any selection). */
  continueStep: () => void;
  dismissStep: () => void;
  isLastStep: boolean;
  isSingle: boolean;
  clearSelections: () => void;
  goBack: () => void;
  goNext: () => void;
  optionsRef: RefObject<ComposerQuestionOptionsHandle | null>;
};

// The shared skeleton every native panel slice (commands, questions) is built
// on: `active` is the logical open flag a consumer gates
// on (`{commands.active && <…/>}`); `present` is sticky-true — it stays set through
// the close animation so the panel can keep the last content mounted while it
// animates out, and is cleared only by finalizePanelClose() once the animation
// ends. Each slice adds its own payload/actions on top.
export type ComposerPanelSlice = { active: boolean; present: boolean };

// Command-list state: the plugin mirror (whether a trigger prefix is active,
// which one, the query typed after it) plus the navigation highlight. The
// highlight lives here — not in the CommandList component — so the editor's
// keydown handler (outside React) can move it through a plain store method
// instead of a bridged ref. It's a raw index; readers wrap it by item count.
export type ComposerCommandsState = ComposerPanelSlice & {
  trigger: string | null;
  query: string;
  highlightIndex: number;
  /** DOM id of the highlighted option row — the editor's aria-activedescendant. Written by the mounted Command as the highlight resolves. */
  activeOptionId: string | null;
};

export type ComposerState = {
  // Data only — the reactive editor flags. The imperative methods live on
  // store.controller (or useComposerController()), so a component that only
  // needs to know whether the editor has content doesn't hold a handle to
  // everything that can mutate it.
  textarea: { hasContent: boolean };
  isSubmitting: boolean;
  commands: ComposerCommandsState;
  attachments: ComposerAttachmentsState;
  questions: ComposerQuestionsState;
};

// Which buffer the editor shows. Every mode owns its own: the message, the
// only buffer `value` / `onValueChange` ever see, and one per question step
// (held by the question machine). While questions run, the message waits in
// `savedMessage` and the editor is the current step's free-text field; the
// swap on either transition saves what the editor held and loads the other.
export type EditorMode =
  | { kind: "message" }
  | { kind: "questions"; savedMessage: ComposerSnapshot | null };

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type ComposerStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ComposerState;
  // Bridges for props and editor/document integrations — not consumer API.
  setHasContent: (value: boolean) => void;
  setIsSubmitting: (value: boolean) => void;
  setCommands: (next: { active: boolean; trigger: string | null; query: string }) => void;
  setActiveOptionId: (id: string | null) => void;
  /**
   * Stable per-instance id for the command listbox — the editor references it
   * via aria-controls; option rows derive their ids from it. Assigned by the
   * mounting Composer.Root from React's useId (SSR-stable); the factory can't
   * mint it because explicit handles are created outside React.
   */
  listboxId: string;
  moveHighlight: (direction: number) => void;
  setHighlight: (index: number) => void;
  setQuestions: (questions: ComposerQuestion[] | null) => void;
  /** Whether the editor shows the message or a question step's answer. */
  getEditorMode: () => EditorMode;
  /**
   * Write the message buffer: into the editor while it shows the message, into
   * `savedMessage` while questions run, so a controlled `value` or a
   * `defaultValue` never lands in a step's answer.
   */
  setMessageSnapshot: (snapshot: ComposerSnapshot) => void;
  setDragging: (active: boolean) => void;
  resetAttachments: () => void;
  activateQuestions: () => () => void;
  // Clears `present` on native panel slices whose `active` is false — the Panel calls
  // this once its close animation finishes, so closing content stays mounted until then.
  finalizePanelClose: () => void;
  reset: () => void;
  // The store's editor engine: registered by the mounted Textarea as a
  // RegisteredEditor adapter, driven through the controller (a null-safe port
  // over editorRef).
  editorRef: RefObject<RegisteredEditor | null>;
  controller: ComposerEditorState;
  registerEditor: (editor: RegisteredEditor) => () => void;
  // The mounted Composer.Container's element, registered by its render ref.
  // Composer.Popover anchors to the active command badge inside the editor, but
  // observes this box to reposition — the badge moves when the container grows
  // (attachments strip, multi-line input).
  containerRef: RefObject<HTMLElement | null>;
  // Co-located refs the mounted Composer wires up at runtime.
  attachmentConfigRef: RefObject<AttachmentStoreConfig>;
  submitAnswersRef: RefObject<((answers: ComposerAnswer[]) => void) | null>;
  // The mounted Submit's stop while generating; Composer.Root calls it on Escape.
  stopGeneratingRef: RefObject<(() => void) | null>;
  // Invokes the active list's current selection. Registered by the mounted
  // CommandList via a callback ref (commit-time), not an effect.
  commandSelectRef: RefObject<(() => void) | null>;
};

// ---------------------------------------------------------------------------
// Question keydown — the document-level handler for question mode, kept out of
// the store factory so activateQuestions reads as just "blur, listen, unlisten".
// ---------------------------------------------------------------------------

// Focus moves the question flow makes itself — back to the input, or in from
// an option. The composer is on screen already, and the browser's
// focus-scroll would also move the page around an embedded composer.
const FOCUS_IN_PLACE: FocusOptions = { preventScroll: true };

const EMPTY_BUFFER = segmentsToSnapshot([]);

// Scope a document-level listener to this composer: keystrokes aimed at
// another editable or inside another composer's options are theirs; our own
// options/editor and unclaimed targets (body — e.g. after a click on panel
// chrome dropped focus) are ours, so arrows and "type to answer" keep working.
const isEventForComposer = (
  event: KeyboardEvent,
  editorDom: HTMLElement | undefined,
  optionsElement: HTMLElement | null,
) => {
  const target = event.target as HTMLElement | null;
  const editableHost = target?.closest<HTMLElement>('input, textarea, [contenteditable="true"]');
  if (editableHost) return editableHost === editorDom;
  const optionsHost = target?.closest<HTMLElement>("[data-composer-question-options]");
  if (optionsHost) return optionsHost === optionsElement;
  // Only the body fallback the comment above describes. Anything else is a real
  // element that owns its own keys — Space on an unrelated button must not
  // select an option here.
  return target === null || target === document.body;
};

// The editor's content with its plain text, captured in one read so the text
// an answer compiles from is the text of the snapshot shown back on that step.
const readEditorBuffer = (editorRef: RefObject<RegisteredEditor | null>): EditorBuffer | null => {
  const editor = editorRef.current;
  if (!editor) return null;
  return { snapshot: editor.getSnapshot(), text: editor.getText() };
};

type QuestionsKeydownDeps = {
  controller: ComposerEditorState;
  optionsRef: RefObject<ComposerQuestionOptionsHandle | null>;
  editorRef: RefObject<RegisteredEditor | null>;
  dispatch: (action: QuestionsAction) => void;
};

// Interpret a key (pure) and drive the machine + editor controller. Mirrors the
// action union from interpretQuestionKey one-to-one.
const createQuestionsKeydownHandler =
  ({ controller, optionsRef, editorRef, dispatch }: QuestionsKeydownDeps) =>
  (event: KeyboardEvent) => {
    const scopedOptionsElement = optionsRef.current?.getElement() ?? null;
    const editorDom = editorRef.current?.getRootElement() ?? undefined;
    if (!isEventForComposer(event, editorDom, scopedOptionsElement)) return;
    // Keys typed into the editor are typing. Its own keydown maps ArrowUp,
    // ArrowDown, and Escape to the flow; Space and Enter there are a character
    // and the send chord, never a pick of the highlighted option.
    if (editorDom?.contains(event.target as Node)) return;

    const optionsHandle = optionsRef.current;
    const action = interpretQuestionKey(
      {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        defaultPrevented: event.defaultPrevented,
      },
      { hasHighlight: optionsHandle?.highlightedValue != null },
    );
    if (!action) return;
    event.preventDefault();

    switch (action.type) {
      case "dismiss-step":
        dispatch({ type: "dismiss-step" });
        return;
      case "navigate-options": {
        const newValue = optionsHandle?.navigate(action.direction);
        if (newValue === null) controller.focus(FOCUS_IN_PLACE);
        return;
      }
      case "select-option": {
        const item = optionsHandle?.select();
        if (item) dispatch({ type: "select-option", label: item.value });
        return;
      }
      case "go-back":
        dispatch({ type: "step-back", buffer: readEditorBuffer(editorRef) });
        return;
      case "go-next":
        dispatch({ type: "step-forward", buffer: readEditorBuffer(editorRef) });
        return;
      case "insert-character":
        optionsHandle?.clearHighlight();
        controller.focus(FOCUS_IN_PLACE);
        controller.insertText(action.character);
        return;
    }
  };

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export const createComposerStore = (): ComposerStore => {
  // --- Subscriptions & refs
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  // Per-store editor engine behind a null-safe controller.
  const editorRef: RefObject<RegisteredEditor | null> = { current: null };
  const controller = createEditorController(editorRef);

  // Imperative refs co-located with the store; not reactive.
  const containerRef: RefObject<HTMLElement | null> = { current: null };
  const optionsRef: RefObject<ComposerQuestionOptionsHandle | null> = { current: null };
  const fileInputRef: RefObject<HTMLInputElement | null> = { current: null };
  const globalDropRef: RefObject<boolean> = { current: false };
  // Permissive defaults: accept everything, no caps, platform-default blob
  // ingestion. Composer.Attachments overwrites this with the consumer's
  // policy and any custom convert/destroy.
  const attachmentConfigRef: RefObject<AttachmentStoreConfig> = {
    current: {
      accept: "",
      maxFiles: Number.POSITIVE_INFINITY,
      maxFileSize: Number.POSITIVE_INFINITY,
      convert: toAttachmentItem,
      destroy: revokeAttachmentUrl,
    },
  };
  const submitAnswersRef: RefObject<((answers: ComposerAnswer[]) => void) | null> = {
    current: null,
  };
  const commandSelectRef: RefObject<(() => void) | null> = { current: null };
  const stopGeneratingRef: RefObject<(() => void) | null> = { current: null };

  // Canonical machine states; the snapshot mirrors them on every update.
  let attachmentState = INITIAL_ATTACHMENT_STATE;
  let questionsMachine = INITIAL_QUESTIONS_STATE;
  let mode: EditorMode = { kind: "message" };
  let snapshot: ComposerState;

  // --- Setters
  const setHasContent = (value: boolean) => {
    if (snapshot.textarea.hasContent === value) return;
    snapshot = { ...snapshot, textarea: { ...snapshot.textarea, hasContent: value } };
    notify();
  };

  const setIsSubmitting = (value: boolean) => {
    if (snapshot.isSubmitting === value) return;
    snapshot = { ...snapshot, isSubmitting: value };
    notify();
  };

  const setCommands = (next: { active: boolean; trigger: string | null; query: string }) => {
    const current = snapshot.commands;
    if (
      current.active === next.active &&
      current.trigger === next.trigger &&
      current.query === next.query
    ) {
      return;
    }
    // Re-point the highlight at the first row whenever the active token or its
    // query changes, so filtering always lands on the top match.
    const resetHighlight = current.trigger !== next.trigger || current.query !== next.query;
    snapshot = {
      ...snapshot,
      commands: {
        ...next,
        // Sticky: opening sets present; closing leaves it set until the panel's
        // exit animation finishes and finalizePanelClose() clears it.
        present: next.active || current.present,
        highlightIndex: resetHighlight ? 0 : current.highlightIndex,
        // A closed popup has no active descendant; while open, the mounted
        // Command re-derives it as the highlight resolves.
        activeOptionId: next.active ? current.activeOptionId : null,
      },
    };
    notify();
  };

  // The editor's aria-activedescendant target — written by the mounted
  // Command, which is where highlight index resolves against the item list.
  const setActiveOptionId = (id: string | null) => {
    if (snapshot.commands.activeOptionId === id) return;
    snapshot = { ...snapshot, commands: { ...snapshot.commands, activeOptionId: id } };
    notify();
  };

  // Move the highlight by ±1 (raw, unbounded). The active CommandList wraps it
  // by its item count when reading, so the store needs no item knowledge.
  const moveHighlight = (direction: number) => {
    const { commands } = snapshot;
    snapshot = {
      ...snapshot,
      commands: { ...commands, highlightIndex: commands.highlightIndex + direction },
    };
    notify();
  };

  // Set the highlight to an absolute index (hover).
  const setHighlight = (index: number) => {
    if (snapshot.commands.highlightIndex === index) return;
    snapshot = { ...snapshot, commands: { ...snapshot.commands, highlightIndex: index } };
    notify();
  };

  // --- Attachments
  const dispatchAttachments = (action: AttachmentStoreAction) => {
    const next = attachmentReducer(attachmentState, action, attachmentConfigRef.current);
    if (next === attachmentState) return;
    attachmentState = next;
    snapshot = {
      ...snapshot,
      attachments: { ...snapshot.attachments, items: next.items, error: next.error },
    };
    notify();
  };

  const setDragging = (active: boolean) => {
    if (snapshot.attachments.isDragging === active) return;
    snapshot = { ...snapshot, attachments: { ...snapshot.attachments, isDragging: active } };
    notify();
  };

  // --- Editor buffers
  // Show a buffer in the editor; null shows an empty one. A load never moves
  // focus, so whoever needs the caret afterwards focuses the editor itself.
  // Input-content state is the editor engine's own job: engines report
  // programmatic writes through their update path.
  const loadEditorSnapshot = (snapshot: ComposerSnapshot | null) => {
    editorRef.current?.applySnapshot(snapshot ?? EMPTY_BUFFER);
  };

  // An editor that mounts mid-flow (a remount with an explicit store) shows
  // the current step's buffer. In message mode it keeps what it mounted with.
  const registerEditor = (editor: RegisteredEditor) => {
    editorRef.current = editor;
    if (mode.kind === "questions") {
      loadEditorSnapshot(
        questionsMachine.drafts.get(questionsMachine.step)?.buffer?.snapshot ?? null,
      );
    }
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  };

  // The Options part renders in reaction to setQuestions' notify, one commit
  // after the swap, so the entry focus defers a frame.
  let entryFocusFrame = 0;

  // message → questions: park the message and show the first step's (empty)
  // buffer. The mode flips before the editor empties, so the swap never
  // reports an empty message through onValueChange. Re-arming mid-flow keeps
  // the parked message and resets only the steps.
  const enterQuestions = () => {
    if (mode.kind === "message") {
      mode = { kind: "questions", savedMessage: editorRef.current?.getSnapshot() ?? null };
    }
    loadEditorSnapshot(null);

    // Settled from where focus is once the options exist. A user mid-sentence
    // keeps the caret, and no option is highlighted (the same state as after a
    // click into the editor). Otherwise the highlighted option takes focus,
    // which also keeps an option an early ArrowDown already moved to.
    cancelAnimationFrame(entryFocusFrame);
    entryFocusFrame = requestAnimationFrame(() => {
      if (editorRef.current?.isFocused()) optionsRef.current?.clearHighlight();
      else optionsRef.current?.focusHighlighted();
    });
  };

  // questions → message: show the parked message again and hand it the caret.
  // Idempotent, so a host that clears `questions` after the answers went out
  // does not restore twice.
  const endQuestions = () => {
    if (mode.kind !== "questions") return;
    cancelAnimationFrame(entryFocusFrame);
    const { savedMessage } = mode;
    mode = { kind: "message" };
    loadEditorSnapshot(savedMessage);
    controller.focus(FOCUS_IN_PLACE);
  };

  const setMessageSnapshot = (snapshot: ComposerSnapshot) => {
    if (mode.kind === "questions") {
      mode = { kind: "questions", savedMessage: snapshot };
      return;
    }
    editorRef.current?.applySnapshot(snapshot);
  };

  // --- Questions
  // The execute half of the question flow: replay a transition's effects
  // against the editor, the options handle, and the submit callback.
  const executeQuestionsEffects = (effects: QuestionsEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "load-buffer":
          loadEditorSnapshot(effect.buffer?.snapshot ?? null);
          break;
        case "focus-options":
          // Step advance / navigation: focus lands on the new step's
          // highlighted option (roving tabindex), never on <body>. Deferred a
          // microtask so the incoming step's options have registered
          // (reset-highlight runs first; auto-highlight re-seats on mount).
          queueMicrotask(() => optionsRef.current?.focusHighlighted());
          break;
        case "reset-highlight":
          optionsRef.current?.resetHighlight();
          break;
        case "submit-answers":
          // The flow is over before the host hears the answers, so anything
          // its callback does to the editor lands on the message.
          endQuestions();
          submitAnswersRef.current?.(effect.answers);
          break;
      }
    }
  };

  // The machine runs only while the editor is a step's answer field: once the
  // answers went out, a stray Escape or submit must not compile them again.
  const dispatchQuestions = (action: QuestionsAction) => {
    const questions = snapshot.questions.items;
    if (mode.kind !== "questions" || !questions?.length) return;
    const { next, effects } = transitionQuestions(questionsMachine, questions, action);
    if (next !== questionsMachine) {
      questionsMachine = next;
      snapshot = {
        ...snapshot,
        questions: {
          ...snapshot.questions,
          step: next.step,
          drafts: next.drafts,
          isLastStep: isLastStep(next, questions),
        },
      };
      notify();
    }
    executeQuestionsEffects(effects);
  };

  const setQuestions = (questions: ComposerQuestion[] | null) => {
    if (snapshot.questions.items === questions) return;
    questionsMachine = INITIAL_QUESTIONS_STATE;
    snapshot = {
      ...snapshot,
      questions: {
        ...snapshot.questions,
        active: questions != null,
        // Sticky, same as commands: cleared by finalizePanelClose() after the exit.
        present: questions != null || snapshot.questions.present,
        items: questions,
        step: questionsMachine.step,
        drafts: questionsMachine.drafts,
        isLastStep: questions ? isLastStep(questionsMachine, questions) : false,
        isSingle: questions ? questions.length === 1 : false,
      },
    };
    notify();
    if (questions) enterQuestions();
    else endQuestions();
  };

  // Question mode: while questions are active the options own the keyboard.
  // The keydown listener sits at the document, scoped by containment
  // (isEventForComposer) — so keys keep flowing after a chrome click drops
  // focus to <body>, while a second composer's editor/options never hear them.
  // The entry focus is enterQuestions' job.
  const activateQuestions = () => {
    const handleKeyDown = createQuestionsKeydownHandler({
      controller,
      optionsRef,
      editorRef,
      dispatch: dispatchQuestions,
    });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  };

  // --- Initial snapshot
  snapshot = {
    textarea: { hasContent: false },
    isSubmitting: false,
    commands: {
      active: false,
      present: false,
      trigger: null,
      query: "",
      highlightIndex: 0,
      activeOptionId: null,
    },
    attachments: {
      items: attachmentState.items,
      error: attachmentState.error,
      isDragging: false,
      add: (files) => dispatchAttachments({ type: "add", files }),
      remove: (id) => dispatchAttachments({ type: "remove", id }),
      openFileDialog: () => fileInputRef.current?.click(),
      fileInputRef,
      globalDropRef,
    },
    questions: {
      active: false,
      present: false,
      items: null,
      step: questionsMachine.step,
      drafts: questionsMachine.drafts,
      isLastStep: false,
      isSingle: false,
      toggleOption: (label) => dispatchQuestions({ type: "toggle-option", label }),
      continueStep: () =>
        dispatchQuestions({ type: "continue-step", buffer: readEditorBuffer(editorRef) }),
      dismissStep: () => dispatchQuestions({ type: "dismiss-step" }),
      clearSelections: () => dispatchQuestions({ type: "clear-selections" }),
      goBack: () => dispatchQuestions({ type: "step-back", buffer: readEditorBuffer(editorRef) }),
      goNext: () =>
        dispatchQuestions({ type: "step-forward", buffer: readEditorBuffer(editorRef) }),
      optionsRef,
    },
  };

  // Pristine state for reset() — slice actions and refs are reused, so action
  // identities stay stable across resets.
  const initialSnapshot = snapshot;

  // Clear `present` on any native panel slice whose `active` is now false — called by
  // the Panel once its close animation finishes, so the last content stays mounted
  // (and keeps animating) until then. Identity-guarded so it no-ops when nothing changed.
  const finalizePanelClose = () => {
    const { commands, questions } = snapshot;
    if (commands.present === commands.active && questions.present === questions.active) return;
    snapshot = {
      ...snapshot,
      commands:
        commands.present === commands.active ? commands : { ...commands, present: commands.active },
      questions:
        questions.present === questions.active
          ? questions
          : { ...questions, present: questions.active },
    };
    notify();
  };

  // --- Lifecycle
  // Drop everything mount-scoped when the Composer unmounts (route change):
  // revoke attachment object URLs, then restore the pristine snapshot.
  const reset = () => {
    dispatchAttachments({ type: "reset" });
    questionsMachine = INITIAL_QUESTIONS_STATE;
    cancelAnimationFrame(entryFocusFrame);
    mode = { kind: "message" };
    commandSelectRef.current = null;
    snapshot = initialSnapshot;
    notify();
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    setHasContent,
    setIsSubmitting,
    setCommands,
    setActiveOptionId,
    listboxId: "",
    moveHighlight,
    setHighlight,
    setQuestions,
    getEditorMode: () => mode,
    setMessageSnapshot,
    setDragging,
    resetAttachments: () => dispatchAttachments({ type: "reset" }),
    activateQuestions,
    finalizePanelClose,
    reset,
    editorRef,
    controller,
    registerEditor,
    containerRef,
    attachmentConfigRef,
    submitAnswersRef,
    stopGeneratingRef,
    commandSelectRef,
  };
};

// ---------------------------------------------------------------------------
// Instance resolution — the nearest <Composer>, explicitly. No global
// fallback: outside a composer tree, state comes from an explicit
// Composer.createStore() handle via useComposerStore.
// ---------------------------------------------------------------------------

export const ComposerStoreContext = createContext<ComposerStore | null>(null);

// Internal: parts resolve the store their Composer.Root provided.
export const useComposerContextStore = (): ComposerStore => {
  const store = use(ComposerStoreContext);
  if (!store) {
    throw new Error("Composer components must be used within <Composer>");
  }
  return store;
};

// Subscribe to an explicit Composer.createStore() instance — the
// outside-the-tree twin of useComposer (toolbars, status bars, shortcut
// handlers). Wrap it once per instance to drop the store argument at call
// sites:
//   const useChatComposer = <T,>(selector: (c: ComposerState) => T) =>
//     useComposerStore(chatComposerStore, selector);
export const useComposerStore = <Selected = ComposerState>(
  store: ComposerStore,
  selector?: (composer: ComposerState) => Selected,
): Selected => {
  const getValue = () => {
    const state = store.getSnapshot();
    // Safe: without a selector, Selected defaults to ComposerState.
    return selector ? selector(state) : (state as Selected);
  };
  return useSyncExternalStore(store.subscribe, getValue, getValue);
};

// Subscribe to composer state from inside the tree. With a selector, the
// component re-renders only when the selected value changes identity (slices
// are identity-stable):
//   const questions = useComposer((composer) => composer.questions);
// Without one, it returns the full snapshot and re-renders on any change.
export const useComposer = <Selected = ComposerState>(
  selector?: (composer: ComposerState) => Selected,
): Selected => useComposerStore(useComposerContextStore(), selector);
