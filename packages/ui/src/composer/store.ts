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
import type { AskUserOptionsHandle } from "../ask-user";
import {
  type AttachmentErrorCode,
  type AttachmentItem,
  revokeAttachmentUrl,
  toAttachmentItem,
} from "../attachments";
import {
  type AnswerEntry,
  type AskUserAction,
  type AskUserEffect,
  INITIAL_ASK_USER_STATE,
  isLastStep,
  transitionAskUser,
} from "./ask-user-machine";
import {
  type AttachmentStoreAction,
  type AttachmentStoreConfig,
  attachmentReducer,
  INITIAL_ATTACHMENT_STATE,
} from "./attachments-machine";
import { interpretAskUserKey } from "./keyboard";
import type {
  AskUserQuestion,
  ComposerEditorHandle,
  ComposerSubmitData,
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

export type ComposerAskUserState = ComposerPanelSlice & {
  questions: AskUserQuestion[] | null;
  step: number;
  answers: Map<number, AnswerEntry>;
  toggleOption: (label: string) => void;
  continueStep: (freeText?: string) => void;
  dismissStep: () => void;
  isLastStep: boolean;
  isSingle: boolean;
  clearSelections: () => void;
  goBack: () => void;
  goNext: () => void;
  optionsRef: RefObject<AskUserOptionsHandle | null>;
};

// The shared skeleton every native panel slice (commands, ask-user, and later
// tool-approval) is built on: `active` is the logical open flag a consumer gates
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
  askUser: ComposerAskUserState;
};

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
  setQuestions: (questions: AskUserQuestion[] | null) => void;
  setDragging: (active: boolean) => void;
  resetAttachments: () => void;
  activateAskUser: () => () => void;
  // Clears `present` on native panel slices whose `active` is false — the Panel calls
  // this once its close animation finishes, so closing content stays mounted until then.
  finalizePanelClose: () => void;
  /**
   * Sends the composer: advances the question step while questions are open,
   * otherwise delivers the message through the mounted Root's onSubmit and
   * clears the editor and attachments. Enter, Composer.Submit, and
   * AskUser.Continue all send through it.
   */
  submit: () => Promise<void>;
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
  // The mounted Composer.Root's element, a <form> when rendered as one.
  rootRef: RefObject<HTMLElement | null>;
  // Co-located refs the mounted Composer wires up at runtime.
  attachmentConfigRef: RefObject<AttachmentStoreConfig>;
  onSubmitRef: RefObject<((data: ComposerSubmitData) => void | Promise<void>) | null>;
  // The mounted Submit's stop while generating; Composer.Root calls it on Escape.
  stopGeneratingRef: RefObject<(() => void) | null>;
  // Invokes the active list's current selection. Registered by the mounted
  // CommandList via a callback ref (commit-time), not an effect.
  commandSelectRef: RefObject<(() => void) | null>;
};

// Enter and Composer.Submit send through the store, not a native submit, so a
// <form> root runs its validation here: a required, empty Composer.Textarea
// blocks an attachment-only send as it would a native submit.
const isRootValid = (root: HTMLElement | null) =>
  !(root instanceof HTMLFormElement) || root.noValidate || root.reportValidity();

// ---------------------------------------------------------------------------
// Ask-user keydown — the document-level handler for question mode, kept out of
// the store factory so activateAskUser reads as just "blur, listen, unlisten".
// ---------------------------------------------------------------------------

// Focus moves the ask-user flow makes itself — back to the input, or in from
// an option. The composer is on screen already, and the browser's
// focus-scroll would also move the page around an embedded composer.
const FOCUS_IN_PLACE: FocusOptions = { preventScroll: true };

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
  const optionsHost = target?.closest<HTMLElement>("[data-ask-user-options]");
  if (optionsHost) return optionsHost === optionsElement;
  return true;
};

