"use client";

// Adapted from @base-ui/react master (MIT) — the open/close transition lifecycle hooks
// (internals/useTransitionStatus, useAnimationsFinished, useOpenChangeComplete). Consolidated
// into one self-contained module and trimmed of the @base-ui/utils runtime dep (the tiny
// AnimationFrame / useStableCallback / resolveRef helpers are inlined), mirroring how this
// package already vendors useRenderElement. Behavior is preserved bar two deliberate
// departures in useAnimationsFinished: a `subtree` option (the animating element is not always
// the one unmounting), and running the callback when there is no element instead of returning
// silently, which otherwise strands whoever unmounts from it.
//
// Model: presence is the `mounted` boolean; `transitionStatus` is a CSS-animation status
// ('starting' | 'ending' | 'idle' | undefined). Pair with data-starting-style/data-ending-style
// (see state-mappings.ts) and drive unmount off `mounted`, cleared once animations finish.

import {
  type RefObject,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useRefWithInit } from "./useRefWithInit";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// ---------------------------------------------------------------------------
// Small helpers (inlined from @base-ui/utils)
// ---------------------------------------------------------------------------

// Stable callback: identity-stable trampoline over the latest callback. Must only be called
// from effects/handlers, never during render.
const useStableCallback = <Args extends unknown[], Return>(
  callback: ((...args: Args) => Return) | undefined,
): ((...args: Args) => Return | undefined) => {
  const latest = useRef(callback);
  useInsertionEffect(() => {
    latest.current = callback;
  });
  return useRefWithInit(
    () =>
      (...args: Args): Return | undefined =>
        latest.current?.(...args),
  ).current;
};

const resolveRef = (
  elementOrRef: RefObject<HTMLElement | null> | HTMLElement | null,
): HTMLElement | null =>
  elementOrRef && "current" in elementOrRef ? elementOrRef.current : elementOrRef;

// requestAnimationFrame handle with auto-cancel on unmount and single-in-flight semantics.
class AnimationFrameHandle {
  private id: number | null = null;
  request(fn: () => void) {
    this.cancel();
    this.id = requestAnimationFrame(() => {
      this.id = null;
      fn();
    });
  }
  cancel = () => {
    if (this.id !== null) {
      cancelAnimationFrame(this.id);
      this.id = null;
    }
  };
}

const useAnimationFrame = () => {
  const handle = useRefWithInit(() => new AnimationFrameHandle()).current;
  useEffect(() => handle.cancel, [handle]);
  return handle;
};

// ---------------------------------------------------------------------------
// useTransitionStatus
// ---------------------------------------------------------------------------

export type TransitionStatus = "starting" | "ending" | "idle" | undefined;

/**
 * A status string for CSS open/close animations.
 * @param open - whether the element is open.
 * @param enableIdleState - enables the `'idle'` state between `'starting'` and settled.
 * @param deferEndingState - defer the `'ending'` state by a frame (avoids a same-commit flip).
 */
