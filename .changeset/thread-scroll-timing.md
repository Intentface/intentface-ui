---
"@intentface/ui": minor
---

- [Thread] Add `--thread-scroll` (with `-duration` / `-easing` longhands) to time every smooth scroll from CSS; any easing works, `linear()` included.
- [Thread] Add `--thread-scroll-speed` to pace smooth scrolls by distance, capped by the duration.
- [Thread] Pin the follow while a timing is set; `autoScroll` decides which scrolls happen and the timing shapes the ones that animate.
- [Thread] Add `data-scrolling` on `Thread.Root` while a timed scroll runs, naming its kind.
- [Thread] Fix `scrollToMessage` scrolling the page around an embedded thread.
- [Thread] Fix `isAtBottom` staying true after `scrollToTop` or `scrollToMessage` leaves the bottom.
- [Thread] Fix scrolls animating under `prefers-reduced-motion` when the scroller sets `scroll-behavior: smooth`.
