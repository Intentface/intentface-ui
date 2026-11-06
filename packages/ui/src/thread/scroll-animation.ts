// Scripted scroll animation for the thread. The styled layer owns the timing
// through CSS variables on the thread root; the thread owns the motion. When no
// timing is configured, callers fall back to the browser's native smooth scroll.

// Why a scroll was started. Stamped on the root as data-scrolling while a timed
// scroll runs. Never "follow" there: a timed thread pins the follow.
export type ThreadScrollKind = "land" | "follow" | "bottom" | "top" | "message";

// What the CSS variables configure. The duration itself is resolved per
// scroll, since a speed makes it depend on the distance.
export type ScrollTiming = {
  /** The fixed duration (ms); the cap when a speed is set. */
  duration: number | null;
  /** Pixels per second; null when the duration is fixed. */
  speed: number | null;
  easing: string;
};

const DEFAULT_EASING = "ease";

// A CSS <time>: "450ms" or "0.45s". Anything else (including unset) is null.
export const parseTime = (value: string): number | null => {
  const match = /^(-?\d*\.?\d+)(ms|s)$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2]?.toLowerCase() === "s" ? amount * 1000 : amount;
};

// The shorthand reads like `transition`'s <duration> <easing>, in either
// order, so a Motion `spring()` string ("900ms linear(…)") drops straight in.
// No easing function takes a <time>, so the token that is one is the duration
// and the rest is the easing.
const parseShorthand = (value: string): { duration: number | null; easing: string } => {
  const tokens = value.trim().split(/\s+/);
  const times = tokens.map(parseTime);
  const index = times.findIndex((time) => time !== null);
  if (index === -1) return { duration: null, easing: value.trim() };
  return {
    duration: times[index] ?? null,
    easing: tokens.filter((_, other) => other !== index).join(" "),
  };
};

type TimingStyle = Pick<CSSStyleDeclaration, "getPropertyValue">;

/**
 * Reads the scroll timing from the thread's CSS variables:
 *   --thread-scroll           shorthand `<duration> <easing>`, or `none`
 *   --thread-scroll-duration  longhand, overrides the shorthand; the cap when
 *                             a speed is also set
 *   --thread-scroll-easing    longhand, overrides the shorthand
 *   --thread-scroll-speed     px per second; duration = distance / speed
 * Returns null — the caller keeps the native smooth scroll — when neither a
 * duration nor a speed is set, or when the shorthand is `none`, which wins
 * over the longhands so a whole subtree can opt back out of a default.
 */
export const readScrollTiming = (style: TimingStyle): ScrollTiming | null => {
  const raw = style.getPropertyValue("--thread-scroll").trim();
  if (raw === "none") return null;
  const shorthand = parseShorthand(raw);
  const duration =
    parseTime(style.getPropertyValue("--thread-scroll-duration")) ?? shorthand.duration;
  const easing =
    style.getPropertyValue("--thread-scroll-easing").trim() || shorthand.easing || DEFAULT_EASING;
  const parsedSpeed = Number.parseFloat(style.getPropertyValue("--thread-scroll-speed"));
  const speed = parsedSpeed > 0 ? parsedSpeed : null;

  if (duration === null && speed === null) return null;
  return { duration, speed, easing };
};

// The duration (ms) for one scroll of `distance` px under `timing`.
export const resolveDuration = ({ duration, speed }: ScrollTiming, distance: number): number => {
  const paced = speed === null ? null : (Math.abs(distance) / speed) * 1000;
  const resolved =
    paced === null ? duration : duration === null ? paced : Math.min(duration, paced);
  return Math.max(0, resolved ?? 0);
};

// The easing curve is evaluated by the browser: a target-less effect runs on
// the document timeline, and its computed progress is the eased progress — so
// every CSS easing works, linear() springs included, with no parser here. An
// easing the engine rejects falls back to the default. No fill: past the end
// the progress reads null, which the animator treats as done.
const createTimingEffect = (duration: number, easing: string): Animation => {
  const options: KeyframeEffectOptions = { duration, easing };
  try {
    return new Animation(new KeyframeEffect(null, null, options), document.timeline);
  } catch {
    const fallback = { ...options, easing: DEFAULT_EASING };
    return new Animation(new KeyframeEffect(null, null, fallback), document.timeline);
  }
};

export type ScrollAnimationOptions = {
  duration: number;
  easing: string;
  /**
   * Read every frame, so a destination that moves mid-flight (a reply
   * streaming in, the reserve resizing) is tracked instead of overshot.
   */
  getTarget: () => number;
  /** Runs once the animation reaches its end — not when it is cancelled. */
  onFinish: () => void;
};

/**
 * Animates `scroller` from its current scrollTop to `getTarget()`. One
 * scrollTo per frame; nothing runs between animations. Returns a cancel
 * function that stops it where it is.
 */
export const animateScroll = (
  scroller: HTMLElement,
  { duration, easing, getTarget, onFinish }: ScrollAnimationOptions,
): (() => void) => {
  const from = scroller.scrollTop;
  const timing = createTimingEffect(duration, easing);
  timing.play();

  let frame = 0;
  const step = () => {
    const progress = timing.effect?.getComputedTiming().progress ?? 1;
    // "instant" so a scroll-behavior: smooth on the scroller can't turn each
    // frame into a smooth scroll of its own.
    scroller.scrollTo({ top: from + (getTarget() - from) * progress, behavior: "instant" });
    if (timing.playState === "finished") {
      timing.cancel();
      onFinish();
      return;
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);

  return () => {
    cancelAnimationFrame(frame);
    timing.cancel();
  };
};
