# Thread

The scrollable message viewport — a layout container that frames a chat: a scroll area, top/bottom blur overlays, a bottom-anchored composer dock, an empty-state placeholder, a "scroll to latest" button, and built-in auto-scroll. It knows nothing about chats or messages; you compose those inside it. Single component (`components/ai/thread.tsx`), exposed as a compound API via `Thread.X`.

Import from `@/components/ai/thread`.

## Minimal usage

The bare skeleton — a scroll area with a composer dock:

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

`Thread` is a plain layout container. `Thread.Composer` positions itself along the bottom edge, the thread measures the dock and publishes the room it takes, and `Thread.Overlay` (this app's own component, a plain `div`) fades content at the edges. Scroll state is exposed via context. Auto-scroll is **built in**: the `autoScroll` prop defaults to `"follow"`; pass `"off"` for a plain scroll area.

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
- **"Lands at top"** means the newest turn is lifted so its top sits at the top of the viewport — the reply streams into the space below. It works by reserving a viewport-tall `min-height` on the last child of the content column, so each child must be a `Message.Turn` (see [Layout](#layout)).
- **`autoScroll="off"`** = a plain scroll area: no landing, no follow, no reserve. The scroll-to-latest button still works.

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
The layout container and scroll-state provider. Standard `div` props. Measures the composer dock, defaults `--chat-top-inset` and `--thread-dock-inset`, and sets up the scroll context.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `autoScroll` | `ThreadAutoScrollMode` | `"follow"` | `"off" \| "bottom" \| "jump" \| "follow"`. See [Auto-scroll modes](#auto-scroll-modes). |

### `Thread.Viewport`
The scroll area — holds the content column (your turns) and the edge sentinels. Standard `div` props + `children`. It pads the content column by `--chat-top-inset` above (the gap a landed turn leaves at the top) and `--thread-dock-inset` below. The package puts the newest-turn reserve on the content column's last child, so pass `Message.Turn`s as `children`.

### `Thread.Composer`
Bottom-anchored dock for your composer + the scroll button. Standard `div` props + `children`. It positions itself (`position: absolute` along the bottom edge; pass `style` to override), and Thread measures it to reserve bottom space, so content never hides behind it. Parts that shouldn't push content up — the scroll button, an overlay panel — must sit out of the slot's flow (absolute or portaled).

### `Thread.Overlay`
A progressive-blur band fading content into the top or bottom edge. A plain `div` of this app (the package has no overlay part): `aria-hidden` and `pointer-events-none`, so clicks pass through to the content. Its top height is `--chat-top-inset` and its bottom height is `--thread-dock-inset`.

| Prop | Type | Notes |
|---|---|---|
| `direction` | `"top" \| "bottom"` | Which edge to fade. Required. |
| …rest | `ProgressiveBlur` props | |

### `Thread.Placeholder`
Centered empty-state container — render it in place of turns when there are no messages. Standard `div` props + `children`.

### `Thread.ScrollButton`
A floating "Latest" button that appears (animated) only when the user is not at the bottom and scrolls to the bottom on click. Place it inside `Thread.Composer`. Standard `motion.div` props.

## Layout

Thread writes a few CSS variables on its root via a `ResizeObserver` (not React state — composer growth never re-renders the thread):

| Variable | Meaning |
|---|---|
| `--thread-dock-inset` | Space the `Thread.Composer` slot (`[data-thread-composer]`) takes from the root's bottom edge, plus a 32px gap. The content wrapper's bottom padding and the bottom overlay's height. Default `8rem` until the slot is measured. |
| `--thread-dock-height` | Height of the `Thread.Composer` slot, in whole pixels. |
| `--thread-dock-width` | Width of the `Thread.Composer` slot, in whole pixels. |
| `--thread-turn-area` | The visible thread area (root − space above the content − dock inset). The top-landing `autoScroll` modes map the last child's reserve to this. |

`--chat-top-inset` (default `4rem`) is this app's own variable, not the package's: the top padding above the content column and the top overlay's height. A landed turn sits exactly this far from the top.

You normally don't touch these — they keep the composer-dock spacing and the top-landing reserve self-adjusting.

### Without Tailwind

The package emits only behavior-critical inline styles (`position`, `overflow`, the sentinels, the composer's position, the last child's `min-height`). The minimum a plain-CSS consumer writes is the root's size, the viewport's scroll, the padding wrapper and the turns:

```css
.chat { height: 100%; }
.chat-viewport { height: 100%; }
.chat-pad {
  min-height: 100%;
  padding-top: 24px; /* the landing gap */
  padding-bottom: var(--thread-dock-inset, 128px);
}
.chat-turns { display: flex; flex-direction: column; gap: 16px; }
```

```tsx
<Thread.Root className="chat">
  <Thread.Viewport className="chat-viewport">
    <div className="chat-pad">
      <Thread.Content className="chat-turns">
        {groupTurns(messages).map((turn) => (
          <Message.Turn key={turn.key}>{/* question, then reply */}</Message.Turn>
        ))}
      </Thread.Content>
    </div>
  </Thread.Viewport>
  <Thread.Composer>{/* your composer */}</Thread.Composer>
</Thread.Root>
```

## Reference: types

From `@/components/ai/thread`:

`ThreadRootProps`, `ThreadOverlayProps`, `ThreadViewportProps`, `ThreadComposerProps`, `ThreadPlaceholderProps`, `ThreadScrollButtonProps`, `ThreadAutoScrollMode`.
