"use client";

// Composer.Root — the form element that owns the submit flow, prop→store
// bridges, drag-drop scope, and the per-instance store resolution: an explicit
// Composer.createStore() handle via the store prop, or an instance created for
// this mount. Every bare <Composer> is fully isolated.

import { useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRefWithInit } from "../internal/render/useRefWithInit";
import { useRenderElement } from "../internal/render/useRenderElement";
import {
  ComposerInternalsContext,
  type ComposerInternalsValue,
  useAsRef,
  useCommandRegistry,
  useComposerSnapshot,
  useDragDropFiles,
} from "./internals";
import { type ComposerStore, ComposerStoreContext, createComposerStore } from "./store";
import type {
  ComposerCommandsMap,
  ComposerQuestion,
  ComposerSnapshot,
  ComposerSubmitData,
} from "./types";

const EMPTY_COMMANDS: ComposerCommandsMap = {};

export type ComposerRootState = {
  /** Present as data-submitting while a submission is in flight. */
  submitting: boolean;
  /** Present as data-dragging while files are dragged over the drop scope. */
  dragging: boolean;
};

export type ComposerRootProps = Omit<PrimitiveProps<"form", ComposerRootState>, "onSubmit"> & {
  onSubmit?: (data: ComposerSubmitData) => void | Promise<void>;
  isSubmitting?: boolean;
  commands?: ComposerCommandsMap;
  questions?: ComposerQuestion[];
  defaultValue?: ComposerSnapshot;
  value?: ComposerSnapshot;
  onValueChange?: (snapshot: ComposerSnapshot) => void;
  /** Explicit Composer.createStore() handle; defaults to a per-mount instance. */
  store?: ComposerStore;
};

export const ComposerRoot = ({
  onSubmit,
  isSubmitting = false,
  commands = EMPTY_COMMANDS,
  questions,
  defaultValue,
  value,
  onValueChange,
  store: storeProp,
  className,
  render,
  style,
  ...elementProps
}: ComposerRootProps) => {
  // SSR-stable per-mount id for the command listbox (aria-controls target +
  // option-id root). Assigned onto the store in init below — the factory
  // can't mint it because explicit handles are created outside React.
  const listboxId = useId();

  // Resolved once at mount (lazy-init ref, not reactive state): an explicit
  // handle, or an instance this mount creates and owns. Swapping the store
  // prop after mount is not supported.
  const { store, ownsStore } = useRefWithInit(() => {
    const resolved = storeProp ?? createComposerStore();
    resolved.listboxId = listboxId;
    return { store: resolved, ownsStore: !storeProp };
  }).current;

  const formRef = useRef<HTMLFormElement | null>(null);

  const onSubmitRef = useAsRef(onSubmit);

  // Register this mount on the store: answers submit through this mount's
  // onSubmit. React also runs the cleanup without a real unmount
  // (StrictMode, a hidden <Activity>), where the state lives on, so it only
  // resets an owned store once React has removed the form — that happens on a
  // real unmount only.
  useEffect(() => {
    const form = formRef.current;
    store.submitAnswersRef.current = (answers) =>
      onSubmitRef.current?.({ kind: "answers", answers });
    return () => {
      store.submitAnswersRef.current = null;
      if (ownsStore && form && !form.isConnected) store.reset();
    };
  }, [store, ownsStore]);

  // Prop → store bridges. Actions and refs on the snapshot are identity-stable,
  // so reading them here without subscribing is safe.
  const { add: addAttachments, globalDropRef } = store.getSnapshot().attachments;

  // Subscribed on the resolved store (not through useComposer — a `store` prop
  // may differ from the nearest context) to surface drag state as data-dragging.
  const getIsDragging = () => store.getSnapshot().attachments.isDragging;
  const isDragging = useSyncExternalStore(store.subscribe, getIsDragging, getIsDragging);

  useEffect(() => {
    store.setIsSubmitting(isSubmitting);
  }, [store, isSubmitting]);

  // Sync the questions prop into the store and arm question mode (editor blur
  // + document-level keyboard handling) while questions are active. An empty
  // array is normalized to null — otherwise the slice reads active with no
  // content to render and no keyboard handler attached.
  const activeQuestions = questions?.length ? questions : null;
  useEffect(() => {
    store.setQuestions(activeQuestions);
    if (!activeQuestions) return;
    return store.activateQuestions();
  }, [store, activeQuestions]);

  const { getRegisteredPrefixes } = useCommandRegistry(commands);

  useDragDropFiles({
    rootRef: formRef,
    globalDropRef,
    onFiles: addAttachments,
    setDragging: store.setDragging,
  });

  const { reportEditorUpdate } = useComposerSnapshot({
    store,
    defaultValue,
    value,
    onValueChange,
  });

  const handleFormSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { questions, attachments } = store.getSnapshot();

    if (store.getEditorMode().kind === "questions") {
      questions.continueStep();
      return;
    }

    if (isSubmitting) return;

    const serialized = store.controller.serialize();
    const trimmedText = serialized.text.trim();
    if (!trimmedText && !attachments.items.length) return;

    // Emit the generic attachment descriptors; the consumer's onSubmit adapts
    // them to its wire format (e.g. FilePart via prepareAttachmentsForSend).
    // Text may be empty on an attachments-only submit — any placeholder copy
    // is the consumer's.
    const files = attachments.items;

    store.resetAttachments();
    store.controller.clear();

    await onSubmitRef.current?.({
      kind: "message",
      text: trimmedText,
      files,
    });
  };

  // Escape stops generating. React bubbles keys from portaled parts (a positioned
  // Panel) here too; a consumer's onKeyDown can skip it with preventPrimitiveHandler().
  const handleKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    const stopGenerating = store.stopGeneratingRef.current;
    if (event.key !== "Escape" || event.defaultPrevented || !stopGenerating) return;
    // While a question is open, Escape dismisses its step instead.
    if (store.getEditorMode().kind === "questions") return;
    event.preventDefault();
    stopGenerating();
  };

  const internalsValue = useMemo<ComposerInternalsValue>(
    () => ({
      commands,
      getRegisteredPrefixes,
      reportEditorUpdate,
    }),
    [commands, getRegisteredPrefixes, reportEditorUpdate],
  );

  const formElement = useRenderElement(
    "form",
    { className, render, style },
    {
      state: { submitting: isSubmitting, dragging: isDragging },
      ref: formRef,
      props: [
        { "data-composer-root": "", onSubmit: handleFormSubmit, onKeyDown: handleKeyDown },
        elementProps,
      ],
    },
  );

  return (
    <ComposerStoreContext value={store}>
      <ComposerInternalsContext value={internalsValue}>{formElement}</ComposerInternalsContext>
    </ComposerStoreContext>
  );
};
