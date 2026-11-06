"use client";

// Headless thread: the scroll subsystem (at-bottom detection, auto-scroll
// landing/follow, composer-inset measurement) plus unstyled structural parts.
// The only styles emitted are behavior-critical (positioning/overflow/sentinel
// size, the published variables), applied inline; everything visual — the
// composer's position, the padding, the last turn's min-height — is the
// consumer's, built from the variables the thread publishes.

import {
  type CSSProperties,
  createContext,
  type KeyboardEvent,
  type PointerEvent,
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
import { alignedScrollTop } from "../internal/scroll-into-view-within";
import {
  measureComposer,
  prefersReducedMotion,
  readViewportBox,
  resolveScrollBehavior,
  sameViewportBox,
  scrollContainerTo,
  wasPrepended,
} from "./geometry";
import {
  animateScroll,
  readScrollTiming,
  resolveDuration,
  type ThreadScrollKind,
} from "./scroll-animation";
import {
  createEdgeStore,
  createVisibilityStore,
  type EdgeStore,
  EMPTY_VISIBILITY,
  type ThreadVisibilityState,
  type VisibilityStore,
} from "./stores";

export type { ThreadScrollKind } from "./scroll-animation";
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
  interruptScroll: () => void;
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
// flash); Thread.Composer's layout effect runs first (children before parents),
// so --thread-inset-bottom is set before the first land.
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
//
// Smooth scrolls are native unless the styled layer sets a timing through the
// --thread-scroll* variables; then they run as a scripted animation, stamped
// as data-scrolling on the root, that any user scroll gesture interrupts.
// ---------------------------------------------------------------------------

export type ThreadAutoScrollMode = "off" | "bottom" | "jump" | "follow";

// Keys that scroll the viewport *upward* and therefore count as deliberate
// reading intent, releasing the follow. Downward keys never release: at the
// bottom they cause no scroll (and so no re-arming at-bottom transition), so
// releasing on them would strand the view unfollowed while visually pinned.
const USER_SCROLL_UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

// Every key that scrolls the focused viewport. Any of them interrupts a
// scripted scroll animation, whichever way it goes.
const USER_SCROLL_KEYS = new Set([...USER_SCROLL_UP_KEYS, "ArrowDown", "PageDown", "End", " "]);

// The scroll kinds whose destination is the live end (see scrollWith).
const SCROLLS_TOWARD_END = new Set<ThreadScrollKind>(["land", "follow", "bottom"]);

// Where a scroll goes. tracksEnd re-reads getTop every animation frame;
// otherwise the destination is fixed when the scroll starts.
type ScrollTarget = { getTop: () => number; tracksEnd: boolean };

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

  const clearAutoScrollingTimeout = useCallback(() => {
    if (autoScrollingTimeoutRef.current === null) return;
    window.clearTimeout(autoScrollingTimeoutRef.current);
    autoScrollingTimeoutRef.current = null;
  }, []);

  const markAutoScrolling = useCallback(() => {
    autoScrollingRef.current = true;
    clearAutoScrollingTimeout();
    autoScrollingTimeoutRef.current = window.setTimeout(() => {
      autoScrollingTimeoutRef.current = null;
      autoScrollingRef.current = false;
    }, AUTO_SCROLL_SETTLE_MS);
  }, [clearAutoScrollingTimeout]);

  // The scripted animation in flight, if any. tracksEnd marks one whose
  // destination is the live end, re-read every frame: streaming growth is
  // absorbed by it instead of restarting it.
  const animationRef = useRef<{ cancel: () => void; tracksEnd: boolean } | null>(null);

  const stopAnimation = useCallback(() => {
    const animation = animationRef.current;
    if (!animation) return;
    animationRef.current = null;
    animation.cancel();
    rootRef.current?.removeAttribute("data-scrolling");
  }, [rootRef]);

  // Whether the bottom sentinel is in view, as the observer last reported it —
  // kept even while the guard holds off acting on it.
  const bottomInViewRef = useRef(true);

  // The bottom edge left view: the scroll button shows and the follow lets go.
  const leaveBottom = useCallback(() => {
    atBottomStore.setSnapshot(false);
    followingRef.current = false;
    rootRef.current?.toggleAttribute("data-at-bottom", false);
  }, [atBottomStore, rootRef]);

  // A user gesture took the scroll over mid-animation. End our guard rather
  // than re-arming it, and act on the edge it held off: the sentinel usually
  // left view while the guard was up (a land moves it out at once), and the
  // observer reports a crossing only once. A drag away from the bottom then
  // releases the follow exactly as it would with no animation running.
  const interruptScroll = useCallback(() => {
    if (!animationRef.current) return;
    stopAnimation();
    autoScrollingRef.current = false;
    clearAutoScrollingTimeout();
    if (!bottomInViewRef.current) leaveBottom();
  }, [stopAnimation, clearAutoScrollingTimeout, leaveBottom]);

  // Every scroll the thread starts goes through here. "smooth" uses the timing
  // the styled layer configured (see scroll-animation.ts) and falls back to
  // the native smooth scroll when there is none; anything else — or reduced
  // motion — jumps. data-scrolling is stamped before the timing is read, so
  // per-kind selectors resolve, and stays only while a scripted animation runs.
  // The destination is computed only once a timing is known: the native path
  // finds its own.
  const scrollWith = useCallback(
    (
      kind: ThreadScrollKind,
      behavior: ScrollBehavior,
      target: ScrollTarget,
      native: (behavior: ScrollBehavior) => void,
    ) => {
      const scroller = scrollRef.current;
      const root = rootRef.current;
      const towardEnd = SCROLLS_TOWARD_END.has(kind);
      stopAnimation();
      // Only a scroll toward the end is guarded. One away from it has released
      // the follow already, and the sentinel must report the edge leaving: the
      // observer reports a crossing once, so one swallowed by the guard would
      // leave isAtBottom stale until the user returned to the bottom.
      if (towardEnd) markAutoScrolling();
      if (!scroller || !root || behavior !== "smooth" || prefersReducedMotion()) {
        native(resolveScrollBehavior(behavior));
        return;
      }

      root.setAttribute("data-scrolling", kind);
      const timing = readScrollTiming(getComputedStyle(root));
      const from = scroller.scrollTop;
      const top = timing ? target.getTop() : from;
      const duration = timing ? resolveDuration(timing, top - from) : 0;
      if (!timing || duration === 0) {
        root.removeAttribute("data-scrolling");
        native(timing ? "instant" : "smooth");
        return;
      }

      // A scroll toward the end holds the guard for its whole length, however
      // long the consumer made it: the settle timeout would otherwise expire
      // mid-flight and let the sentinel release the follow.
      if (towardEnd) {
        autoScrollingRef.current = true;
        clearAutoScrollingTimeout();
      }
      const animation = {
        tracksEnd: target.tracksEnd,
        cancel: animateScroll(scroller, {
          duration,
          easing: timing.easing,
          getTarget: target.tracksEnd ? target.getTop : () => top,
          onFinish: () => {
            if (animationRef.current !== animation) return;
            animationRef.current = null;
            root.removeAttribute("data-scrolling");
            if (towardEnd) markAutoScrolling();
          },
        }),
      };
      animationRef.current = animation;
    },
    [rootRef, stopAnimation, markAutoScrolling, clearAutoScrollingTimeout],
  );

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
          bottomInViewRef.current = atBottom;
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
            leaveBottom();
          }
        }
      },
      { root: scroller, rootMargin: EDGE_TOLERANCE },
    );
    io.observe(topSentinel);
    io.observe(bottomSentinel);

    // A finished scroll means nothing of ours is in flight anymore; clear
    // early instead of waiting out the timeout fallback.
    // A scripted animation lands one instant scroll per frame, and each can
    // fire its own scrollend; the animation clears the flag when it ends.
    const settle = () => {
      if (animationRef.current) return;
      autoScrollingRef.current = false;
      clearAutoScrollingTimeout();
    };
    scroller.addEventListener("scrollend", settle);

    return () => {
      io.disconnect();
      scroller.removeEventListener("scrollend", settle);
      animationRef.current?.cancel();
      animationRef.current = null;
      clearAutoScrollingTimeout();
    };
  }, [atTopStore, atBottomStore, rootRef, clearAutoScrollingTimeout, leaveBottom]);

  // The live end. Tracked by default — re-read per frame, so streaming growth
  // moves the destination along with it.
  const scrollToEnd = useCallback(
    (kind: ThreadScrollKind, behavior: ScrollBehavior, { tracksEnd = true } = {}) => {
      const el = scrollRef.current;
      if (!el) return;
      scrollWith(
        kind,
        behavior,
        { getTop: () => Math.max(0, el.scrollHeight - el.clientHeight), tracksEnd },
        (resolved) => scrollContainerTo(el, el.scrollHeight, resolved),
      );
    },
    [scrollWith],
  );

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => scrollToEnd("bottom", behavior),
    [scrollToEnd],
  );

  // Scrolling to the top is a deliberate move away from the live end, so it
  // releases the follow; reaching the bottom again re-arms it.
  const scrollToTop = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) return;
      followingRef.current = false;
      scrollWith("top", behavior, { getTop: () => 0, tracksEnd: false }, (resolved) =>
        scrollContainerTo(el, 0, resolved),
      );
    },
    [scrollWith],
  );

  // Resolve a row by its consumer-provided data-message-id and jump to it.
  // Resolved lazily at call time — no per-row registration, nothing on the hot
  // path. The destination is computed by hand (alignedScrollTop: scrollIntoView's
  // block semantics, the row's scroll-margin included) and only the thread's
  // own viewport scrolls, on every path. Never scrollIntoView: it scrolls every
  // scrollable ancestor, so a thread embedded in a page would move the page too.
  const resolveMessageJump = useCallback(
    (messageId: string, options: ThreadScrollToMessageOptions = {}) => {
      const row = contentRef.current?.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      );
      const scroller = scrollRef.current;
      if (!row || !scroller) return false;
      followingRef.current = false;
      const align = options.align ?? "start";
      scrollWith(
        "message",
        options.behavior ?? "smooth",
        { getTop: () => alignedScrollTop(scroller, row, align), tracksEnd: false },
        (resolved) => scrollContainerTo(scroller, alignedScrollTop(scroller, row, align), resolved),
      );
      return true;
    },
    [scrollWith],
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

    const followsStream = mode !== "jump";

    // First land (and chat switches) jump instantly; later turns animate. A
    // land is a deliberate move to the live end, so it re-arms the follow.
    // Prepends are not new turns: when preservation is on, skip the land and
    // let the preserve effect hold the reading position instead.
    let landed = false;
    let skipNextResize = true;
    let hadContent = false;
    let firstTurn: Element | null = null;
    const land = (mutations: MutationRecord[] = []) => {
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
      // An animated land in "jump" freezes its destination: a reply outgrowing
      // the reserve mid-flight must not turn the land into a follow.
      scrollToEnd("land", landed && !replaced && !repopulated ? "smooth" : "instant", {
        tracksEnd: followsStream,
      });
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
    // reserve tracks the viewport's height, so a container animating open resizes
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
      // An animation already headed for the live end re-reads it every frame,
      // so growth (or a resize) mid-flight is absorbed rather than restarting
      // it — a long land keeps its own timing while the reply starts streaming.
      if (animationRef.current?.tracksEnd) return;

      const isResizing = resizedFrame === frame;
      scrollToEnd("follow", isResizing ? "instant" : "smooth");
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
    };
  }, [mode, scrollToEnd, flushPendingJump]);

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
      interruptScroll,
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
      interruptScroll,
    ],
  );
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

