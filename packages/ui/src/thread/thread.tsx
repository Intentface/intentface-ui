"use client";

// Headless thread: the scroll subsystem (at-bottom detection, auto-scroll
// landing/follow, composer-inset measurement) plus unstyled structural parts.
// The only styles emitted are behavior-critical (positioning/overflow/sentinel
// size/reserve), applied inline; everything visual belongs to the styled layer.
//
// Layout contract:
//   - Thread.Content's children are turns (Message.Turn). While a top-landing
//     mode is active it sets min-height: var(--thread-turn-min-height, 0px)
//     inline on its last child, so the newest turn can land at the top.
//   - The landing gap is the space above Thread.Content inside the scroller:
//     put top padding on a wrapper around it.
//   - Thread.Composer positions itself (absolute, along the root's bottom edge).
//     Pad the bottom of the same wrapper by --thread-dock-inset so the last
//     turn clears it.
//   - Thread.Root writes --thread-dock-inset, --thread-dock-height,
//     --thread-dock-width and --thread-turn-area (see useThreadInsets).

import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent,
  use,
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type WheelEvent,
} from "react";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRefWithInit } from "../internal/render/useRefWithInit";
import { useRenderElement } from "../internal/render/useRenderElement";
import {
  DEFAULT_BOTTOM_OFFSET,
  measureDockInset,
  measureDockSize,
  measureTopInset,
  queryDock,
  readViewportBox,
  resolveScrollBehavior,
  sameViewportBox,
  scrollContainerTo,
  wasPrepended,
} from "./geometry";
import { createLastChildReserve } from "./reserve";
import {
  createEdgeStore,
  createVisibilityStore,
  type EdgeStore,
  EMPTY_VISIBILITY,
  type ThreadVisibilityState,
  type VisibilityStore,
} from "./stores";

export type { ThreadVisibilityState } from "./stores";

// Latest-ref: read the current value from long-lived effects/callbacks without
// re-subscribing them when it changes.
const useAsRef = <T,>(value: T) => {
  const ref = useRef(value);
  useInsertionEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
};

// ---------------------------------------------------------------------------
// Thread context — a small, generic primitive surface. Auto-scroll behavior is
// driven by the <Thread autoScroll> prop; nothing here knows about chats or
// messages beyond the opt-in data-message-id row contract.
// ---------------------------------------------------------------------------

export type ThreadScrollToMessageOptions = {
  /** Viewport edge (or center) to align the row to; scrollIntoView's block. */
  align?: "start" | "center" | "end" | "nearest";
  behavior?: ScrollBehavior;
};

type ThreadContextValue = {
  atTopStore: EdgeStore;
  atBottomStore: EdgeStore;
  visibilityStore: VisibilityStore;
  observeVisibility: () => void;
  unobserveVisibility: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollToTop: (behavior?: ScrollBehavior) => void;
  scrollToMessage: (messageId: string, options?: ThreadScrollToMessageOptions) => boolean;
  releaseFollow: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  topSentinelRef: RefObject<HTMLDivElement | null>;
  bottomSentinelRef: RefObject<HTMLDivElement | null>;
};

const ThreadContext = createContext<ThreadContextValue | null>(null);

const useThreadContext = () => {
  const ctx = use(ThreadContext);
  if (!ctx) throw new Error("useThread must be used within <Thread>");
  return ctx;
};

/**
 * Public thread surface. Subscribes to the scroll edges, so call it where
 * isAtTop / isAtBottom are actually read (e.g. a scroll button or a load-older
 * trigger); the commands and refs are stable and never cause re-renders.
 */
export const useThread = () => {
  const {
    atTopStore,
    atBottomStore,
    scrollToBottom,
    scrollToTop,
    scrollToMessage,
    scrollRef,
    contentRef,
  } = useThreadContext();
  const isAtTop = useSyncExternalStore(
    atTopStore.subscribe,
    atTopStore.getSnapshot,
    atTopStore.getSnapshot,
  );
  const isAtBottom = useSyncExternalStore(
    atBottomStore.subscribe,
    atBottomStore.getSnapshot,
    atBottomStore.getSnapshot,
  );
  return {
    isAtTop,
    isAtBottom,
    scrollToBottom,
    scrollToTop,
    scrollToMessage,
    scrollRef,
    contentRef,
  };
};

