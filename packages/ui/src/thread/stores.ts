// Scroll-edge + visibility stores for the thread. External (hand-rolled
// useSyncExternalStore stores) so a change re-renders only the components that
// read it, never the Thread tree — the context value stays referentially stable
// for the thread's lifetime. Pure; no React, no DOM.

// One boolean store per edge (top / bottom). Two independent stores rather than
// a single { atTop, atBottom } snapshot, so a flip at one edge never notifies
// the other's readers.
export const createEdgeStore = () => {
  let snapshot = true;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    setSnapshot: (next: boolean) => {
      if (snapshot === next) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type EdgeStore = ReturnType<typeof createEdgeStore>;

export type ThreadVisibilityState = {
  /** data-message-id values intersecting the viewport, in document order. */
  visibleMessageIds: string[];
  /** The topmost visible row — the one being read. */
  currentMessageId: string | null;
};

export const EMPTY_VISIBILITY: ThreadVisibilityState = {
  visibleMessageIds: [],
  currentMessageId: null,
};

export const visibilityStatesEqual = (a: ThreadVisibilityState, b: ThreadVisibilityState) =>
  a.currentMessageId === b.currentMessageId &&
  a.visibleMessageIds.length === b.visibleMessageIds.length &&
  a.visibleMessageIds.every((id, index) => id === b.visibleMessageIds[index]);

// Which data-message-id rows intersect the viewport. Lazy + ref-counted: the
// observers behind it exist only while at least one useThreadVisibility
// subscriber is mounted, so unsubscribed threads pay nothing.
export const createVisibilityStore = () => {
  let snapshot = EMPTY_VISIBILITY;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    setSnapshot: (next: ThreadVisibilityState) => {
      if (visibilityStatesEqual(snapshot, next)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe: (
      listener: () => void,
      onFirstSubscribe: () => void,
      onLastUnsubscribe: () => void,
    ) => {
      const wasEmpty = listeners.size === 0;
      listeners.add(listener);
      if (wasEmpty) onFirstSubscribe();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) onLastUnsubscribe();
      };
    },
  };
};

export type VisibilityStore = ReturnType<typeof createVisibilityStore>;