// The edge sentinels around Thread.Content. The bottom one sits below the last
// turn, so the published min-height leaves room for it.
const SENTINEL_HEIGHT = 1;

// What the last turn needs to land at the top: the viewport (a size container,
// so 100cqh) minus the top inset above and the bottom inset below. The modes
// that don't land at the top publish 0px, so the consumer's rule can stay put.
const TURN_MIN_HEIGHT = `calc(100cqh - var(--thread-inset-top, 0px) - var(--thread-inset-bottom, 0px) - ${SENTINEL_HEIGHT}px)`;

const rootStyleFor = (mode: ThreadAutoScrollMode) =>
  ({
    position: "relative",
    overflow: "hidden",
    "--thread-turn-min-height": mode === "follow" || mode === "jump" ? TURN_MIN_HEIGHT : "0px",
  }) as CSSProperties;

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
  const scroll = useThreadScroll(rootRef, autoScroll, preserveScrollOnPrepend);

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      ref: rootRef,
      props: [
        {
          "data-thread-root": "",
          // Anchors the composer and bounds its measurement.
          style: rootStyleFor(autoScroll),
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
  const { scrollRef, releaseFollow, interruptScroll } = useThreadContext();
  const lastTouchYRef = useRef(0);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      interruptScroll();
      if (event.deltaY < 0) releaseFollow();
    },
    [releaseFollow, interruptScroll],
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      interruptScroll();
      lastTouchYRef.current = event.touches[0]?.clientY ?? 0;
    },
    [interruptScroll],
  );

  // A press on the scroller itself — not on a row — is its scrollbar (or bare
  // padding): a drag is about to move the scroll position by hand.
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) interruptScroll();
    },
    [interruptScroll],
  );

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
      if (USER_SCROLL_KEYS.has(event.key)) interruptScroll();
      const scrollsUp = USER_SCROLL_UP_KEYS.has(event.key) || (event.key === " " && event.shiftKey);
      if (scrollsUp) releaseFollow();
    },
    [releaseFollow, interruptScroll],
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
          // A size container, so the last turn's reserve can read the viewport's
          // height as 100cqh.
          style: { overflowY: "auto", overflowX: "hidden", containerType: "size" },
          onWheel: handleWheel,
          onTouchStart: handleTouchStart,
          onTouchMove: handleTouchMove,
          onPointerDown: handlePointerDown,
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
 * The column inside the viewport that holds the turns. Unstyled: pad it with
 * `--thread-inset-top` and `--thread-inset-bottom`, and give its last turn
 * `min-height: var(--thread-turn-min-height)`.
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
        style={{ height: SENTINEL_HEIGHT, width: "100%", flexShrink: 0 }}
      />
      {element}
      <div
        ref={bottomSentinelRef}
        data-thread-bottom=""
        aria-hidden
        style={{ height: SENTINEL_HEIGHT, width: "100%", flexShrink: 0 }}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Composer slot + Placeholder — structural markers.
