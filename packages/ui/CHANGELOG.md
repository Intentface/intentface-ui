# @intentface/ui

## 0.8.0

### Minor Changes

- [Chip] Fix `parseChipSegments` dropping chips whose label has brackets, and keeping the backslashes `encodeChipMarkdown` adds before brackets, parentheses and backslashes.
- [Chip] [Breaking] Remove `CHIP_REF_PATTERN`. Read chip tokens with `parseChipSegments`.

## 0.7.0

### Minor Changes

- [Breaking] Renamed from `@intentface/chat`. Swap the dependency for `@intentface/ui` and replace `@intentface/chat/` with `@intentface/ui/` in imports; the rename changes nothing else.

## 0.6.0

### Minor Changes

- New `@intentface/chat/generative` entry, experimental: typed helpers that check a model's UI tool call against a catalog (`defineCatalog`, `tree.schema`, `tree.validate`), read it while it streams (`useTree`, `tree.read`), resolve its data bindings (`bindings.resolve`) and write it as Markdown (`markdown.tree`).

## 0.5.3

### Patch Changes

- [Composer] Fix `Composer.Root` losing its state under StrictMode or a hidden `<Activity>`, which drew the placeholder over a controlled `value`.
- [Composer] Fix an embedded composer scrolling the page around it on `clear()`, `setText()` and ask-user step changes.
- [Composer] Fix a trailing empty line in an overflowing composer not scrolling into view.
- [AskUser] Fix moving focus between options scrolling the page around an embedded question.
- [Composer] Add focus options to the controller's `focus()`, such as `{ preventScroll: true }`.
- Remove the `nanoid` dependency.
- [Attachments] Use the file's blob URL as the attachment id.
- [Composer] Fix a hydration mismatch when `Composer.Popover` or an overlay `Composer.Panel` is server-rendered.
- [AskUser] Fix `AskUser.Options` and `AskUser.Option` writing to refs during render.
- [Composer] Fix `Composer.Command` writing to a ref during render.
- [AskUser] Improve re-renders: `AskUser.Root`, `AskUser.Options` and `AskUser.Option` memoize their context values.
- [Reasoning] [Steps] Improve re-renders: their collapsible context is memoized.
- [Tabs] Improve re-renders: the anchored surface memoizes its context value.

## 0.5.2

### Patch Changes

- Add JSDoc to every part of `Attachments`, `Chip`, `Message`, `Reasoning` and `Steps`, so editors show the same reference as the docs.
- Refresh the README to match the rewritten docs.

## 0.5.1

### Patch Changes

- [Thread] Fix losing the bottom while the container is resized.

## 0.5.0

### Minor Changes

- [Tabs] Fix `dismissOnEscape` closing the panel on an Escape another handler already prevented.
- [Composer] Fix an Escape in one composer stopping generation in another.
- [Composer] [Breaking] Escape stops generation only from inside `Composer.Root`. To stop on any Escape, handle it on your chat container, such as `Thread.Root`.

## 0.4.0

### Minor Changes

- [Nav] New `Nav.Toggle`: a caret inside `Nav.Trigger`, so a branch row can also be a page.
- [Nav] Add `aria-current="page"` to active `Nav.Item` and `Nav.Trigger` rows.
- [Nav] Fix a disabled `Nav.Trigger` rendered as a link still navigating.
- [Nav] Fix Space not following a link row.
- [Tabs] New `openOnHover`, `openDelay` and `closeDelay` on `Tabs.Trigger`.
- [Tabs] Add `eventDetails` to `onValueChange` and `onItemsChange`, with `reason` and `cancel()`, so a close can be cancelled.
- [Tabs] Fix Escape from a floating `Tabs.Popup` dropping focus instead of returning it to its tab.
- [Breaking] `event.preventBaseUIHandler()` is now `event.preventPrimitiveHandler()`, and `event.baseUIHandlerPrevented` is now `event.primitiveHandlerPrevented`.

## 0.3.0

### Minor Changes

- [Shell] New primitive: a collapsible, resizable sidebar with hover-peek.
- [Nav] New primitive: a nav tree with roving focus, typeahead and a guide ladder.
- [Tabs] New primitive: closable tabs whose panel renders in the layout or anchored to its tab.
- [Composer] Fix a closing `Composer.Panel` staying mounted when there was nothing to animate.
- Fix anchored surfaces animating in from before they were placed, and add `--anchor-available-width`.

## 0.2.1

### Patch Changes

- [Thread] Fix visibly scrolling to the bottom while the container animates open.
- [Thread] Fix losing a few pixels of scroll position when the composer changes height.

## 0.2.0

### Minor Changes

- [Steps] [Reasoning] Fix the panel clipping content that grows after it opens.
- [Steps] [Reasoning] [Breaking] The panel height variable `--collapsible-panel-height` is now `--panel-height`.
- [Thread] [Breaking] `Thread.Root` no longer takes `dockSelector`. Put the composer in `Thread.Composer` and it is measured automatically.

### Patch Changes

- [Composer] Fix `Composer.Textarea` gaining phantom newlines during rapid editing.
- Fix the npm registry listing `exports` paths the package doesn't ship. Installs were unaffected.
- Point `homepage` and the README links at https://ui.intentface.com.

## 0.1.2

### Patch Changes

- Fix the package failing to load during server-side rendering.

## 0.1.1

### Patch Changes

- Fix a regex in `parseChipSegments` that could hang the browser on long messages.
- [Composer] Fix a regex that could freeze the editor on large pasted text.

## 0.1.0

### Minor Changes

- Initial release: headless chat primitives for React. `Composer`, `Thread`, `Message`, `Steps`, `Reasoning`, `Chip`, `Attachments` and `AskUser`, plus the message types and utilities.