type AskUserKeydownDeps = {
  controller: ComposerEditorState;
  optionsRef: RefObject<AskUserOptionsHandle | null>;
  editorRef: RefObject<RegisteredEditor | null>;
  dispatch: (action: AskUserAction) => void;
};

// Interpret a key (pure) and drive the machine + editor controller. Mirrors the
// action union from interpretAskUserKey one-to-one.
const createAskUserKeydownHandler =
  ({ controller, optionsRef, editorRef, dispatch }: AskUserKeydownDeps) =>
  (event: KeyboardEvent) => {
    const scopedOptionsElement = optionsRef.current?.getElement() ?? null;
    if (
      !isEventForComposer(
        event,
        editorRef.current?.getRootElement() ?? undefined,
        scopedOptionsElement,
      )
    ) {
      return;
    }

    const optionsHandle = optionsRef.current;
    const action = interpretAskUserKey(
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
        dispatch({ type: "step-back", currentText: controller.getText() });
        return;
      case "go-next":
        dispatch({ type: "step-forward", currentText: controller.getText() });
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
  const registerEditor = (editor: RegisteredEditor) => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  };

  // Imperative refs co-located with the store; not reactive.
  const containerRef: RefObject<HTMLElement | null> = { current: null };
  const rootRef: RefObject<HTMLElement | null> = { current: null };
  const optionsRef: RefObject<AskUserOptionsHandle | null> = { current: null };
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
  const onSubmitRef: RefObject<((data: ComposerSubmitData) => void | Promise<void>) | null> = {
    current: null,
  };
  const commandSelectRef: RefObject<(() => void) | null> = { current: null };
  const stopGeneratingRef: RefObject<(() => void) | null> = { current: null };

  // Canonical machine states; the snapshot mirrors them on every update.
  let attachmentState = INITIAL_ATTACHMENT_STATE;
  let askUserMachine = INITIAL_ASK_USER_STATE;
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

  // --- Ask-user
  // The execute half of the ask-user flow: replay a transition's effects
  // against the editor controller, the options handle, and the submit
  // callback. Input-content state is the editor engine's own job — engines
  // report programmatic setText/clear through their update path.
  const executeAskUserEffects = (effects: AskUserEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "clear-input":
          controller.clear();
          break;
        case "set-input-text":
          controller.setText(effect.text);
          break;
        case "focus-input":
          controller.focus(FOCUS_IN_PLACE);
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
          onSubmitRef.current?.({ kind: "answers", answers: effect.answers });
          break;
      }
    }
  };

  const dispatchAskUser = (action: AskUserAction) => {
    const questions = snapshot.askUser.questions;
    if (!questions || questions.length === 0) return;
    const { next, effects } = transitionAskUser(askUserMachine, questions, action);
    if (next !== askUserMachine) {
      askUserMachine = next;
      snapshot = {
        ...snapshot,
        askUser: {
          ...snapshot.askUser,
          step: next.step,
          answers: next.answers,
          isLastStep: isLastStep(next, questions),
        },
      };
      notify();
    }
    executeAskUserEffects(effects);
  };

  const setQuestions = (questions: AskUserQuestion[] | null) => {
    if (snapshot.askUser.questions === questions) return;
    askUserMachine = INITIAL_ASK_USER_STATE;
    snapshot = {
      ...snapshot,
      askUser: {
        ...snapshot.askUser,
        active: questions != null,
        // Sticky, same as commands: cleared by finalizePanelClose() after the exit.
        present: questions != null || snapshot.askUser.present,
        questions,
        step: askUserMachine.step,
        answers: askUserMachine.answers,
        isLastStep: questions ? isLastStep(askUserMachine, questions) : false,
        isSingle: questions ? questions.length === 1 : false,
      },
    };
    notify();
  };

  // Ask-user mode: while questions are active the options own the keyboard.
  // Entering moves DOM focus onto the highlighted option (roving tabindex),
  // and the keydown listener sits at the document, scoped by containment
  // (isEventForComposer) — so keys keep flowing after a chrome click drops
  // focus to <body>, while a second composer's editor/options never hear them.
  const activateAskUser = () => {
    const handleKeyDown = createAskUserKeydownHandler({
      controller,
      optionsRef,
      editorRef,
      dispatch: dispatchAskUser,
    });
    document.addEventListener("keydown", handleKeyDown);

    // The Options part renders in reaction to setQuestions' notify — one
    // commit after this call — so the entry focus defers a frame.
    const frame = requestAnimationFrame(() => {
      optionsRef.current?.focusHighlighted();
    });

    return () => {
      cancelAnimationFrame(frame);
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
    askUser: {
      active: false,
      present: false,
      questions: null,
      step: askUserMachine.step,
      answers: askUserMachine.answers,
      isLastStep: false,
      isSingle: false,
      toggleOption: (label) => dispatchAskUser({ type: "toggle-option", label }),
      continueStep: (freeText) =>
        dispatchAskUser({ type: "continue-step", freeText: freeText ?? "" }),
      dismissStep: () => dispatchAskUser({ type: "dismiss-step" }),
      clearSelections: () => dispatchAskUser({ type: "clear-selections" }),
      goBack: () => dispatchAskUser({ type: "step-back", currentText: controller.getText() }),
      goNext: () => dispatchAskUser({ type: "step-forward", currentText: controller.getText() }),
      optionsRef,
    },
  };

  const submit = async () => {
    const { askUser, attachments, isSubmitting } = snapshot;

    if (askUser.questions?.length) {
      askUser.continueStep(controller.getText());
      return;
    }

    if (isSubmitting || !isRootValid(rootRef.current)) return;

    const serialized = controller.serialize();
    const trimmedText = serialized.text.trim();
    if (!trimmedText && !attachments.items.length) return;

    // Emit the generic attachment descriptors; the consumer's onSubmit adapts
    // them to its wire format (e.g. FilePart via prepareAttachmentsForSend).
    // Text may be empty on an attachments-only submit — any placeholder copy
    // is the consumer's.
    const files = attachments.items;

    dispatchAttachments({ type: "reset" });
    controller.clear();

    await onSubmitRef.current?.({
      kind: "message",
      text: trimmedText,
      files,
    });
  };

  // Pristine state for reset() — slice actions and refs are reused, so action
  // identities stay stable across resets.
  const initialSnapshot = snapshot;

  // Clear `present` on any native panel slice whose `active` is now false — called by
  // the Panel once its close animation finishes, so the last content stays mounted
  // (and keeps animating) until then. Identity-guarded so it no-ops when nothing changed.
  const finalizePanelClose = () => {
    const { commands, askUser } = snapshot;
    if (commands.present === commands.active && askUser.present === askUser.active) return;
    snapshot = {
      ...snapshot,
      commands:
        commands.present === commands.active ? commands : { ...commands, present: commands.active },
      askUser:
        askUser.present === askUser.active ? askUser : { ...askUser, present: askUser.active },
    };
    notify();
  };

  // --- Lifecycle
  // Drop everything mount-scoped when the Composer unmounts (route change):
  // revoke attachment object URLs, then restore the pristine snapshot.
  const reset = () => {
    dispatchAttachments({ type: "reset" });
    askUserMachine = INITIAL_ASK_USER_STATE;
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
    setDragging,
    resetAttachments: () => dispatchAttachments({ type: "reset" }),
    activateAskUser,
    finalizePanelClose,
    submit,
    reset,
    editorRef,
    controller,
    registerEditor,
    containerRef,
    rootRef,
    attachmentConfigRef,
    onSubmitRef,
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
//   const askUser = useComposer((composer) => composer.askUser);
// Without one, it returns the full snapshot and re-renders on any change.
export const useComposer = <Selected = ComposerState>(
  selector?: (composer: ComposerState) => Selected,
): Selected => useComposerStore(useComposerContextStore(), selector);
