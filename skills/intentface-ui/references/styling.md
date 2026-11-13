# Styling: what each part renders and owns

What each part renders, what the package already sets on it inline, and what the app has to set. Never repeat what the package sets, and always set what it leaves to the app. Colors, sizes, radii and type values are the app's, from its design system.

## Thread

| Element | The package sets | The app sets |
|------|------|------|
| `Thread.Root`, `data-thread-root` | `position: relative`, `overflow: hidden` and `--thread-turn-min-height` | A definite height from its layout, `--thread-inset-top`, `--thread-composer-gap`, and the scroll timing when the app has one. |
| `Thread.Viewport`, `data-thread-scroller` | `overflow-y: auto`, `overflow-x: hidden`, `container-type: size`, a tab stop and `role="region"` | A definite height, usually the root's full height, `scrollbar-gutter: stable`, and a `scroll-padding` of `--thread-inset-top` at the top and `--thread-inset-bottom` at the bottom. Never a padding or a gap, which shifts the landing. |
| Edge sentinels, `data-thread-top` and `data-thread-bottom` | 1px elements rendered just before and after `Thread.Content`, as its siblings | Nothing. A gap on their parent spaces them like any other child and shifts the landing. |
| `Thread.Content`, `data-thread-content` | `role="log"`, nothing visual | The column's width, the gap between turns, a top padding of `--thread-inset-top`, a bottom padding of `--thread-inset-bottom`, and the last turn's minimum height from `--thread-turn-min-height`. The sentinels sit outside it, so `:last-child` is the last turn. |
| `Thread.Composer`, `data-thread-composer` | Nothing positioned. It writes `--thread-inset-bottom`, `--thread-composer-height` and `--thread-composer-width` on the root, and removes them when it unmounts | Its position, usually absolute at the bottom over the viewport, kept to the content column's width. Make it click-through with `pointer-events: none` and turn the pointer back on for `Composer.Root`, so clicks and drags around the composer reach the transcript and its scrollbar. |
| A fade, the app's own `div` | Nothing. There is no overlay part | `position: absolute`, `aria-hidden`, `pointer-events: none`, and a height of `--thread-inset-top` at the top or `--thread-inset-bottom` at the bottom. Keep it to the content column's width, so it never covers the viewport's scrollbar. |

## Composer

| Element | The package sets | The app sets |
|------|------|------|
| `Composer.Root`, `data-composer-root` | A `div`, not a form | The layout of the panel and the container. |
| `Composer.Container` | Nothing | The input's surface. |
| `Composer.Textarea`, `data-composer-textarea` | A relative wrapper around the editor and the placeholder | The padding, the minimum and maximum height, the scrolling, and the font family, size and line height. |
| The editor, `data-composer-editor` | `white-space: break-spaces` and `overflow-wrap: break-word` | The text color, the caret and the focus style. Never its type or padding alone. |
| The placeholder overlay, `data-composer-placeholder` | `position: absolute`, `inset: 0` over the editor, `pointer-events: none` and `aria-hidden`, while the editor is empty | The hint's color. Never a position or padding, because it already starts where the caret does. |
| `Composer.Placeholder`, `data-composer-placeholder-text` | Nothing | A color only. Never a position, padding or type of its own. |
| `Composer.Actions` | Nothing | The row of buttons. |
| `Composer.Submit`, `data-composer-submit` | `type="button"`, and `disabled` while there is nothing to send | Everything visual, per `:disabled` and `data-generating`. |
| `Composer.Attachments` | A hidden file input | Nothing. The strip is the app's own markup. |
| `Composer.Panel`, `data-composer-panel` | By default a portal to `document.body`, `position: absolute` and hidden until placed. In flow with `anchor={false}` | Its width from `--anchor-width`, its `z-index` and its surface. |
| `Composer.Popover`, `data-composer-popover` | A portal to `document.body`, mounted while closed. `position: absolute` and placed from its first open. Before that it is an unpositioned element at the end of `body` | Its width, its `z-index`, its surface, and hiding it on `data-closed`. |

## Message

| Element | The package sets | The app sets |
|------|------|------|
| `Message.Turn` | Nothing visual | The turn's spacing. |
| `Message.Root`, `data-message` | Nothing visual. `role` becomes `data-role` and is not forwarded as an ARIA role | The layout and surface per author. |
| `Message.Text`, `data-message-text` | A `span` | The text's look. Use `render={<div />}` when it renders blocks. |
| Default chips, `data-message-chip` | A `span` | Their look, or `Chip` parts through `renderChip`. |

## Steps, Reasoning and chips

| Element | The package sets | The app sets |
|------|------|------|
| `Steps.Status` | Visually hidden by default, so screen readers announce it | Its visible style, when the status should show. |
| `Steps.Icon` | `aria-hidden` | The icon per `data-status`. |
| `Steps.Panel`, `Reasoning.Content` | `--panel-height` during transitions, and unmounted while closed | The height transition and `overflow: hidden`. |
| `Reasoning.Root` | `aria-busy` while streaming | The disclosure's look. |
| `Chip.Root`, `data-chip` | A `span` that flows with the text | The token's look. |

## Attachments

| Element | The package sets | The app sets |
|------|------|------|
| `Attachments.Root`, `Attachments.Item` | Nothing | The strip and each item. |
| `Attachments.Dropzone` | Mounted only while `visible` or `keepMounted`. A portal when `portalSelector` names a target | Its position, its `z-index` and its look. |

## App shell

| Element | The package sets | The app sets |
|------|------|------|
| Every `Shell` part | Nothing positioned. The grip writes `--shell-sidebar-width` on the root | The sidebar out of flow, the gutter, the width with its `min-width` and `max-width`, an opaque background, and the hotspot's position. |
| `Nav.List` | `--nav-depth`, and `--nav-list-height` during transitions | The indent and the collapse. |
| `Nav.Item`, `Nav.Trigger` | A `div` with `role="button"`, which a row given its own element through `render` drops | A row height that matches the rail. Never `overflow: hidden`. |
| `Tabs.Positioner` | `position: absolute`, its `left` and `top`, and hidden until placed | Its `z-index` only. `Tabs.Popup` inside it carries the surface. |
| `Tabs.Popup` | Nothing | The surface and its transitions. |
| `Tabs.Trigger` | A `div` with `role="button"` | `position: relative` and `overflow: hidden` when a close button sits over the label. |
| `Tabs.Close` | Out of the tab order | An `aria-label`. |