/**
 * Which data-message-id rows are in view, plus the topmost one (the row being
 * read). Subscribing lazily spins up the tracking observers; when the last
 * subscriber unmounts they are torn down, so unused threads pay nothing.
 */
export const useThreadVisibility = (): ThreadVisibilityState => {
  const { visibilityStore, observeVisibility, unobserveVisibility } = useThreadContext();
  const subscribe = useCallback(
    (listener: () => void) =>
      visibilityStore.subscribe(listener, observeVisibility, unobserveVisibility),
    [visibilityStore, observeVisibility, unobserveVisibility],
  );
  return useSyncExternalStore(subscribe, visibilityStore.getSnapshot, visibilityStore.getSnapshot);
};

// ---------------------------------------------------------------------------
// useThreadScroll — owns the thread's scroll subsystem: the scroll/content/
// sentinel refs, at-bottom detection, the scroll commands, and the autoScroll
// landing/follow behavior. Returns the value for ThreadContext. autoScroll modes:
//   "off"    no landing, no follow, no reserve — a plain scroll area.
//   "bottom" newest lands at the bottom and the view follows the stream (Codex).
//   "jump"   newest lands at the top (reserve); the view does not follow.
//   "follow" newest lands at the top and the view follows the stream (ChatGPT).
// Every active mode lands the newest turn on send; the reserve lifts the landing
// point to the top, follow tracks streaming growth. The landing runs in a layout
// effect so the initial land + reserve apply before paint (no top-then-jump
// flash); it runs after useThreadInsets in ThreadRoot, so --thread-turn-area is
// set before the reserve references it.
//
// The follow is released by deliberate upward reading intent — an upward
// wheel/touch/scroll-key gesture on the viewport, or the sentinel leaving view
// outside a programmatic scroll (a scrollbar drag) — and re-armed whenever the
// sentinel comes back into view. Content growth alone can never release it:
// every scroll we start marks autoScrollingRef, so the sentinel briefly leaving
// view mid-animation (a large code block landing at once, a stream outrunning
// the smooth scroll) is not mistaken for the user scrolling away. The release
// is decisive: follow consults only the intent ref, never the (async, one
// frame stale) at-bottom snapshot, so a released follow can never scroll.
// ---------------------------------------------------------------------------

export type ThreadAutoScrollMode = "off" | "bottom" | "jump" | "follow";

// Keys that scroll the viewport *upward* and therefore count as deliberate
// reading intent, releasing the follow. Downward keys never release: at the
// bottom they cause no scroll (and so no re-arming at-bottom transition), so
// releasing on them would strand the view unfollowed while visually pinned.
const USER_SCROLL_UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

// How long after a programmatic scroll the sentinel may leave view without
// releasing the follow. Cleared earlier by scrollend where supported; the
// timeout is the Safari fallback.
const AUTO_SCROLL_SETTLE_MS = 200;

// Sub-pixel scrollTop rounding differs across engines; a small IntersectionObserver
// rootMargin keeps edge detection from flickering right at the top/bottom boundary.
const EDGE_TOLERANCE = "8px 0px";