// ---------------------------------------------------------------------------

export type ThreadComposerProps = PrimitiveProps<"div">;

const ROOT_SELECTOR = "[data-thread-root]";
const COMPOSER_VARIABLES = [
  "--thread-inset-bottom",
  "--thread-composer-height",
  "--thread-composer-width",
];

/**
 * Slot for the composer. Unpositioned: place it yourself (usually absolute along
 * the bottom edge). Publishes the room it takes on the root as
 * `--thread-inset-bottom` (plus the consumer's `--thread-composer-gap`),
 * `--thread-composer-height` and `--thread-composer-width`.
 */
export const ThreadComposer = ({
  className,
  render,
  style,
  ...elementProps
}: ThreadComposerProps) => {
  const composerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const composer = composerRef.current;
    // Found through the DOM: on the first commit this effect runs before the
    // root's own ref is attached.
    const root = composer?.closest<HTMLElement>(ROOT_SELECTOR);
    if (!composer || !root) return;

    const publish = () => {
      const { inset, height, width } = measureComposer(root, composer);
      root.style.setProperty(
        "--thread-inset-bottom",
        `calc(${inset}px + var(--thread-composer-gap, 0px))`,
      );
      root.style.setProperty("--thread-composer-height", `${height}px`);
      root.style.setProperty("--thread-composer-width", `${width}px`);
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(composer, { box: "border-box" });
    return () => {
      observer.disconnect();
      for (const name of COMPOSER_VARIABLES) root.style.removeProperty(name);
    };
  }, []);

  return useRenderElement(
    "div",
    { className, render, style },
    {
      ref: composerRef,
      props: [{ "data-thread-composer": "" }, elementProps],
    },
  );
};

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
