# Props, attributes and CSS variables by primitive

The hooks that carry state and size for each primitive, with the element each one sits on, when it is present, and what it is for. The docs pages' Attributes tables remain the full list. This file adds where and when.

A prop in the first column means the app sets the state and the part reflects it. An attribute or variable alone means the part tracks it itself.

## Thread

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `autoScroll` | `Thread.Root` | always | `"follow"` keeps the stream in view while the user is at the bottom, and `"jump"` lands each new turn at the top without following. `"bottom"` and `"off"` set no landing reserve. |
| `data-at-bottom` | `Thread.Root` | while the live end is in view | Hide the scroll-to-bottom button and the bottom fade. Show them while it is absent. |
| `data-at-top` | `Thread.Root` | while the start is in view | Hide a top fade or a load-older control. |
| `data-thread-overlay` | `Thread.Overlay` | always, `"top"` or `"bottom"` | Point each fade the right way. The top overlay's rendered height is the thread's top inset, the gap a landed turn keeps below the top edge. With no top overlay it is 0. |
| `data-thread-content` | `Thread.Content` | always | The message column, for global CSS. |
| `--thread-overlay-bottom-height` | `Thread.Root` | while `Thread.Composer` is mounted | `Thread.Viewport`'s bottom padding and the bottom overlay's height. It already includes a gap above the composer. |
| `--thread-turn-min-height` | `Thread.Content` | in `"follow"` and `"jump"` modes | The last turn's minimum height, so a new turn lands at the top. Read it with a `0px` fallback. |

## Message

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `role` → `data-role` | `Message.Root` | always, the role string | Layout and surface per author, such as a bubble for the user and bare text for the assistant. Children read it through a group on the root. |
| `isLast` → `data-last` | `Message.Root` | on the last message | Actions, a caret or a regenerate button only on the newest message. |
| `isError` → `data-error` | `Message.Root` | on a failed message | The failed style and a retry control. |
| `data-message-text` | `Message.Text` | always | The text element. |
| `data-message-chip` | default chips in `Message.Text` | always | Chips rebuilt from the text, when `renderChip` doesn't render them with `Chip` parts. |

## Composer

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `isSubmitting` → `data-submitting` | `Composer.Root` | while the app is sending | A sending style. The composer blocks another submit meanwhile. |
| `data-dragging` | `Composer.Root` | while files are dragged over the drop scope | The drop affordance. |
| `--composer-height`, `--composer-width` | `Composer.Root` | once measured, in whole px | Sizing or placing elements inside the composer's tree against it. Portaled content can't read them, so read `useComposer((composer) => composer.size)` there. |
| `--composer-container-height`, `--composer-container-width` | `Composer.Root` | once measured, while a `Composer.Container` is mounted | The same, for the container. |
| `data-composer-textarea` | `Composer.Textarea` | always | The padding, the height, the scrolling and the type. The editor and the placeholder inherit them, so their text lines up. |
| `data-composer-editor` | the editable element inside `Composer.Textarea` | always | The text color, the caret and the focus style. It is the element that takes focus. Font metrics belong on the textarea, or the placeholder won't match. |
| `data-composer-placeholder` | an overlay over the editor, inside `Composer.Textarea` | while the editor is empty | Nothing. The package positions it at `inset: 0` over the editor, so it already starts where the caret does. |
| `data-composer-placeholder-text` | `Composer.Placeholder` | while the editor is empty | The placeholder's color. Never position or pad it. |
| `data-filled` | `Composer.Textarea` | while the editor has content | A filled style, such as showing a clear button. |
| `data-disabled` | `Composer.Textarea` | while disabled | The disabled style. |
| `data-mention-chip` | committed chips inside the editor | always | Mentions the user inserted from a command list. |
| `data-command-badge` | the active trigger token in the editor, such as a leading `@` | while a command is active | The token being completed. `Composer.Popover` anchors to it. |
| `data-command-hint` | ghost text after the trigger token | while a command is active | The completion of the highlighted item, or a placeholder for an empty query. |
| `isGenerating` → `data-generating` | `Composer.Submit` | while the reply streams | The stop icon and label. With `onStop`, the button stops instead of sending. |
| `:disabled` | `Composer.Submit` | while there is nothing to send, or while submitting | The disabled style. A `disabled` prop replaces this logic. |
| `data-open`, `data-closed` | `Composer.Panel`, `Composer.Popover`, `Composer.ContextWindow` | open while they have content | Show and hide. `Composer.Popover` stays mounted while closed, so hide it on `data-closed`. |
| `data-starting-style`, `data-ending-style` | `Composer.Panel` | the first open frame, and while closing | The enter and exit transition. |
| `data-side`, `data-align` | a positioned `Composer.Panel`, `Composer.Popover` | while positioned | The side it landed on, to animate from. |
| `--anchor-width`, `--anchor-available-height` | a positioned `Composer.Panel`, `Composer.Popover` | while positioned | Matching the anchor's width, and capping the height to the free space. |
| `data-empty`, `data-loading` | `Composer.Command` | while no item matches, while async items load | Showing `Composer.CommandEmpty` and `Composer.CommandLoading`, which always render. |
| `data-highlighted` | `Composer.CommandItem` | on the active row | The highlight, which is also the focus indicator. It follows the keyboard, the pointer and the filter. |
| `data-disabled` | `Composer.CommandItem` | when the item's data sets `disabled` | The disabled row. |

