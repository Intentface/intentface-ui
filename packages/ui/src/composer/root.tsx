"use client";

// Composer.Root — the div that owns the prop→store bridges, drag-drop scope,
// and the per-instance store resolution: an explicit Composer.createStore()
// handle via the store prop, or an instance created for this mount. Every bare
// <Composer> is fully isolated. It is not a form, so it can sit inside a
// consumer's own; render={<form />} makes it one.

import { useEffect, useId, useMemo, useSyncExternalStore } from "react";
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
import { createSizeTracker } from "./size";
import { type ComposerStore, ComposerStoreContext, createComposerStore } from "./store";
import type {
  AskUserQuestion,
  ComposerCommandsMap,
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

export type ComposerRootProps = Omit<PrimitiveProps<"div", ComposerRootState>, "onSubmit"> & {
  onSubmit?: (data: ComposerSubmitData) => void | Promise<void>;
  isSubmitting?: boolean;
  commands?: ComposerCommandsMap;
  questions?: AskUserQuestion[];
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
  const { store, ownsStore, sizeTracker } = useRefWithInit(() => {
    const resolved = storeProp ?? createComposerStore();
    resolved.listboxId = listboxId;
    return {
      store: resolved,
      ownsStore: !storeProp,
      sizeTracker: createSizeTracker(resolved.setSize),
    };
  }).current;

  const { rootRef } = store;

  const onSubmitRef = useAsRef(onSubmit);

  // React also runs this cleanup without a real unmount (StrictMode, a hidden
  // <Activity>), where the state lives on, so it only resets an owned store
  // once React has removed the root — that happens on a real unmount only.
  useEffect(() => {
    const root = store.rootRef.current;
    store.onSubmitRef.current = (data) => onSubmitRef.current?.(data);
    return () => {
      store.onSubmitRef.current = null;
      if (ownsStore && root && !root.isConnected) store.reset();
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

  // Sync the questions prop into the store and arm ask-user mode (editor blur
  // + document-level keyboard handling) while questions are active.
  useEffect(() => {
    store.setQuestions(questions ?? null);
    if (!questions?.length) return;
    return store.activateAskUser();
  }, [store, questions]);

  const { getRegisteredPrefixes } = useCommandRegistry(commands);

  useDragDropFiles({
    rootRef,
    globalDropRef,
    onFiles: addAttachments,
    setDragging: store.setDragging,
  });

  const { reportEditorUpdate } = useComposerSnapshot({
    editorRef: store.editorRef,
    defaultValue,
    value,
    onValueChange,
  });

  const handleFormSubmit = (event: React.SubmitEvent<HTMLElement>) => {
    const isFromNestedForm = event.target !== event.currentTarget;
    if (isFromNestedForm) return;
    event.preventDefault();
    void store.submit();
  };

  // Escape stops generating. React bubbles keys from portaled parts (a positioned
  // Panel) here too; a consumer's onKeyDown can skip it with preventPrimitiveHandler().
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const stopGenerating = store.stopGeneratingRef.current;
    if (event.key !== "Escape" || event.defaultPrevented || !stopGenerating) return;
    // While a question is open, Escape dismisses its step instead.
    if (store.getSnapshot().askUser.questions?.length) return;
    event.preventDefault();
    stopGenerating();
  };

  const internalsValue = useMemo<ComposerInternalsValue>(
    () => ({
      commands,
      getRegisteredPrefixes,
      reportEditorUpdate,
      attachContainer: sizeTracker.attachContainer,
    }),
    [commands, getRegisteredPrefixes, reportEditorUpdate, sizeTracker],
  );

  const rootElement = useRenderElement(
    "div",
    { className, render, style },
    {
      state: { submitting: isSubmitting, dragging: isDragging },
      ref: [rootRef, sizeTracker.attachRoot],
      props: [
        { "data-composer-root": "", onSubmit: handleFormSubmit, onKeyDown: handleKeyDown },
        elementProps,
      ],
    },
  );

  return (
    <ComposerStoreContext value={store}>
      <ComposerInternalsContext value={internalsValue}>{rootElement}</ComposerInternalsContext>
    </ComposerStoreContext>
  );
};
