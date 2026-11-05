---
"@intentface/ui": minor
---

- [Thread] [Breaking] Remove `Thread.Overlay`, its `ThreadOverlayProps` and `ThreadOverlayState` types, the `data-thread-overlay` attribute and `--thread-overlay-top-height`. Render your own `aria-hidden`, `pointer-events-none` `div` for a fade, and set the space above a landed turn with `--thread-inset-top`.
- [Thread] [Breaking] Rename `--thread-overlay-bottom-height` to `--thread-inset-bottom`, which now includes `--thread-composer-gap`. Pad `Thread.Content` with `pb-(--thread-inset-bottom)` and set `--thread-composer-gap` on `Thread.Root` for the room above the composer.
- [Thread] [Breaking] Remove `--thread-turn-area`. Read `--thread-turn-min-height` instead.
- [Thread] [Breaking] `Thread.Viewport` is a size container, so it needs a definite height. Give it `h-full` inside a sized `Thread.Root` rather than only a `max-height`.
- [Thread] [Breaking] `--thread-inset-bottom` and `--thread-turn-min-height` assume the composer overlays the viewport. If your composer sat in flow below a `flex-1` viewport, give `Thread.Composer` `absolute inset-x-0 bottom-0`, pad `Thread.Content` with `pb-(--thread-inset-bottom)`, and render `Message.Turn`s or pass `autoScroll="bottom"`.
- [Thread] Move `--thread-turn-min-height` from `Thread.Content` to `Thread.Root`. It is the viewport's height (`100cqh`) minus the top inset and the bottom inset in `follow` and `jump`, and `0px` in `bottom` and `off`, so `[&>*:last-child]:min-h-(--thread-turn-min-height)` can stay on `Thread.Content` in every mode.
- [Thread] New `--thread-inset-top` for the space above a landed turn and `--thread-composer-gap` for the room between the last line and the composer. Set both on `Thread.Root`.
- [Thread] New `--thread-composer-height` and `--thread-composer-width`, the `Thread.Composer` slot's size.
- [Thread] Fix a `Thread.Composer` that mounts late or remounts going unmeasured. Its variables are removed when it unmounts.
- [Message] `groupTurns` accepts any records with an `id` and a `role`.
