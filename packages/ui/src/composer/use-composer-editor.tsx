"use client";

// useComposerEditor — the hand-rolled contenteditable engine. Owns the flat
// segment document, the caret, the trigger-token state, and every editing
// event; registers itself with the composer store as a RegisteredEditor.
//
// Two invariants:
// 1. The browser owns text editing (native typing, IME, autocorrect); the
//    model syncs FROM the DOM on input via read → diff → commit. Programmatic
//    operations (chips, paste, setText, intercepted deletes) are the only
//    imperative DOM writes, always a full render + caret restore.
// 2. Engine state lives outside React — createEditorEngine below is a plain
//    closure factory (the createAskUserKeydownHandler pattern). Renders are
//    driven by a version counter through useSyncExternalStore; chip visuals
//    mount through portals into engine-owned spans, so React never
//    reconciles the editable's children.

import {
  type ClipboardEventHandler,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Chip } from "../chip/index";
import { type ChipData, parseChipSegments } from "../chip-markdown";
import { isComposingKey } from "../internal/is-composing-key";
import { useRefWithInit } from "../internal/render/useRefWithInit";
import {
  documentToDomSpec,
  logicalRangeFromDom,
  readDocumentFromDom,
  readSelectionRange,
  renderDocumentToDom,
  scrollCaretIntoView,
  syncBadge,
  toReadable,
  writeCaretToDom,
} from "./editor-dom";
import { useAsRef, useComposerInternals, useIsomorphicLayoutEffect } from "./internals";
import { type ComposerSubmitOn, interpretEditorKey } from "./keyboard";
import { CLOSED_COMMAND_STATE, type RegisteredPrefix } from "./prefix-detection";
import {
  diffFlatText,
  documentLength,
  getPlainText,
  nextChipId,
  planBeforeInput,
  type SegmentDoc,
  type SnapshotParagraphNode,
  segmentsFromChipSegments,
  segmentsFromParagraphJSON,
  segmentsFromText,
  segmentsToParagraphJSON,
  serializeSegments,
  sliceSegments,
  spliceSegments,
  type TextChange,
  toFlatText,
  toScanText,
  truncateToFit,
} from "./segments";
import { type ComposerStore, useComposer, useComposerContextStore } from "./store";
import { closeActiveToken, trackActiveToken } from "./trigger-tracker";
import type { ComposerSnapshot, RegisteredEditor } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UseComposerEditorOptions = {
  disabled: boolean;
  autoFocus: boolean;
  maxLength?: number;
  /** Which Enter chord sends; the other soft-breaks. Defaults to "enter". */
  submitOn?: ComposerSubmitOn;
  value?: string;
  onValueChange?: (text: string) => void;
  renderChip?: (chip: ChipData) => ReactNode;
  // Consumer callbacks on the editable, native-textarea style. They run
  // before the engine; preventDefault in onKeyDown/onPaste/onCopy/onCut
  // overrides the engine's handling (focus/blur are bookkeeping and always
  // run — a native blur isn't cancelable either).
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onKeyUp?: KeyboardEventHandler<HTMLDivElement>;
  onPaste?: ClipboardEventHandler<HTMLDivElement>;
  onCopy?: ClipboardEventHandler<HTMLDivElement>;
  onCut?: ClipboardEventHandler<HTMLDivElement>;
};

export type ComposerEditableProps = {
  onFocus: FocusEventHandler<HTMLDivElement>;
  onBlur: FocusEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onKeyUp: KeyboardEventHandler<HTMLDivElement>;
  onPaste: ClipboardEventHandler<HTMLDivElement>;
  onCopy: ClipboardEventHandler<HTMLDivElement>;
  onCut: ClipboardEventHandler<HTMLDivElement>;
};

export type UseComposerEditorResult = {
  /** Attach to the contenteditable element; returns a React 19 ref cleanup. */
  attachRoot: (node: HTMLElement | null) => (() => void) | undefined;
  /** Spread onto the editable: consumer-then-engine composed event handlers. */
  editableProps: ComposerEditableProps;
  /** Chip visuals, portaled into the engine-owned inline spans. */
  chipPortals: ReactNode;
  hasContent: boolean;
  /** True while an IME composition is in progress — the placeholder overlay gates on it. */
  isComposing: boolean;
  /** The serialized submit text, for the hidden form-input mirror. */
  serializedText: string;
};