export const useTransitionStatus = (
  open: boolean,
  enableIdleState = false,
  deferEndingState = false,
) => {
  const [transitionStatus, setTransitionStatus] = useState<TransitionStatus>(
    open && enableIdleState ? "idle" : undefined,
  );
  const [mounted, setMounted] = useState(open);

  if (open && !mounted) {
    setMounted(true);
    setTransitionStatus("starting");
  }

  if (!open && mounted && transitionStatus !== "ending" && !deferEndingState) {
    setTransitionStatus("ending");
  }

  if (!open && !mounted && transitionStatus === "ending") {
    setTransitionStatus(undefined);
  }

  useIsoLayoutEffect(() => {
    if (!open && mounted && transitionStatus !== "ending" && deferEndingState) {
      const frame = requestAnimationFrame(() => setTransitionStatus("ending"));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [open, mounted, transitionStatus, deferEndingState]);

  useIsoLayoutEffect(() => {
    if (!open || enableIdleState) return undefined;
    // Avoid flushSync here (Firefox). See mui/base-ui#3424.
    const frame = requestAnimationFrame(() => setTransitionStatus(undefined));
    return () => cancelAnimationFrame(frame);
  }, [enableIdleState, open]);

  useIsoLayoutEffect(() => {
    if (!open || !enableIdleState) return undefined;
    if (open && mounted && transitionStatus !== "idle") {
      setTransitionStatus("starting");
    }
    const frame = requestAnimationFrame(() => setTransitionStatus("idle"));
    return () => cancelAnimationFrame(frame);
  }, [enableIdleState, open, mounted, transitionStatus]);

  return { mounted, setMounted, transitionStatus };
};

// ---------------------------------------------------------------------------
// useAnimationsFinished
// ---------------------------------------------------------------------------

/**
 * Returns a function that runs `fn` once all animations on the element finish (or immediately
 * if none / unsupported). Flushes synchronously so the browser can't paint a settled frame
 * before the component unmounts (mui/base-ui#979).
 */
export const useAnimationsFinished = (
  elementOrRef: RefObject<HTMLElement | null> | HTMLElement | null,
  waitForStartingStyleRemoved = false,
  treatAbortedAsFinished = true,
  /**
   * Wait on descendants too — for when the element that animates is not the one being
   * unmounted, such as a collapsible whose wrapper carries the transition.
   */
  subtree = false,
) => {
  const frame = useAnimationFrame();

  return useStableCallback((fnToExecute: () => void, signal: AbortSignal | null = null) => {
    frame.cancel();

    const element = resolveRef(elementOrRef);
    // No element means there is nothing to wait for. Run the callback rather than returning,
    // or a caller that unmounts from it (setMounted(false)) is stranded and the surface stays
    // mounted for good.
    if (element == null) {
      fnToExecute();
      return;
    }
    const resolvedElement = element;

    const done = () => flushSync(fnToExecute);

    if (typeof resolvedElement.getAnimations !== "function") {
      fnToExecute();
      return;
    }

    const exec = () => {
      Promise.all(
        resolvedElement.getAnimations({ subtree }).map((animation) => animation.finished),
      )
        .then(() => {
          if (!signal?.aborted) done();
        })
        .catch(() => {
          if (treatAbortedAsFinished) {
            if (!signal?.aborted) done();
            return;
          }
          const current = resolvedElement.getAnimations({ subtree });
          if (
            !signal?.aborted &&
            current.length > 0 &&
            current.some((animation) => animation.pending || animation.playState !== "finished")
          ) {
            // A dependency changed mid-animation and aborted it; re-check for new animations.
            exec();
          }
        });
    };

    if (waitForStartingStyleRemoved) {
      const startingStyleAttribute = "data-starting-style";
      // Not present yet → wait a frame so "open" animations can register.
      if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
        frame.request(exec);
        return;
      }
      // Wait for [data-starting-style] to be removed, then check.
      const observer = new MutationObserver(() => {
        if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
          observer.disconnect();
          exec();
        }
      });
      observer.observe(resolvedElement, {
        attributes: true,
        attributeFilter: [startingStyleAttribute],
      });
      signal?.addEventListener("abort", () => observer.disconnect(), { once: true });
      return;
    }

    frame.request(exec);
  });
};

// ---------------------------------------------------------------------------
// useOpenChangeComplete
// ---------------------------------------------------------------------------

export type UseOpenChangeCompleteParameters = {
  /** Whether the hook is enabled. @default true */
  enabled?: boolean;
  /** Whether the element is open. */
  open?: boolean;
  /** Ref to the animating element. */
  ref: RefObject<HTMLElement | null>;
  /** Called once the open/close animation completes (or there is no animation). */
  onComplete: () => void;
};

