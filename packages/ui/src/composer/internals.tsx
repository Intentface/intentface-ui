"use client";

// Component-wiring shared by the composer parts: the internals context
// (command registry, editor-update reporting) and the small hooks the parts
// build on. Not consumer API.

import { createContext, type RefObject, use, useCallback, useEffect, useRef } from "react";
import { useIsomorphicLayoutEffect } from "../internal/iso-layout-effect";
import { createDragHandlers } from "./attachments-machine";
import type { RegisteredPrefix } from "./prefix-detection";
import type { ComposerStore } from "./store";
import type { ComposerCommandsMap, ComposerSnapshot } from "./types";

// ---------------------------------------------------------------------------
// Generic hooks — small, composer-agnostic utilities the parts build on.
// ---------------------------------------------------------------------------

// Re-exported so the composer parts keep importing it from one place.
export { useIsomorphicLayoutEffect };

// Mirror a prop into a ref so closures always see the latest value without
// having to add the prop to dep arrays. Layout effect ensures `.current` is
// updated before any sibling layout effect or sync user event observes it.
export const useAsRef = <T,>(value: T) => {
  const ref = useRef(value);
  useIsomorphicLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

// ---------------------------------------------------------------------------
// Internals context — command registry + editor-update reporting shared down
// the tree. Not consumer API.
// ---------------------------------------------------------------------------

export type ComposerInternalsValue = {
  commands: ComposerCommandsMap;
  getRegisteredPrefixes: () => RegisteredPrefix[];
  reportEditorUpdate: () => void;
};

export const ComposerInternalsContext = createContext<ComposerInternalsValue | null>(null);

export const useComposerInternals = (): ComposerInternalsValue => {
  const context = use(ComposerInternalsContext);
  if (!context) {
    throw new Error("useComposerInternals must be called inside a <Composer> subtree.");
  }
  return context;
};

// ---------------------------------------------------------------------------
// Feature hooks — the composer-specific wiring: command registry, drag-and-drop
// file intake, and the controlled/uncontrolled snapshot bridge.
// ---------------------------------------------------------------------------

export const useCommandRegistry = (commands: ComposerCommandsMap) => {
  const registryRef = useAsRef(commands);

  const getRegisteredPrefixes = useCallback((): RegisteredPrefix[] => {
    const result: RegisteredPrefix[] = [];
    for (const [prefix, entry] of Object.entries(registryRef.current)) {
      result.push({ prefix, triggerRule: entry.trigger });
    }
    return result;
  }, []);

  return { getRegisteredPrefixes };
};

export const useDragDropFiles = ({
  rootRef,
  globalDropRef,
  onFiles,
  setDragging,
}: {
  rootRef: RefObject<HTMLElement | null>;
  globalDropRef: RefObject<boolean>;
  onFiles: (files: FileList) => void;
  setDragging: (active: boolean) => void;
}) => {
  const onFilesRef = useAsRef(onFiles);

  useEffect(() => {
    const isInScope = (event: DragEvent) =>
      globalDropRef.current || (rootRef.current?.contains(event.target as Node) ?? false);

    const handlers = createDragHandlers({
      isInScope,
      onFiles: (files) => onFilesRef.current(files),
      setDragging,
    });

    document.addEventListener("dragover", handlers.onDragOver);
    document.addEventListener("dragenter", handlers.onDragEnter);
    document.addEventListener("dragleave", handlers.onDragLeave);
    document.addEventListener("drop", handlers.onDrop);
    return () => {
      document.removeEventListener("dragover", handlers.onDragOver);
      document.removeEventListener("dragenter", handlers.onDragEnter);
      document.removeEventListener("dragleave", handlers.onDragLeave);
      document.removeEventListener("drop", handlers.onDrop);
    };
  }, [rootRef, globalDropRef, setDragging]);
};

// The controlled/uncontrolled bridge for the message buffer only. Writes go
// through store.setMessageSnapshot, which lands them in the editor or, while
// questions run, in the parked message; reads skip the editor while it shows a
// question step's answer.
export const useComposerSnapshot = ({
  store,
  defaultValue,
  value,
  onValueChange,
}: {
  store: ComposerStore;
  defaultValue?: ComposerSnapshot;
  value?: ComposerSnapshot;
  onValueChange?: (snapshot: ComposerSnapshot) => void;
}): { reportEditorUpdate: () => void } => {
  const isControlled = value !== undefined;
  const lastAppliedRef = useRef<ComposerSnapshot | null>(null);
  const initializedRef = useRef(false);

  const onValueChangeRef = useAsRef(onValueChange);

  useEffect(() => {
    if (!store.editorRef.current || initializedRef.current) return;
    if (defaultValue) {
      store.setMessageSnapshot(defaultValue);
      lastAppliedRef.current = defaultValue;
    }
    initializedRef.current = true;
  }, [store, defaultValue]);

  useEffect(() => {
    if (!isControlled || !value) return;
    if (lastAppliedRef.current === value) return;
    store.setMessageSnapshot(value);
    lastAppliedRef.current = value;
  }, [store, isControlled, value]);

  const reportEditorUpdate = useCallback(() => {
    const editor = store.editorRef.current;
    if (!editor || !onValueChangeRef.current) return;
    if (store.getEditorMode().kind === "questions") return;
    const snapshot = editor.getSnapshot();
    lastAppliedRef.current = snapshot;
    onValueChangeRef.current(snapshot);
  }, [store]);

  return { reportEditorUpdate };
};
