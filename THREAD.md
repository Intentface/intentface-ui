# Thread

The scrollable message viewport — a layout container that frames a chat: a scroll area, top/bottom blur overlays, a bottom-anchored composer, an empty-state placeholder, a "scroll to latest" button, and built-in auto-scroll. It knows nothing about chats or messages; you compose those inside it. Single component (`components/ai/thread.tsx`), exposed as a compound API via `Thread.X`.

Import from `@/components/ai/thread`.

## Minimal usage

The bare skeleton — a scroll area with a composer:

```tsx
import { Thread } from "@/components/ai/thread";

<Thread>
  <Thread.Viewport>{/* your turns */}</Thread.Viewport>
  <Thread.Composer>{/* your composer */}</Thread.Composer>
</Thread>;
```

A realistic chat — overlays, auto-scroll, a scroll-to-latest button, and message turns:

```tsx
<Thread autoScroll="follow">
  <Thread.Overlay direction="top" />
  <Thread.Viewport>
    {messages.length === 0 ? (
      <Thread.Placeholder>
        <EmptyState />
      </Thread.Placeholder>
    ) : (
      turns.map((turn) => <Message.Turn key={turn.id}>{/* ... */}</Message.Turn>)
    )}
  </Thread.Viewport>
  <Thread.Composer>
    <Thread.ScrollButton />
    <Composer onSubmit={onSubmit}>{/* ... */}</Composer>
  </Thread.Composer>
  <Thread.Overlay direction="bottom" />
</Thread>;
```