const useThreadScroll = (
  rootRef: RefObject<HTMLDivElement | null>,
  mode: ThreadAutoScrollMode,
  preserveScrollOnPrepend: boolean,
): ThreadContextValue => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  // Edge state = each sentinel is in view. IntersectionObserver computes it off
  // the main thread (no scrollTop/scrollHeight reads); the bottom edge drives
  // the scroll button and re-arms the follow, the top edge drives load-older.
  const atTopStore = useRefWithInit(createEdgeStore).current;
  const atBottomStore = useRefWithInit(createEdgeStore).current;

  // Follow intent: true while the view should track streaming growth.
  const followingRef = useRef(true);

  // Read by the landing observer without re-running it (a re-run re-lands).
  const preserveOnPrependRef = useAsRef(preserveScrollOnPrepend);

  // True while a scroll we started may still be in flight.
  const autoScrollingRef = useRef(false);
  const autoScrollingTimeoutRef = useRef<number | null>(null);

  const markAutoScrolling = useCallback(() => {
    autoScrollingRef.current = true;
    if (autoScrollingTimeoutRef.current !== null) {
      window.clearTimeout(autoScrollingTimeoutRef.current);
    }
    autoScrollingTimeoutRef.current = window.setTimeout(() => {
      autoScrollingTimeoutRef.current = null;
      autoScrollingRef.current = false;
    }, AUTO_SCROLL_SETTLE_MS);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    const rootElement = rootRef.current;
    const topSentinel = topSentinelRef.current;
    const bottomSentinel = bottomSentinelRef.current;
    if (!scroller || !topSentinel || !bottomSentinel) return;

    // One observer for both edge sentinels; its `root` is the scroll container.
    // Edge state is mirrored to data-at-top / data-at-bottom on the thread root
    // (the common ancestor of the scroller + composer) for pure-CSS affordances.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === topSentinel) {
            const atTop = entry.isIntersecting;
            atTopStore.setSnapshot(atTop);
            rootElement?.toggleAttribute("data-at-top", atTop);
            continue;
          }
          const atBottom = entry.isIntersecting;
          if (atBottom) {
            atBottomStore.setSnapshot(true);
            followingRef.current = true;
            rootElement?.toggleAttribute("data-at-bottom", true);
          } else if (!autoScrollingRef.current) {
            // The sentinel left view and we didn't cause it: a scrollbar drag,
            // a momentum scroll away, or content growing past the live edge in a
            // non-following mode. A scroll *we* started (send landing / followed
            // stream) keeps autoScrollingRef set, so its transient off-screen
            // frame is ignored — that's what stops the button flashing on send.
            atBottomStore.setSnapshot(false);
            followingRef.current = false;
            rootElement?.toggleAttribute("data-at-bottom", false);
          }
        }
      },
      { root: scroller, rootMargin: EDGE_TOLERANCE },
    );
    io.observe(topSentinel);
    io.observe(bottomSentinel);

    // A finished scroll means nothing of ours is in flight anymore; clear
    // early instead of waiting out the timeout fallback.
    const settle = () => {
      autoScrollingRef.current = false;
      if (autoScrollingTimeoutRef.current !== null) {
        window.clearTimeout(autoScrollingTimeoutRef.current);
        autoScrollingTimeoutRef.current = null;
      }
    };
    scroller.addEventListener("scrollend", settle);

    return () => {
      io.disconnect();
      scroller.removeEventListener("scrollend", settle);
      if (autoScrollingTimeoutRef.current !== null) {
        window.clearTimeout(autoScrollingTimeoutRef.current);
        autoScrollingTimeoutRef.current = null;
      }
    };
  }, [atTopStore, atBottomStore, rootRef]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) return;
      markAutoScrolling();
      scrollContainerTo(el, el.scrollHeight, behavior);
    },
    [markAutoScrolling],
  );

  // Scrolling to the top is a deliberate move away from the live end, so it
  // releases the follow; reaching the bottom again re-arms it.
  const scrollToTop = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) return;
      followingRef.current = false;
      markAutoScrolling();
      scrollContainerTo(el, 0, behavior);
    },
    [markAutoScrolling],
  );

  // Resolve a row by its consumer-provided data-message-id and jump to it.
  // Resolved lazily at call time — no per-row registration, nothing on the hot
  // path. scrollIntoView handles the alignment math and honors any
  // scroll-margin the styled layer sets on rows.
  const resolveMessageJump = useCallback(
    (messageId: string, options: ThreadScrollToMessageOptions = {}) => {
      const row = contentRef.current?.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      );
      if (!row) return false;
      followingRef.current = false;
      markAutoScrolling();
      row.scrollIntoView({
        block: options.align ?? "start",
        inline: "nearest",
        behavior: resolveScrollBehavior(options.behavior ?? "smooth"),
      });
      return true;
    },
    [markAutoScrolling],
  );

  // Pending jump — a scrollToMessage that arrived before the transcript did
  // (a deep link while messages load asynchronously). Held until the first
  // rows mount, then flushed; the watching observer exists only while a jump
  // is queued, so the queue costs nothing when unused.
  const pendingJumpRef = useRef<{
    messageId: string;
    options?: ThreadScrollToMessageOptions;
  } | null>(null);
  const pendingJumpObserverRef = useRef<MutationObserver | null>(null);

  const clearPendingJump = useCallback(() => {
    pendingJumpRef.current = null;
    pendingJumpObserverRef.current?.disconnect();
    pendingJumpObserverRef.current = null;
  }, []);

  // Settle the queued jump once rows exist: jump if the id mounted, or drop
  // the request if the transcript loaded without it — a stale or foreign id
  // must not hijack a later chat. Keeps waiting while no rows are mounted.
  const flushPendingJump = useCallback(() => {
    const pending = pendingJumpRef.current;
    const content = contentRef.current;
    if (!pending || !content) return false;
    if (!content.querySelector("[data-message-id]")) return false;
    const jumped = resolveMessageJump(pending.messageId, pending.options);
    clearPendingJump();
    return jumped;
  }, [resolveMessageJump, clearPendingJump]);

  useEffect(() => clearPendingJump, [clearPendingJump]);

  // Returns true when the jump ran or was queued; false only when the id is
  // absent from an already-loaded transcript.
  const scrollToMessage = useCallback(
    (messageId: string, options: ThreadScrollToMessageOptions = {}) => {
      if (resolveMessageJump(messageId, options)) {
        clearPendingJump();
        return true;
      }
      const content = contentRef.current;
      // Queue only while the transcript has produced no rows yet (an async
      // load in flight). An id missing from a loaded transcript is just absent.
      if (!content || content.querySelector("[data-message-id]")) return false;
      pendingJumpRef.current = { messageId, options };
      if (!pendingJumpObserverRef.current) {
        const observer = new MutationObserver(() => {
          flushPendingJump();
        });
        // subtree: rows usually mount inside turn wrappers, not as direct
        // children of the content column.
        observer.observe(content, { childList: true, subtree: true });
        pendingJumpObserverRef.current = observer;
      }
      return true;
    },
    [resolveMessageJump, clearPendingJump, flushPendingJump],
  );

  const releaseFollow = useCallback(() => {
    followingRef.current = false;
  }, []);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || mode === "off") return;

    const landsAtTop = mode !== "bottom";
    const followsStream = mode !== "jump";

    // Reserve a viewport on the last turn so the newest lands at the top.
    const reserve = landsAtTop ? createLastChildReserve(content) : null;
    if (landsAtTop) {
      content.style.setProperty("--thread-turn-min-height", "var(--thread-turn-area)");
    }

    // First land (and chat switches) jump instantly; later turns animate. A
    // land is a deliberate move to the live end, so it re-arms the follow.
    // Prepends are not new turns: when preservation is on, skip the land and
    // let the preserve effect hold the reading position instead.
    let landed = false;
    let skipNextResize = true;
    let hadContent = false;
    let firstTurn: Element | null = null;
    const land = (mutations: MutationRecord[] = []) => {
      reserve?.sync();
      const previousFirst = firstTurn;
      firstTurn = content.firstElementChild;
      // A switch whose history loads async goes A → [] → B across separate
      // commits, so the add-only commit isn't flagged `replaced`. Treat "was
      // empty, now populated" as a fresh land (instant), not an incremental
      // turn — shadcn's `previousItemCount === 0` rule, read off the DOM since
      // the headless thread owns no item count. Tracked before the early
      // returns so the prepend / deep-link-jump paths keep it accurate.
      const hasContent = content.children.length > 0;
      const repopulated = hasContent && !hadContent;
      hadContent = hasContent;
      if (preserveOnPrependRef.current && wasPrepended(mutations, previousFirst, content)) {
        return;
      }
      // A queued deep-link jump owns the landing: landing at the bottom would
      // race the jump the consumer asked for. Hold while the transcript is
      // still empty; once rows exist the flush either jumps (skip the land) or
      // drops a stale id (fall through and land normally).
      if (pendingJumpRef.current) {
        if (flushPendingJump()) {
          landed = true;
          return;
        }
        if (pendingJumpRef.current) return;
      }
      const replaced = mutations.some((m) => m.removedNodes.length > 0);
      skipNextResize = true;
      followingRef.current = true;
      scrollToBottom(landed && !replaced && !repopulated ? "smooth" : "instant");
      landed = true;
    };

    // Follow streaming growth, but skip the resize our own land just caused
    // and yield once the follow is released. Gate on the intent ref ONLY —
    // never on the at-bottom snapshot: IntersectionObserver reports a frame
    // late, so a position check here would scroll on stale "at bottom" the
    // instant after the user wheels up, hijacking their scroll and re-arming
    // the follow in a loop they can't escape.
    //
    // A resize alone can't say whether content grew or the viewport did: the
    // reserve tracks --thread-turn-area, so a container animating open resizes
    // `content` every frame. Only a viewport change moves the scroller's own
    // box — re-pin those instantly instead of smooth-scrolling a moving target.
    //
    // The whole frame of a viewport change counts as resized: the reserve
    // follows the box, so `content` resizes a pass later in the same frame,
    // when the box already reads as unchanged. The document timeline's time is
    // fixed for a frame, observer passes included, so it names the frame.
    let viewport = readViewportBox(scrollRef.current);
    let resizedFrame: CSSNumberish | null = null;
    const follow = () => {
      const frame = document.timeline.currentTime;
      const previous = viewport;
      viewport = readViewportBox(scrollRef.current);
      if (!sameViewportBox(previous, viewport)) resizedFrame = frame;

      if (skipNextResize) {
        skipNextResize = false;
        return;
      }
      if (!followingRef.current) return;

      const isResizing = resizedFrame === frame;
      scrollToBottom(isResizing ? "instant" : "smooth");
    };

    land();
    const turns = new MutationObserver(land);
    turns.observe(content, { childList: true });

    const growth = followsStream ? new ResizeObserver(follow) : null;
    growth?.observe(content);
    // The scroller too: a drag or window resize moves the bottom even when
    // the content keeps its size (a last turn taller than its reserve).
    if (scrollRef.current) growth?.observe(scrollRef.current);

    return () => {
      turns.disconnect();
      growth?.disconnect();
      reserve?.clear();
      if (landsAtTop) content.style.removeProperty("--thread-turn-min-height");
    };
  }, [mode, scrollToBottom, flushPendingJump]);

  // Prepend preservation — hold the reading position while older history loads
  // in above. Native scroll anchoring (Chrome/Firefox) already keeps the
  // viewport-relative position; comparing against the captured anchor makes the
  // restore a no-op there and corrects the engines that don't (Safari). Opt-in:
  // the passive scroll listener (a binary search over row rects, O(log n) reads
  // against already-computed layout) only exists while the prop is set.
  useLayoutEffect(() => {
    if (!preserveScrollOnPrepend) return;
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    // Rows are vertically ordered, so the first row crossing the viewport top
    // is found by binary search — no full scan.
    const findFirstVisibleRow = (): Element | null => {
      const rows = content.children;
      const viewportTop = scroller.getBoundingClientRect().top;
      let low = 0;
      let high = rows.length - 1;
      let found: Element | null = null;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const row = rows[mid] as Element;
        if (row.getBoundingClientRect().bottom > viewportTop) {
          found = row;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
      return found;
    };

    let anchor: { element: Element; viewportTop: number } | null = null;

    const capture = () => {
      const element = findFirstVisibleRow();
      anchor = element
        ? {
            element,
            viewportTop: element.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
          }
        : null;
    };

    const restore = () => {
      if (!anchor || !anchor.element.isConnected) return;
      const delta =
        anchor.element.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        anchor.viewportTop;
      if (Math.abs(delta) > 0.5) scroller.scrollTop += delta;
    };

    let firstTurn: Element | null = content.firstElementChild;
    const observer = new MutationObserver((mutations) => {
      const previousFirst = firstTurn;
      firstTurn = content.firstElementChild;
      if (wasPrepended(mutations, previousFirst, content)) restore();
      capture();
    });
    observer.observe(content, { childList: true });

    capture();
    scroller.addEventListener("scroll", capture, { passive: true });

    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", capture);
    };
  }, [preserveScrollOnPrepend]);

  // Visibility tracking — created lazily by the first useThreadVisibility
  // subscriber, torn down with the last. An IntersectionObserver maintains the
  // set of intersecting rows; snapshots are rebuilt on a coalesced frame by
  // filtering rows in document order (a DOM query, no layout reads).
  const visibilityStore = useRefWithInit(createVisibilityStore).current;
  const visibleIdsRef = useRef(new Set<string>());
  const visibilityObserverRef = useRef<IntersectionObserver | null>(null);
  const visibilityRowsObserverRef = useRef<MutationObserver | null>(null);
  const visibilityFrameRef = useRef<number | null>(null);

  const syncVisibility = useCallback(() => {
    if (visibilityFrameRef.current !== null) return;
    visibilityFrameRef.current = requestAnimationFrame(() => {
      visibilityFrameRef.current = null;
      // A frame can outlive the last unsubscribe; recomputing would overwrite
      // the empty snapshot teardown just wrote.
      if (!visibilityStore.hasListeners()) return;
      const content = contentRef.current;
      if (!content) return;
      const visible: string[] = [];
      for (const row of content.querySelectorAll<HTMLElement>("[data-message-id]")) {
        const id = row.dataset.messageId;
        if (id && visibleIdsRef.current.has(id)) visible.push(id);
      }
      visibilityStore.setSnapshot({
        visibleMessageIds: visible,
        currentMessageId: visible[0] ?? null,
      });
    });
  }, [visibilityStore]);

  const observeVisibility = useCallback(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    visibilityObserverRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.messageId;
          if (!id) continue;
          if (entry.isIntersecting) visibleIdsRef.current.add(id);
          else visibleIdsRef.current.delete(id);
        }
        syncVisibility();
      },
      { root: scroller },
    );

    // Rows mount and unmount as the transcript changes; re-observe only when
    // the row list itself changed — streaming inside a row is ignored.
    let observedRows: Element[] = [];
    const reconcileRows = () => {
      const rows = Array.from(content.querySelectorAll("[data-message-id]"));
      if (
        rows.length === observedRows.length &&
        rows.every((row, index) => row === observedRows[index])
      ) {
        return;
      }
      observedRows = rows;
      const mountedIds = new Set(rows.map((row) => (row as HTMLElement).dataset.messageId ?? ""));
      for (const id of visibleIdsRef.current) {
        if (!mountedIds.has(id)) visibleIdsRef.current.delete(id);
      }
      const io = visibilityObserverRef.current;
      io?.disconnect();
      for (const row of rows) io?.observe(row);
      syncVisibility();
    };

    visibilityRowsObserverRef.current = new MutationObserver(reconcileRows);
    visibilityRowsObserverRef.current.observe(content, { childList: true, subtree: true });
    reconcileRows();
  }, [syncVisibility]);

  const unobserveVisibility = useCallback(() => {
    if (visibilityFrameRef.current !== null) {
      cancelAnimationFrame(visibilityFrameRef.current);
      visibilityFrameRef.current = null;
    }
    visibilityObserverRef.current?.disconnect();
    visibilityObserverRef.current = null;
    visibilityRowsObserverRef.current?.disconnect();
    visibilityRowsObserverRef.current = null;
    visibleIdsRef.current.clear();
    visibilityStore.setSnapshot(EMPTY_VISIBILITY);
  }, [visibilityStore]);

  // Safety net: subscribers normally tear tracking down on their own unmount,
  // but the thread itself can unmount first.
  useEffect(() => unobserveVisibility, [unobserveVisibility]);

  return useMemo(
    () => ({
      atTopStore,
      atBottomStore,
      visibilityStore,
      observeVisibility,
      unobserveVisibility,
      scrollToBottom,
      scrollToTop,
      scrollToMessage,
      releaseFollow,
      scrollRef,
      contentRef,
      topSentinelRef,
      bottomSentinelRef,
    }),
    [
      atTopStore,
      atBottomStore,
      visibilityStore,
      observeVisibility,
      unobserveVisibility,
      scrollToBottom,
      scrollToTop,
      scrollToMessage,
      releaseFollow,
    ],
  );
};