/** Calls `onComplete` when the CSS open/close animation or transition completes. */
export const useOpenChangeComplete = ({
  enabled = true,
  open,
  ref,
  onComplete: onCompleteParam,
}: UseOpenChangeCompleteParameters) => {
  const onComplete = useStableCallback(onCompleteParam);
  const runOnceAnimationsFinish = useAnimationsFinished(ref, open, false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `open` isn't read in the body but re-arms the finalize when it flips — runOnceAnimationsFinish is identity-stable, so without it the effect wouldn't re-run on open/close (matches Base UI).
  useEffect(() => {
    if (!enabled) return undefined;
    const abortController = new AbortController();
    runOnceAnimationsFinish(onComplete, abortController.signal);
    return () => abortController.abort();
  }, [enabled, open, onComplete, runOnceAnimationsFinish]);
};

// ---------------------------------------------------------------------------
// useOpenTransition — the composed convenience hook the composer's Panel and
// the internal Collapsible share.
// ---------------------------------------------------------------------------

export type UseOpenTransitionOptions = {
  /** Measure the element's natural height into `height` (for a height-collapse CSS var). */
  measureHeight?: boolean;
  /** Called when the close animation completes, alongside the internal unmount. */
  onClosed?: () => void;
};

/**
 * Drives a Base UI-style open/close for an element: keeps it `mounted` through the exit,
 * reports `transitionStatus` (feed it to a stateAttributesMapping for data-open/closed/
 * starting-style/ending-style), optionally measures its natural `height`, and unmounts once
 * `element.getAnimations()` resolve. Composes useTransitionStatus + useOpenChangeComplete.
 */
// Inline alignment can distort a scroll-based measurement, so it is neutralized for the read
// and restored immediately after (Base UI does the same before measuring a collapsible).
const ALIGNMENT_PROPERTIES = ["justify-content", "align-items", "align-content", "justify-items"];

const measureNaturalHeight = (element: HTMLElement) => {
  const saved = ALIGNMENT_PROPERTIES.map(
    (property) =>
      [
        property,
        element.style.getPropertyValue(property),
        element.style.getPropertyPriority(property),
      ] as const,
  );
  for (const [property] of saved) {
    element.style.setProperty(property, "initial", "important");
  }
  const naturalHeight = element.scrollHeight;
  for (const [property, value, priority] of saved) {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  }
  return naturalHeight;
};

export const useOpenTransition = (
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  { measureHeight = false, onClosed }: UseOpenTransitionOptions = {},
) => {
  // Both flags on: `idle` is the settled-open status the height release gates on, and
  // deferring `ending` by a frame leaves one frame where a closing panel is still at its
  // open size — which is where the close has to be measured.
  const { mounted, setMounted, transitionStatus } = useTransitionStatus(open, true, true);
  const [height, setHeight] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    if (!measureHeight) return;
    const element = ref.current;
    if (!element) return;
    // Closing: measure on the deferred frame. By the `ending` frame the consumer's closed
    // styles have landed, so we would measure the clamped box instead of the natural one.
    if (!open && mounted && (transitionStatus === "idle" || transitionStatus === "starting")) {
      setHeight(measureNaturalHeight(element));
      return;
    }
    // Opening: measure on the first frame, before the transition runs.
    if (open && transitionStatus === "starting") {
      setHeight(measureNaturalHeight(element));
    }
  }, [measureHeight, open, mounted, transitionStatus, ref]);

  // Release the measurement once the open transition settles, so the panel tracks content
  // that grows while it is open. The close re-measures a pixel value first, so it still
  // animates from a number.
  useOpenChangeComplete({
    open: true,
    ref,
    enabled: measureHeight && open && mounted && transitionStatus === "idle",
    onComplete: () => setHeight(null),
  });

  useOpenChangeComplete({
    open,
    ref,
    // Gated on `ending`, not merely `!open`: with the ending state deferred by a frame, an
    // earlier check would call getAnimations() before the closed styles applied, find
    // nothing running, and cut the exit off.
    enabled: !open && mounted && transitionStatus === "ending",
    onComplete: () => {
      setMounted(false);
      onClosed?.();
    },
  });

  return { mounted, transitionStatus, height };
};
