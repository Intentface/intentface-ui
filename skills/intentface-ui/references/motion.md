# Motion

What can animate in each primitive, the attribute or variable that drives it, and how the part times its unmount. Take every duration and easing from the app's motion tokens, and gate movement behind `prefers-reduced-motion`, as `SKILL.md` says.

## Rules

- **Animate the part's own element.** A part that unmounts after its exit waits for the transition on its own element, so put the transition there, not on a wrapper or a child. `Nav.List` is the exception: it waits for every animation anywhere in its `Nav.Group`, keyframes included. Stop an infinite animation, such as a spinner, before the group closes, or the group never finishes closing.
- **Heights through the variables.** Animate a height only between 0 and the variable the part publishes, never with `max-height` tricks or a measured height of your own.
- **Time the thread's scroll, never script it.** The thread runs every scroll itself: the follow, the landing, `scrollToBottom`, `scrollToTop` and `scrollToMessage`. Shape its smooth scrolls with the `--thread-scroll` variables below, never with a scroll animation of your own.

## By primitive

| What moves | Drive it with | Mount and unmount |
|------|------|------|
| `Composer.Panel` opening and closing | From `data-starting-style` to its open style, and to `data-ending-style` while closing. Animate from the side in `data-side` when anchored | Waits for the exit transition, then unmounts |
| `Composer.Popover` showing and hiding | Between `data-open` and `data-closed`. There are no frame attributes. Animate from the side in `data-side` | Never unmounts, so the closed style must also hide it |
| `Composer.ContextWindow` | Between `data-open` and `data-closed` | Stays mounted |
| The send and stop swap | `data-generating` on `Composer.Submit`. Cross-fade two icons stacked in one slot | Stays mounted |
| The drop affordance | `data-dragging` on `Composer.Root`, and `data-visible` on `Attachments.Dropzone` | The drop zone unmounts while hidden, unless `keepMounted` |
| Attachment items | The app's own entrance on each item | Items mount and unmount at once, so removal is instant |
| `Steps.Panel` and `Reasoning.Content` | `height` from `--panel-height`, pinned to 0 under `data-starting-style` and `data-ending-style` | Waits for the transition, then unmounts unless `keepMounted` |
| A disclosure's chevron | `data-open` on `Steps.Trigger` or `Reasoning.Trigger`, read from inside the trigger | Stays mounted |
| The reasoning label | `data-streaming` on `Reasoning.Root`, such as a shimmer while it thinks | Stays mounted |
| A `Nav` group opening and closing | `height` from `--nav-list-height` on `Nav.List`, pinned to 0 under `data-starting-style` and `data-ending-style`. The caret reads `data-open` | Waits for the transition, then unmounts unless `keepMounted` |
| `Shell` collapsing and expanding | `left` on `Shell.Sidebar` and `width` on the gutter, from `data-state`. Turn both off while `data-resizing` is present | Stays mounted |
| `Shell` hover-peek | `left` only, while `data-hotspot` is present, so the sidebar never changes height mid-slide | Stays mounted |
| `Tabs.Popup` opening and closing | From `data-starting-style`, and to `data-ending-style`. Transition `Tabs.Positioner`'s `top` and `left` to glide between tabs | `Tabs.Portal` unmounts once the popup's transitions end |
| A tab panel switching | `data-activation-direction` on `Tabs.Viewport` says which way to slide | A different component replaces the old one at once. The same component keeps its instance and receives the new id, unless the content is keyed by the tab |
| A new message | The app's own entrance on its row. Skip the rows present at mount, so a reload doesn't replay the transcript | The row mounts with its message |
| The pending indicator | The app's own, while `useChat` reports `"submitted"`, and while `"streaming"` until the reply has a segment to show | Mounts and unmounts with that state |
| The thread's smooth scrolls | `--thread-scroll` on `Thread.Root`, as the next section says. `data-scrolling` names the scroll that runs | Nothing mounts. Any wheel, touch, scroll key or scrollbar press stops the scroll where it is |

## The thread's scroll

Smooth scrolls are the browser's own until the app sets a timing on `Thread.Root`:

```tsx
<Thread.Root className="[--thread-scroll:400ms_cubic-bezier(0.2,0.8,0.2,1)]">{/* … */}</Thread.Root>
```

- **One shorthand.** `--thread-scroll` reads like `transition`, a duration and any CSS easing in either order, `linear()` included. Motion's `spring()` prints that pair, so a spring goes in through `style`, as in `style={{ "--thread-scroll": String(spring(0.5, 0)) } as CSSProperties}`. React's `CSSProperties` lists no custom properties, hence the cast. Keep the bounce at 0, because the scroller clips an overshoot at the bottom into a hard stop.
- **Longhands and speed.** `--thread-scroll-duration` and `--thread-scroll-easing` override the shorthand. `--thread-scroll-speed` paces a scroll by its distance, in pixels per second, and a duration set alongside it becomes the cap.
- **Off, instant and reduced motion.** `--thread-scroll: none` keeps the native smooth scroll over any longhand, and `0ms` makes every scroll instant. Under `prefers-reduced-motion` every scroll is instant already, so the timing needs no gate.
- **The follow is pinned.** A timed thread pins the follow instead of animating it. `autoScroll` decides which scrolls happen, and the timing shapes the ones that animate.
- **One timing, set once.** The thread reads the timing when a scroll starts, before `data-scrolling` appears. A timing under `[data-scrolling=top]` or any other per-kind selector never applies, and every change restyles every message, because custom properties inherit.
- **`data-scrolling` is for styling.** It names the running scroll, `land`, `bottom`, `top` or `message`, and never `follow`. Use it for styles such as hiding the scroll button mid-flight.