// ---------------------------------------------------------------------------
// Insets
// ---------------------------------------------------------------------------

/**
 * Writes the measured insets to CSS vars on the root via a ResizeObserver — no
 * React state, so composer growth never re-renders the thread:
 *   --thread-dock-inset is the space the dock takes from the root's bottom edge
 *   (plus a gap): pad the content by it;
 *   --thread-dock-height / --thread-dock-width are the dock's own box;
 *   --thread-turn-area is the visible thread area (root − top − bottom). When an
 *   auto-scroll mode is active, useThreadScroll maps the last turn's reserve
 *   (--thread-turn-min-height) to it; otherwise the reserve falls back to 0.
 * Recomputes only on root (window) / composer-dock resize — never per token.
 */
const useThreadInsets = (rootRef: RefObject<HTMLDivElement | null>) => {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Read every measurement before writing any property: a write followed by a forced
    // layout read dips scrollHeight for a frame, and that scrollTop clamp is final.
    const apply = () => {
      const bottomInset = measureDockInset(root);
      const dockSize = measureDockSize(root);
      const topInset = measureTopInset(root);
      const area = Math.max(
        0,
        Math.round(root.clientHeight - topInset - (bottomInset ?? DEFAULT_BOTTOM_OFFSET)),
      );
      if (bottomInset !== null) {
        root.style.setProperty("--thread-dock-inset", `${bottomInset}px`);
      }
      if (dockSize) {
        root.style.setProperty("--thread-dock-height", `${dockSize.height}px`);
        root.style.setProperty("--thread-dock-width", `${dockSize.width}px`);
      }
      root.style.setProperty("--thread-turn-area", `${area}px`);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(root);
    const dock = queryDock(root);
    if (dock) observer.observe(dock);
    return () => observer.disconnect();
  }, [rootRef]);
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export type ThreadRootProps = PrimitiveProps<"div"> & {
  children?: ReactNode;
  autoScroll?: ThreadAutoScrollMode;
  /**
   * Hold the reading position when rows are prepended (history pagination).
   * Opt-in: enabling it attaches a passive scroll listener to keep the anchor
   * current, so leave it off unless older content actually loads in above.
   */
  preserveScrollOnPrepend?: boolean;
};