type CaretRange = { start: number; end: number };

// Live wiring the engine reads at event time — mirrored through a ref so the
// closures never go stale.
type EngineDependencies = {
  store: ComposerStore;
  getRegisteredPrefixes: () => RegisteredPrefix[];
  reportEditorUpdate: () => void;
  options: UseComposerEditorOptions;
};

// ---------------------------------------------------------------------------
// Engine factory — all state and behavior in one plain closure. The hook
// below is only the React shell (subscription, portals, controlled value).
// ---------------------------------------------------------------------------

const createEditorEngine = (getDependencies: () => EngineDependencies) => {
  // --- State
  let doc: SegmentDoc = [];
  let caret: CaretRange = { start: 0, end: 0 };
  let commandState = CLOSED_COMMAND_STATE;
  let isComposing = false;
  let chipRegistry = new Map<string, ChipData>();
  let chipElements = new Map<string, HTMLElement>();
  let root: HTMLElement | null = null;
  let version = 0;
  const listeners = new Set<() => void>();
  let detachSelectionListener: (() => void) | null = null;

  const bumpVersion = () => {
    version += 1;
    for (const listener of listeners) listener();
  };

  // --- Commit — the single funnel every state change flows through: tracker,
  // badge, store mirrors, value callbacks, version bump.

  const commit = (
    nextDoc: SegmentDoc,
    nextCaret: CaretRange,
    change: TextChange | null,
    docChanged: boolean,
  ) => {
    const { store, getRegisteredPrefixes, reportEditorUpdate, options } = getDependencies();

    doc = nextDoc;
    caret = nextCaret;
    chipRegistry = new Map(
      nextDoc.flatMap((segment) =>
        segment.type === "chip" ? [[segment.id, segment.chip] as const] : [],
      ),
    );

    commandState = trackActiveToken(commandState, {
      registered: getRegisteredPrefixes(),
      scanText: toScanText(nextDoc),
      caret: nextCaret.start,
      change,
    });
    syncBadgeAndCaret();

    const plainText = getPlainText(nextDoc);
    refreshHasContent();
    // Single-select questions clear their selection once the user starts
    // typing a free-text answer.
    if (docChanged && plainText.trim().length > 0) {
      const { askUser } = store.getSnapshot();
      const currentQuestion = askUser.questions?.[askUser.step];
      if (askUser.questions && !currentQuestion?.multiSelect) askUser.clearSelections();
      askUser.optionsRef.current?.clearHighlight();
    }
    mirrorCommandState();

    if (docChanged) {
      options.onValueChange?.(plainText);
      reportEditorUpdate();
      bumpVersion();
    }
  };

  // hasContent from the model — the placeholder overlay and data-filled key
  // off this through the store. Any content counts, including whitespace-only
  // docs: a lone "\n" (Shift+Enter on an empty editor) renders two line boxes,
  // and a trim-based check would paint the placeholder over them. This is
  // also legacy parity — its `|| !instance.isEmpty` half made structure count
  // — and native-textarea parity: the placeholder hides on any character.
  const refreshHasContent = () => {
    getDependencies().store.setHasContent(documentLength(doc) > 0);
  };

  // Make the badge span match the tracker state; a DOM change moves the
  // selection, so the logical caret is rewritten afterwards. Never during
  // composition — reparenting the composition's text node aborts the IME
  // session.
  const syncBadgeAndCaret = () => {
    if (!root || isComposing) return;
    const changed = syncBadge(
      root,
      commandState.isOpen
        ? {
            start: commandState.triggerStartPosition,
            end: commandState.triggerEndPosition,
            showPlaceholder: commandState.query === "",
          }
        : null,
    );
    if (changed) writeCaretToDom(root, caret.start, caret.end);
  };

  const mirrorCommandState = () => {
    getDependencies().store.setCommands({
      active: commandState.isOpen,
      trigger: commandState.trigger,
      query: commandState.query,
    });
  };

  // --- Programmatic pipeline — every model-initiated edit renders the
  // canonical DOM, restores the caret, and commits.

  const applyDocument = (nextDoc: SegmentDoc, caretPosition: number, change: TextChange | null) => {
    // The registry must know new chips before the next DOM read resolves them.
    chipRegistry = new Map(
      nextDoc.flatMap((segment) =>
        segment.type === "chip" ? [[segment.id, segment.chip] as const] : [],
      ),
    );
    if (root) {
      chipElements = renderDocumentToDom(root, nextDoc);
      writeCaretToDom(root, caretPosition);
    }
    commit(nextDoc, { start: caretPosition, end: caretPosition }, change, true);
    if (root) scrollCaretIntoView(root);
  };

  const spliceAndApply = (from: number, to: number, insert: SegmentDoc) => {
    const insertedLength = documentLength(insert);
    applyDocument(spliceSegments(doc, from, to, insert), from + insertedLength, {
      rangeStart: from,
      rangeEnd: to,
      insertedLength,
    });
  };

  const insertPlainText = (text: string) => {
    const { maxLength } = getDependencies().options;
    const { start, end } = caret;
    let insertedText = text;
    if (maxLength !== undefined) {
      const room = maxLength - (documentLength(doc) - (end - start));
      if (room <= 0) return;
      insertedText = insertedText.slice(0, room);
    }
    if (insertedText.length === 0) return;
    spliceAndApply(start, end, segmentsFromText(insertedText));
  };

  const setTextContent = (text: string) => {
    const previousLength = documentLength(doc);
    const nextDoc = segmentsFromText(text);
    applyDocument(nextDoc, documentLength(nextDoc), {
      rangeStart: 0,
      rangeEnd: previousLength,
      insertedLength: documentLength(nextDoc),
    });
  };

  // Renormalize after a dirty read: re-render the committed model and restore
  // the caret (extension leftovers, unknown spans, block wrappers).
  const renormalizeDom = () => {
    if (!root || isComposing) return;
    chipElements = renderDocumentToDom(root, doc);
    writeCaretToDom(root, caret.start, caret.end);
    syncBadgeAndCaret();
    bumpVersion();
  };

  // --- Read-back — DOM → model after a native edit. Idempotent: a no-diff,
  // same-caret sync is free, which makes the Chrome (input before
  // compositionend) and Safari (compositionend before input) orderings both
  // safe to double-fire.

  const syncFromDom = () => {
    if (!root) return;
    const { doc: readDoc, dirty } = readDocumentFromDom(
      toReadable(root),
      (id) => chipRegistry.get(id) ?? null,
    );
    const selection = readSelectionRange(root) ?? caret;
    const change = diffFlatText(toFlatText(doc), toFlatText(readDoc), selection.start);

    if (change !== null) {
      commit(readDoc, selection, change, true);
    } else if (selection.start !== caret.start || selection.end !== caret.end) {
      commit(doc, selection, null, false);
    }

    // Line-break parity invariant: browsers add and remove <br>s freely during
    // native edits — emptying can leave no <br> at all (the unpadded editable
    // collapses to zero height, hiding the caret and the placeholder overlay),
    // and typing before the padding <br> strands it mid-content, where later
    // reads count it as a phantom newline. Whenever the DOM's <br> count
    // diverges from the canonical rendering, repaint from the model. Plain
    // typing never diverges, so the native fast path stays untouched.
    const domBreakCount = root.querySelectorAll("br").length;
    const canonicalBreakCount = documentToDomSpec(doc).filter((spec) => spec.kind === "br").length;
    if (dirty || domBreakCount !== canonicalBreakCount) renormalizeDom();
  };

  // --- Command closing — Escape / Dismiss / blur / post-selection all funnel
  // here; the tracker records the dismissal memory itself.

  const closeCommands = () => {
    if (!commandState.isOpen && commandState.dismissedAt === null) return;
    commandState = closeActiveToken(commandState);
    syncBadgeAndCaret();
    mirrorCommandState();
  };

  const focusEditor = (options?: FocusOptions) => {
    if (!root) return;
    root.focus(options);
    writeCaretToDom(root, caret.start, caret.end);
    // Focus scrolls the editor box into view (unless prevented), not the
    // caret: keep the caret visible inside the composer's own scroll area.
    scrollCaretIntoView(root);
  };

  // --- Event handlers (attached as native listeners — React synthetics
  // polyfill beforeinput and lose getTargetRanges timing).

  const handleBeforeInput = (event: InputEvent) => {
    if (isComposing || !root) return;

    let targetRange: CaretRange | null = null;
    const nativeRange = event.getTargetRanges()[0];
    if (nativeRange) {
      const editable = root;
      const start = logicalRangeFromDom(
        toReadable(editable),
        toReadable(nativeRange.startContainer),
        nativeRange.startOffset,
      );
      const end = logicalRangeFromDom(
        toReadable(editable),
        toReadable(nativeRange.endContainer),
        nativeRange.endOffset,
      );
      if (start !== null && end !== null) {
        targetRange = { start: Math.min(start, end), end: Math.max(start, end) };
      }
    }
    // Fallback for synthetic deletes without target ranges: expand a collapsed
    // caret one unit in the delete direction so chip adjacency is still caught.
    if (!targetRange && caret.start === caret.end) {
      if (event.inputType === "deleteContentBackward" && caret.start > 0) {
        targetRange = { start: caret.start - 1, end: caret.start };
      } else if (event.inputType === "deleteContentForward") {
        targetRange = { start: caret.start, end: caret.start + 1 };
      }
    }

    const plan = planBeforeInput({
      inputType: event.inputType,
      data: event.data,
      targetRange,
      doc,
      caret,
      maxLength: getDependencies().options.maxLength,
    });

    if (plan.kind === "native") return;
    event.preventDefault();
    if (plan.kind === "block") return;
    spliceAndApply(plan.from, plan.to, plan.insert);
  };

  const handleInput = (event: Event) => {
    if (isComposing || (event as InputEvent).isComposing) return;
    syncFromDom();
  };

  // Composition flips are version-bumped so React re-renders: the textarea
  // gates its placeholder overlay on !isComposing (the browser paints marked
  // text without any commit, so hasContent alone would lag until
  // compositionend). hasContent itself stays single-writer, model-derived.
  const handleCompositionStart = () => {
    isComposing = true;
    bumpVersion();
  };

  const handleCompositionEnd = () => {
    isComposing = false;
    syncFromDom();
    // A cancelled composition leaves no diff → no commit → no bump; bump
    // explicitly so the overlay can return on an empty editor.
    bumpVersion();
    // insertCompositionText is not cancelable — the cap is enforced at commit:
    // the one sanctioned post-IME rewrite.
    const { maxLength } = getDependencies().options;
    if (maxLength !== undefined && documentLength(doc) > maxLength) {
      const overflow = documentLength(doc);
      applyDocument(sliceSegments(doc, 0, maxLength), Math.min(caret.start, maxLength), {
        rangeStart: maxLength,
        rangeEnd: overflow,
        insertedLength: 0,
      });
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isComposingKey(event)) return;

    const { store, options } = getDependencies();
    const action = interpretEditorKey(
      { key: event.key, shiftKey: event.shiftKey },
      {
        isCommandListOpen: commandState.isOpen,
        hasActiveAskUser: (store.getSnapshot().askUser.questions?.length ?? 0) > 0,
        isEditorEmpty: getPlainText(doc) === "",
        hasAttachments: store.getSnapshot().attachments.items.length > 0,
        submitOn: options.submitOn,
      },
    );
    if (!action) return;

    switch (action.type) {
      case "command-select": {
        event.preventDefault();
        store.commandSelectRef.current?.();
        return;
      }
      case "command-close": {
        event.preventDefault();
        closeCommands();
        return;
      }
      case "command-navigate": {
        event.preventDefault();
        store.moveHighlight(action.direction);
        return;
      }
      case "command-caret": {
        // Trap the caret inside the active token: clamp Left/Right to the
        // token range so it can't leave while the popup is open (Escape /
        // Dismiss is the only way out).
        event.preventDefault();
        if (commandState.isOpen && root) {
          const current = caret.start;
          const target = Math.min(
            Math.max(current + action.direction, commandState.triggerStartPosition),
            commandState.triggerEndPosition,
          );
          if (target !== current) {
            caret = { start: target, end: target };
            writeCaretToDom(root, target);
          }
        }
        return;
      }
      case "ask-user-arrow": {
        // navigate() moves DOM focus onto the newly highlighted option
        // (roving tabindex) — never blur to <body>. At the list boundary
        // (null) focus stays in the editor.
        event.preventDefault();
        store.getSnapshot().askUser.optionsRef.current?.navigate(action.direction);
        return;
      }
      case "ask-user-dismiss": {
        event.preventDefault();
        store.getSnapshot().askUser.dismissStep();
        return;
      }
      case "remove-last-attachment": {
        event.preventDefault();
        const { items, remove } = store.getSnapshot().attachments;
        const lastItem = items.at(-1);
        if (lastItem) remove(lastItem.id);
        return;
      }
      case "submit-form": {
        event.preventDefault();
        (event.target as HTMLElement).closest("form")?.requestSubmit();
        return;
      }
      case "soft-break": {
        // The browser's own insertParagraph must be blocked — it would split
        // the editable into block children the flat model doesn't represent.
        event.preventDefault();
        // A line break is a deliberate exit from an active trigger token —
        // dismiss it like Escape (with re-entry suppression) before inserting,
        // so the popup doesn't linger under the new line.
        if (commandState.isOpen) closeCommands();
        insertPlainText("\n");
        return;
      }
    }
  };

  // Caret-only moves don't fire input — this is the engine's equivalent of
  // selection-only transactions. Attached on focus, detached on blur, so only
  // the focused composer ever listens. Reentry-safe by idempotence: the
  // engine's own writeCaretToDom calls update `caret` first, so the resulting
  // event compares equal and dies.
  const handleSelectionChange = () => {
    if (isComposing || !root) return;
    const selection = readSelectionRange(root);
    if (!selection) return;
    if (selection.start === caret.start && selection.end === caret.end) return;
    commit(doc, selection, null, false);
  };

  const handleFocus = () => {
    getDependencies().store.getSnapshot().askUser.optionsRef.current?.clearHighlight();
    if (!root) return;
    const ownerDocument = root.ownerDocument;
    ownerDocument.addEventListener("selectionchange", handleSelectionChange);
    detachSelectionListener = () =>
      ownerDocument.removeEventListener("selectionchange", handleSelectionChange);
  };

  // Losing focus dismisses an open command list (click-outside, tab-away).
  // Command items and the popover chrome preventDefault their mousedown, so
  // interacting with the list keeps focus and never triggers this.
  const handleBlur = () => {
    detachSelectionListener?.();
    detachSelectionListener = null;
    if (commandState.isOpen) closeCommands();
  };

  const handlePaste = (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (items) {
      const files = [...items]
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (files.length) {
        event.preventDefault();
        getDependencies().store.getSnapshot().attachments.add(files);
        return;
      }
    }

    // The engine owns all text paste — arbitrary clipboard markup must never
    // reach the contenteditable.
    event.preventDefault();
    const pastedText = event.clipboardData?.getData("text/plain")?.replace(/\r\n?/g, "\n");
    if (!pastedText) return;

    let insert = pastedText.includes("(chip:")
      ? segmentsFromChipSegments(parseChipSegments(pastedText))
      : segmentsFromText(pastedText);

    const { maxLength } = getDependencies().options;
    const { start, end } = caret;
    if (maxLength !== undefined) {
      const room = maxLength - (documentLength(doc) - (end - start));
      insert = truncateToFit(insert, room);
      if (documentLength(insert) === 0) return;
    }
    spliceAndApply(start, end, insert);
  };

  // Copy/cut emit chip markdown (the wire format) — native copy would degrade
  // chips to their visual label text and silently lose the chip data.
  const handleCopy = (event: ClipboardEvent) => {
    const { start, end } = caret;
    if (start === end || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      serializeSegments(sliceSegments(doc, start, end)).text,
    );
  };

  const handleCut = (event: ClipboardEvent) => {
    const { start, end } = caret;
    if (start === end || !event.clipboardData) return;
    handleCopy(event);
    if (!getDependencies().options.disabled) spliceAndApply(start, end, []);
  };

  // --- RegisteredEditor — the seam the store, controller, and shared command
  // list drive.

  const registeredEditor: RegisteredEditor = {
    focus: focusEditor,
    blur: () => root?.blur(),
    clear: () => setTextContent(""),
    insertText: insertPlainText,
    insertChip: (chip) => {
      spliceAndApply(caret.start, caret.end, [{ type: "chip", id: nextChipId(), chip }]);
    },
    getText: () => getPlainText(doc),
    setText: setTextContent,
    serialize: () => serializeSegments(doc),
    isFocused: () => root !== null && root.ownerDocument.activeElement === root,
    getRootElement: () => root,
    getSnapshot: () =>
      ({
        __doc: { type: "doc", content: segmentsToParagraphJSON(doc) },
        __brand: "ComposerSnapshot",
      }) as ComposerSnapshot,
    applySnapshot: (snapshot) => {
      const snapshotDoc = snapshot.__doc as { content?: SnapshotParagraphNode[] };
      const nextDoc = segmentsFromParagraphJSON(snapshotDoc.content ?? []);
      const previousLength = documentLength(doc);
      applyDocument(nextDoc, documentLength(nextDoc), {
        rangeStart: 0,
        rangeEnd: previousLength,
        insertedLength: documentLength(nextDoc),
      });
    },
    // Replace the active trigger token with the chip, plus a trailing space
    // so the user can keep typing — unless one already follows.
    insertChipAtTrigger: (chip) => {
      const from = commandState.triggerStartPosition;
      const to = commandState.isOpen ? commandState.triggerEndPosition : caret.start;

      const chipSegment = { type: "chip", id: nextChipId(), chip } as const;
      const afterChip = spliceSegments(doc, from, to, [chipSegment]);
      const charAfter = toScanText(afterChip).slice(from + 1, from + 2);
      const needsSpace = charAfter !== " ";
      const nextDoc = needsSpace
        ? spliceSegments(afterChip, from + 1, from + 1, segmentsFromText(" "))
        : afterChip;

      const { maxLength } = getDependencies().options;
      if (maxLength !== undefined && documentLength(nextDoc) > maxLength) return;

      focusEditor();
      applyDocument(nextDoc, from + (needsSpace ? 2 : 1), {
        rangeStart: from,
        rangeEnd: to,
        insertedLength: needsSpace ? 2 : 1,
      });
    },
    deleteTrigger: () => {
      if (!commandState.isOpen) return;
      focusEditor();
      spliceAndApply(commandState.triggerStartPosition, commandState.triggerEndPosition, []);
    },
    closeCommands,
    dismissCommands: () => {
      // The editor is on screen already: moving focus back must not scroll the page.
      root?.focus({ preventScroll: true });
      closeCommands();
    },
  };

  // --- Mount — the input-pipeline listeners stay native (getTargetRanges
  // must be read off the real beforeinput event; composition timing is
  // synthetic-hostile). The interactive events (keydown, focus/blur,
  // clipboard) are exposed below and attached as React handlers so consumer
  // callbacks compose with native-textarea override semantics.

  const attach = (node: HTMLElement | null): (() => void) | undefined => {
    if (!node) return undefined;
    root = node;
    chipElements = renderDocumentToDom(node, doc);

    node.addEventListener("beforeinput", handleBeforeInput);
    node.addEventListener("input", handleInput);
    node.addEventListener("compositionstart", handleCompositionStart);
    node.addEventListener("compositionend", handleCompositionEnd);

    const unregister = getDependencies().store.registerEditor(registeredEditor);

    if (getDependencies().options.autoFocus) focusEditor();

    return () => {
      node.removeEventListener("beforeinput", handleBeforeInput);
      node.removeEventListener("input", handleInput);
      node.removeEventListener("compositionstart", handleCompositionStart);
      node.removeEventListener("compositionend", handleCompositionEnd);
      detachSelectionListener?.();
      detachSelectionListener = null;
      unregister();
      root = null;
    };
  };

  // Controlled value → engine. The getText-equality check both swallows the
  // onValueChange echo and protects chips from being wiped by a chip-less
  // round-tripped string (legacy parity).
  const applyControlledText = (value: string | undefined) => {
    if (value === undefined || isComposing) return;
    if (value === getPlainText(doc)) return;
    setTextContent(value);
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getVersion: () => version,
    getDoc: () => doc,
    getChipElement: (id: string) => chipElements.get(id),
    getIsComposing: () => isComposing,
    attach,
    applyControlledText,
    // Interactive handlers, composed with consumer callbacks by the hook.
    handleKeyDown,
    handleFocus,
    handleBlur,
    handlePaste,
    handleCopy,
    handleCut,
  };
};

