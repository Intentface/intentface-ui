# Motion

What can animate in each primitive, the hook that drives it, and how the part times its unmount. A polished chat animates its state changes. The package provides the hooks and the timing of mount and unmount, and the app provides every duration and easing.

## Rules

- **Timing from the design system.** Take durations and easing from the app's motion tokens, such as a Motion section in its `DESIGN.md`. Without tokens, match the app's existing motion, then the docs demos. Never invent values.
- **Reduced motion.** Gate movement and scale behind `prefers-reduced-motion`, and keep opacity fades or nothing.
- **Animate the part's own element.** A part that unmounts after its exit waits for the transition on its own element, so put the transition there, not on a wrapper or a child.
- **Heights through the variables.** Animate a height only between 0 and the variable the part publishes, never with `max-height` tricks or a measured height of your own.
- **Never animate the scroll.** The thread scrolls itself while it follows the stream and when a turn lands.

## By primitive

| What moves | Drive it with | Mount and unmount |
|------|------|------|
| `Composer.Panel` opening and closing | From `data-starting-style` to its open style, and to `data-ending-style` while closing. Animate from the side in `data-side` when anchored | Waits for the exit transition, then unmounts |
| `Composer.Popover` showing and hiding | Between `data-open` and `data-closed`. There are no frame attributes. Animate from the side in `data-side` | Never unmounts, so the closed style must also hide it |
| `Composer.ContextWindow` | Between `data-open` and `data-closed` | Stays mounted |
| The send and stop swap | `data-generating` on `Composer.Submit`. Cross-fade two icons stacked in one slot | — |
| The drop affordance | `data-dragging` on `Composer.Root`, and `data-visible` on `Attachments.Dropzone` | The drop zone unmounts while hidden, unless `keepMounted` |
| Attachment items | The app's own entrance on each item | Items mount and unmount at once, so removal is instant |
| `Steps.Panel` and `Reasoning.Content` | `height` from `--panel-height`, pinned to 0 under `data-starting-style` and `data-ending-style` | Waits for the transition, then unmounts unless `keepMounted` |
| A disclosure's chevron | `data-open` on `Steps.Trigger` or `Reasoning.Trigger`, read through a named group | — |
| The reasoning label | `data-streaming` on `Reasoning.Root`, such as a shimmer while it thinks | — |
| A `Nav` group opening and closing | `height` from `--nav-list-height` on `Nav.List`, pinned to 0 under `data-starting-style` and `data-ending-style`. The caret reads `data-open` | Waits for the transition, then unmounts unless `keepMounted` |
| `Shell` collapsing and expanding | `left` on `Shell.Sidebar` and `width` on the gutter, from `data-state`. Turn both off while `data-resizing` is present | — |
| `Shell` hover-peek | `left` only, while `data-hotspot` is present, so the sidebar never changes height mid-slide | — |
| `Tabs.Popup` opening and closing | From `data-starting-style`, and to `data-ending-style`. Transition `Tabs.Positioner`'s `top` and `left` to glide between tabs | `Tabs.Portal` unmounts once the popup's transitions end |
| A tab panel switching | `data-activation-direction` on `Tabs.Viewport` says which way to slide | The old content unmounts at once |
| A new message | The app's own entrance on its row. Skip the rows present at mount, so a reload doesn't replay the transcript | — |
| The pending indicator | The app's own, while `useChat` reports `"submitted"` | — |