export const ThreadRoot = ({
  autoScroll = "follow",
  preserveScrollOnPrepend = false,
  className,
  render,
  style,
  ...elementProps
}: ThreadRootProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  useThreadInsets(rootRef);
  const scroll = useThreadScroll(rootRef, autoScroll, preserveScrollOnPrepend);

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      ref: rootRef,
      props: [
        {
          "data-thread-root": "",
          // Anchors the composer and bounds the inset measurement.
          style: { position: "relative", overflow: "hidden" },
        },
        elementProps,
      ],
    },
  );

  return <ThreadContext value={scroll}>{element}</ThreadContext>;
};

// ---------------------------------------------------------------------------
// Viewport — the scroll container. A focusable region so keyboard users can
// scroll the transcript. Only *upward* gestures release the follow — a wheel
// with negative deltaY, a downward finger drag, an up-scroll key — because an
// upward gesture always moves the sentinel out of view, and scrolling back to
// the bottom is what re-arms. Downward gestures never release (see
// USER_SCROLL_UP_KEYS).
// ---------------------------------------------------------------------------

export type ThreadViewportProps = PrimitiveProps<"div">;

export const ThreadViewport = ({
  className,
  render,
  style,
  ...elementProps
}: ThreadViewportProps) => {
  const { scrollRef, releaseFollow } = useThreadContext();
  const lastTouchYRef = useRef(0);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY < 0) releaseFollow();
    },
    [releaseFollow],
  );

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    lastTouchYRef.current = event.touches[0]?.clientY ?? 0;
  }, []);

  // A finger moving down drags the content down — an upward scroll.
  const handleTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const y = event.touches[0]?.clientY ?? 0;
      if (y > lastTouchYRef.current) releaseFollow();
      lastTouchYRef.current = y;
    },
    [releaseFollow],
  );

  // Keys scroll the viewport only while it is the focused element; bubbled
  // keydowns from interactive children never move it, so they must not release.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      const scrollsUp = USER_SCROLL_UP_KEYS.has(event.key) || (event.key === " " && event.shiftKey);
      if (scrollsUp) releaseFollow();
    },
    [releaseFollow],
  );

  return useRenderElement(
    "div",
    { className, render, style },
    {
      ref: scrollRef,
      props: [
        {
          "data-thread-scroller": "",
          role: "region",
          "aria-label": "Messages",
          tabIndex: 0,
          style: { overflowY: "auto", overflowX: "hidden" },
          onWheel: handleWheel,
          onTouchStart: handleTouchStart,
          onTouchMove: handleTouchMove,
          onKeyDown: handleKeyDown,
        },
        elementProps,
      ],
    },
  );
};