`Thread` is a plain layout container. This app's `Thread.Composer` places the package's composer slot along the bottom edge, the package measures the slot and publishes the room it takes, and `Thread.Overlay` (this app's own component, a plain `div`) fades content at the edges. Scroll state is exposed via context. Auto-scroll is **built in**: the `autoScroll` prop defaults to `"follow"`; pass `"off"` for a plain scroll area.

## Auto-scroll modes

The `autoScroll` prop on `<Thread>` controls how the view reacts when a turn is added and while a reply streams:

| `autoScroll` | New turn lands at | Follows the streaming reply? | Feels like |
|---|---|---|---|
| `"follow"` (default) | top | yes | ChatGPT / Claude |
| `"jump"` | top | no | jump-to-top, then read freely |
| `"bottom"` | bottom | yes | Codex / classic chat |
| `"off"` | — | no | a plain scroll area |

Notes:

- **Follow is conditional.** When following, the view sticks to the bottom only while the user is already at the bottom; scrolling up releases it (and `Thread.ScrollButton` reappears). Scrolling back to the bottom re-engages.
- **"Lands at top"** means the newest turn is lifted so its top sits at the top of the viewport — the reply streams into the space below. It works because the content column gives its last child `min-height: var(--thread-turn-min-height)`, which fills the viewport between the top and bottom padding, so each child must be a `Message.Turn` (see [Layout](#layout)).
- **`autoScroll="off"`** = a plain scroll area: no landing and no follow. The scroll-to-latest button still works.

```tsx
<Thread autoScroll={scrollMode}>   {/* scrollMode: ThreadAutoScrollMode */}
```

## Thread context

Any part inside `<Thread>` can read scroll state via `useThread()`:

```tsx
const { isAtBottom, scrollToBottom } = useThread();

scrollToBottom();           // smooth (default)
scrollToBottom("instant");  // jump
```

| Field | Type | Description |
|---|---|---|
| `isAtBottom` | `boolean` | Whether the bottom sentinel is in view (computed by an IntersectionObserver — no `scrollTop` reads). |
| `scrollToBottom` | `(behavior?: ScrollBehavior) => void` | Scroll the viewport to the bottom. Defaults to `"smooth"`. |
| `scrollRef` | `RefObject<HTMLDivElement \| null>` | The scroll container. |
| `contentRef` | `RefObject<HTMLDivElement \| null>` | The content column (turns are its direct children). |
| `sentinelRef` | `RefObject<HTMLDivElement \| null>` | The bottom sentinel used for at-bottom detection. |

Throws if used outside `<Thread>`.

## Compound parts

### `Thread` (root)
The layout container and scroll-state provider. Standard `div` props. Sets `--thread-inset-top: 4rem` and `--thread-composer-gap: 2rem` for the package, which publishes `--thread-turn-min-height` on it, and sets up the scroll context.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `autoScroll` | `ThreadAutoScrollMode` | `"follow"` | `"off" \| "bottom" \| "jump" \| "follow"`. See [Auto-scroll modes](#auto-scroll-modes). |

### `Thread.Viewport`
The scroll area — holds the content column (your turns) and the edge sentinels. Standard `div` props + `children`. The content column pads itself with `pt-(--thread-inset-top) pb-(--thread-inset-bottom)` and gives its last child `min-height: var(--thread-turn-min-height)`, so pass `Message.Turn`s as `children`.

### `Thread.Composer`
Bottom-anchored slot for your composer + the scroll button. Standard `div` props + `children`. This wrapper positions the package's slot with `absolute inset-x-0 bottom-0`, and the package measures the slot into `--thread-inset-bottom`, which the content column pads by, so content never hides behind it. Parts that shouldn't push content up — the scroll button, an overlay panel — must sit out of the slot's flow (absolute or portaled).

### `Thread.Overlay`
A progressive-blur band fading content into the top or bottom edge. A plain `div` of this app (the package has no overlay part): `aria-hidden` and `pointer-events-none`, so clicks pass through to the content. Its top height is `--thread-inset-top` and its bottom height is `--thread-inset-bottom`.

| Prop | Type | Notes |
|---|---|---|
| `direction` | `"top" \| "bottom"` | Which edge to fade. Required. |
| …rest | `ProgressiveBlur` props | |

### `Thread.Placeholder`
Centered empty-state container — render it in place of turns when there are no messages. Standard `div` props + `children`.

### `Thread.ScrollButton`
A floating "Latest" button that appears (animated) only when the user is not at the bottom and scrolls to the bottom on click. Place it inside `Thread.Composer`. Standard `motion.div` props.

## Layout

The package applies no layout. It publishes CSS variables on the root, and this app's parts read them as classes. The composer slot's `ResizeObserver` writes the composer variables, not React state, so composer growth never re-renders the thread.

| Variable | Meaning |
|---|---|
| `--thread-width` | This app's own, set in `app/globals.css` to `672px`. The max width of the content column, the overlays and the composer slot. The package never reads it. |
| `--thread-inset-top` | Set by this app's root to `4rem`. The space above a landed turn. The content column's top padding and the top overlay's height. |
| `--thread-composer-gap` | Set by this app's root to `2rem`. The room between the last line and the composer, folded into `--thread-inset-bottom`. |
| `--thread-inset-bottom` | Written by the package. The distance from the root's bottom edge up to the top of the `Thread.Composer` slot (`[data-thread-composer]`), plus `--thread-composer-gap`. The content column's bottom padding and the bottom overlay's height. |
| `--thread-composer-height` | Written by the package. Height of the `Thread.Composer` slot, in whole pixels. |
| `--thread-composer-width` | Written by the package. Width of the `Thread.Composer` slot, in whole pixels. |
| `--thread-turn-min-height` | Written by the package. In `"follow"` and `"jump"`, the viewport's height minus `--thread-inset-top` and `--thread-inset-bottom`. In `"bottom"` and `"off"`, `0px`. The content column's last child takes it as `min-height`. |

To change the spacing, change `--thread-inset-top` and `--thread-composer-gap` on the root. The padding, the overlays and the last turn's `min-height` all read the same variables, so a landed turn stays exactly `--thread-inset-top` from the top.

The package's full layout contract, including a plain-CSS version, is on the docs site's [Thread](https://ui.intentface.com/primitives/thread) page (`content/docs/primitives/thread.mdx`).

## Reference: types

From `@/components/ai/thread`:

`ThreadRootProps`, `ThreadOverlayProps`, `ThreadViewportProps`, `ThreadComposerProps`, `ThreadPlaceholderProps`, `ThreadScrollButtonProps`, `ThreadAutoScrollMode`.
