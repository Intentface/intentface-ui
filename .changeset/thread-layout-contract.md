---
"@intentface/ui": minor
---

- [Thread] [Breaking] Remove `Thread.Overlay`. Render your own `div` (absolute, `pointer-events-none`, `aria-hidden`); the landing gap is now the top padding above `Thread.Content`.
- [Thread] [Breaking] `Thread.Composer` positions itself (absolute along the bottom edge). Drop your positioning classes, or pass `style` to override.
- [Thread] [Breaking] `Thread.Content` applies the last-turn reserve to its last child. Delete your `[&>*:last-child]:min-h-(--thread-turn-min-height,0px)` rule.
- [Thread] [Breaking] Rename `--thread-overlay-bottom-height` to `--thread-dock-inset`.
- [Thread] New `--thread-dock-height` and `--thread-dock-width`, the `Thread.Composer` slot's size.
- [Thread] In development, warn when a top-landing `autoScroll` mode finds a last child of `Thread.Content` that isn't a `Message.Turn`.
- [Message] `groupTurns` accepts any records with an `id` and a `role`.