// ---------------------------------------------------------------------------
// Content — the measured content column bracketed by 1px edge sentinels (top +
// bottom) rendered as siblings, outside the last-child reserve. The observer in
// useThreadScroll watches both to drive isAtTop/isAtBottom + data-at-*.
// ---------------------------------------------------------------------------

export type ThreadContentProps = PrimitiveProps<"div">;

/**
 * The column inside the viewport that holds the turns. While a top-landing mode
 * is active it sets `min-height: var(--thread-turn-min-height, 0px)` on its last
 * child.
 */
export const ThreadContent = ({
  className,
  render,
  style,
  ...elementProps
}: ThreadContentProps) => {
  const { contentRef, topSentinelRef, bottomSentinelRef } = useThreadContext();

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      ref: contentRef,
      props: [
        {
          "data-thread-content": "",
          // The transcript is the live log; new turns are what screen readers
          // should announce.
          role: "log",
          "aria-relevant": "additions" as const,
        },
        elementProps,
      ],
    },
  );

  return (
    <>
      <div
        ref={topSentinelRef}
        data-thread-top=""
        aria-hidden
        style={{ height: 1, width: "100%", flexShrink: 0 }}
      />
      {element}
      <div
        ref={bottomSentinelRef}
        data-thread-bottom=""
        aria-hidden
        style={{ height: 1, width: "100%", flexShrink: 0 }}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Composer slot + Placeholder — structural markers. The composer docks itself
// along the root's bottom edge; the inline position yields to a consumer style.
// ---------------------------------------------------------------------------

export type ThreadComposerProps = PrimitiveProps<"div">;

/**
 * Bottom-docked slot for the composer. Positions itself along the root's bottom
 * edge (a `style` prop overrides), and its box is measured into
 * `--thread-dock-inset`, `--thread-dock-height` and `--thread-dock-width` on the root.
 */
export const ThreadComposer = ({
  className,
  render,
  style,
  ...elementProps
}: ThreadComposerProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    {
      props: [
        {
          "data-thread-composer": "",
          style: { position: "absolute", insetInline: 0, bottom: 0 },
        },
        elementProps,
      ],
    },
  );

export type ThreadPlaceholderProps = PrimitiveProps<"div">;

export const ThreadPlaceholder = ({
  className,
  render,
  style,
  ...elementProps
}: ThreadPlaceholderProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-thread-placeholder": "" }, elementProps] },
  );