// ---------------------------------------------------------------------------
// Hook — the React shell over the engine.
// ---------------------------------------------------------------------------

export const useComposerEditor = (options: UseComposerEditorOptions): UseComposerEditorResult => {
  const store = useComposerContextStore();
  const hasContent = useComposer((composer) => composer.textarea.hasContent);
  const { getRegisteredPrefixes, reportEditorUpdate } = useComposerInternals();

  const dependenciesRef = useAsRef<EngineDependencies>({
    store,
    getRegisteredPrefixes,
    reportEditorUpdate,
    options,
  });

  const engine = useRefWithInit(() => createEditorEngine(() => dependenciesRef.current)).current;

  useSyncExternalStore(engine.subscribe, engine.getVersion, engine.getVersion);

  // Controlled value → engine: pushing a prop into a non-React external
  // system is what effects are for (the useComposerSnapshot precedent).
  useIsomorphicLayoutEffect(() => {
    engine.applyControlledText(options.value);
  }, [engine, options.value]);

  // Consumer-then-engine composition — native-textarea override semantics:
  // preventDefault in the consumer's handler stops the engine (and, for
  // keydown, the browser default) exactly like it would on a real textarea.
  // Focus/blur engine handling is bookkeeping (selectionchange lifecycle,
  // command-list close) and always runs.
  const editableProps: ComposerEditableProps = {
    onFocus: (event) => {
      dependenciesRef.current.options.onFocus?.(event);
      engine.handleFocus();
    },
    onBlur: (event) => {
      dependenciesRef.current.options.onBlur?.(event);
      engine.handleBlur();
    },
    onKeyDown: (event) => {
      dependenciesRef.current.options.onKeyDown?.(event);
      if (event.defaultPrevented) return;
      engine.handleKeyDown(event.nativeEvent);
      const isHandledByEngine = event.nativeEvent.defaultPrevented;
      if (isHandledByEngine) event.preventDefault();
    },
    onKeyUp: (event) => {
      dependenciesRef.current.options.onKeyUp?.(event);
    },
    onPaste: (event) => {
      dependenciesRef.current.options.onPaste?.(event);
      if (!event.defaultPrevented) engine.handlePaste(event.nativeEvent);
    },
    onCopy: (event) => {
      dependenciesRef.current.options.onCopy?.(event);
      if (!event.defaultPrevented) engine.handleCopy(event.nativeEvent);
    },
    onCut: (event) => {
      dependenciesRef.current.options.onCut?.(event);
      if (!event.defaultPrevented) engine.handleCut(event.nativeEvent);
    },
  };

  const chipPortals = engine.getDoc().flatMap((segment) => {
    if (segment.type !== "chip") return [];
    const element = engine.getChipElement(segment.id);
    if (!element) return [];
    return [
      createPortal(
        options.renderChip?.(segment.chip) ?? (
          <Chip.Root>
            <Chip.Label>{segment.chip.label}</Chip.Label>
          </Chip.Root>
        ),
        element,
        segment.id,
      ),
    ];
  });

  return {
    attachRoot: engine.attach,
    editableProps,
    chipPortals,
    hasContent,
    isComposing: engine.getIsComposing(),
    serializedText: serializeSegments(engine.getDoc()).text,
  };
};