## Ask-user

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `data-highlighted` | `AskUser.Option` | on the active option | The highlight, which is also the focus indicator. |
| `data-selected` | `AskUser.Option` | on a chosen option | The checked style, for a single or multiple choice. |

## Attachments

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `visible` → `data-visible` | `Attachments.Dropzone` | while `visible` is true | The drop overlay. Drive `visible` from the composer's `isDragging`. |
| `data-attachments-item` | `Attachments.Item` | always | One attachment in the strip. |
| `data-attachments-remove` | `Attachments.Remove` | always | Its remove button. |

## Steps

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `status` → `data-status` | `Steps.Item`, and `Steps.Icon` and `Steps.Label` inside it | always, the status string | The icon and label per status, such as a spinner while active. The string is the app's own. |
| `data-open`, `data-closed` | `Steps.Item`, `Steps.Trigger`, `Steps.Panel` | while open, while closed | A chevron. Name a group on the trigger to read it from inside. |
| `data-nested` | `Steps.Item` | inside another item | The indent and the rail of nested steps. |
| `--panel-height` | `Steps.Panel` | only while opening or closing | The height transition, with `data-starting-style` and `data-ending-style` pinning it to 0. |

## Reasoning

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `isStreaming` → `data-streaming` | `Reasoning.Root` | while the reasoning streams | A thinking style, such as a shimmer on the label. The root is also `aria-busy`. |
| `data-open`, `data-closed` | `Reasoning.Root`, `Reasoning.Trigger`, `Reasoning.Content` | while open, while closed | A chevron and the open style. |
| `--panel-height` | `Reasoning.Content` | only while opening or closing | The height transition, as with `Steps.Panel`. |

## Chip

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `data-chip` | `Chip.Root` | always | The token. Chips have no variants, so tint one with a class or an attribute of the app's own. |

## Shell

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `open` → `data-state` | every `Shell` part | always, `"expanded"` or `"collapsed"` | Collapsing the sidebar, the gutter and the grip. Each part carries it, so each can style itself. |
| `data-hotspot` | `Shell.Root`, `Shell.Sidebar`, `Shell.Viewport`, `Shell.Trigger`, `Shell.Grip`, `Shell.Hotspot` | while the collapsed sidebar floats out on hover | The floating card's elevation and offset. |
| `data-resizing` | `Shell.Root`, `Shell.Sidebar`, `Shell.Viewport`, `Shell.Grip` | during a resize drag | Turning width transitions off, so the sidebar tracks the pointer. |
| `data-side` | `Shell.Sidebar` | always, `"left"` or `"right"` | The edge the sidebar sits against. |
| `--shell-sidebar-width` | `Shell.Root` | after the first drag, clamped to the sidebar's `min-width` and `max-width` | The sidebar's width, the gutter's width, the collapsed offset and the grip's position. It sits on the root, so everything in the shell can read it. |

## Nav

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `active` → `data-active` | `Nav.Item`, `Nav.Trigger` | on the current page's row | The active row. The part also sets `aria-current="page"`. |
| `disabled` → `data-disabled` | `Nav.Item`, `Nav.Trigger`, `Nav.Toggle` | while disabled | The disabled row. |
| `data-open`, `data-closed` | `Nav.Group`, `Nav.Trigger`, `Nav.Toggle`, `Nav.List` | while the group is open, while closed | The caret and the collapse. |
| `data-depth`, `--nav-depth` | `Nav.List` and the row parts | always, the nesting level | One indent rule for every level. |
| `guide` → `data-indent`, `data-rail`, `data-branches` | `Nav.List` | per the guide chosen on `Nav.Root` | Drawing the indent, the rail and the elbows, all in the app's CSS. |
| `--nav-list-height` | `Nav.List` | only while opening or closing | The collapse transition, with `data-starting-style` and `data-ending-style` pinning it to 0. |

## Tabs

| Hook | On | Present | Use it for |
|------|----|---------|------------|
| `value` → `data-selected` | the open tab's `Tabs.Trigger`, `Tabs.Icon`, `Tabs.Action`, `Tabs.Close` | while that tab is open | The open tab. |
| `data-empty` | `Tabs.Root`, `Tabs.List`, `Tabs.Viewport` | while no tab is open | Hiding the viewport, or showing an empty state. |
| `data-activation-direction` | `Tabs.Root`, `Tabs.List`, `Tabs.Viewport` | after the selection moves | Sliding the panel the way the selection moved. |
| `data-disabled` | `Tabs.Root`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Close` | while disabled | The disabled style. |
| `data-side`, `data-align` | `Tabs.Positioner` | while a tab is open | The side the popup landed on, to animate from. |
| `--anchor-width`, `--anchor-available-height` | `Tabs.Positioner` | while a tab is open | Sizing `Tabs.Popup` against the open tab and the free space. |
| `data-open`, `data-closed`, `data-starting-style`, `data-ending-style` | `Tabs.Popup` | while open, and on the enter and exit frames | The popup's enter and exit transition. |
