# Composer

The chat composer — a form-shaped, headless-ish input surface that handles text, attachments, slash commands, mention chips, and questionnaires. It's a single component (`components/ai/composer.tsx`) exposed as a compound API via `Composer.X` parts.

Import from `@/components/ai/composer`.

## Minimal usage

The smallest working composer: an editor and a submit button, inside a container.

```tsx
import { Composer, type ComposerSubmitData } from "@/components/ai/composer";

const onSubmit = (data: ComposerSubmitData) => {
  if (data.kind !== "message") return;
  console.log(data.text, data.files, data.chips);
};

<Composer onSubmit={onSubmit}>
  <Composer.Container>
    <Composer.Textarea placeholder="Ask anything..." />
    <Composer.Actions className="flex justify-end">
      <Composer.Submit />
    </Composer.Actions>
  </Composer.Container>
</Composer>;
```

That's it. `<Composer>` is a `<form>`, so submit on **Enter** and soft-break on **Shift+Enter** are wired automatically. `Composer.Submit` auto-disables when the editor is empty and there are no attachments.

## Submit data

`onSubmit` receives a discriminated union:

```tsx
type ComposerSubmitData =
  | {
      kind: "message";
      text: string;                    // serialized editor text (chip markdown stripped)
      files: FileUIPart[];             // attachments, blob URLs converted to data URLs
      chips: ChipData[];               // inline mention chips
    }
  | {
      kind: "answers";
      answers: ComposerAnswerEntry[]; // produced by the questionnaire flow
    };

type ComposerAnswerEntry =
  | { question: string; option: string }                      // single-select, picked an option
  | { question: string; text: string }                        // single-select, typed free text
  | { question: string; options: string[]; text: string }     // multi-select (either field may be empty)
  | { question: string };                                     // skipped or unanswered
```

Each entry's shape encodes the invariant: single-select picks have `option` *or* `text`, never both. Multi-select always has both fields and may carry options + free text together. A skipped or unanswered question is `{ question }` with no payload. The branches are discriminated by which fields are present (no `kind` tag).

If the editor is empty but attachments exist, `text` is set to `"Sent with attachments"`. If both are empty, the form does not submit.

## Root props

`<Composer>` extends `<form>` and accepts:

| Prop | Type | Description |
|---|---|---|
| `onSubmit` | `(data: ComposerSubmitData) => void \| Promise<void>` | Submit handler. |
| `isSubmitting` | `boolean` | Disables `Composer.Submit` while truthy. Default `false`. |
| `commands` | `ComposerCommandsMap` | Prefix → command-list config. See [Commands & chips](#commands--chips). |
| `questions` | `AskUserQuestion[]` | When present, the composer enters questionnaire mode. See [Questionnaire](#questionnaire). |
| `defaultValue` | `ComposerSnapshot` | Initial uncontrolled editor content. |
| `value` | `ComposerSnapshot` | Controlled editor content. |
| `onValueChange` | `(snapshot) => void` | Fires on editor change. |

The composer is a module-singleton store with no provider, so any part of the subtree (or an external toolbar) can read live state via `useComposer()` — see [Imperative API & state](#imperative-api--state).

## Compound parts

Every part below is rendered inside the `<Composer>` subtree and reads context via `useComposer()`. Parts marked _add-on_ are optional — the minimal example above doesn't use them.

### Core layout

#### `Composer.Container`
Visual wrapper that focuses the editor on click. Standard `div` props.

#### `Composer.Textarea`
The contenteditable editor surface, over the flat segment engine. Handles paste (files + chip markdown), keyboard shortcuts (Enter/Shift+Enter/Backspace), command-list trigger detection, and form participation (`name`/`required`/`maxLength`).

| Prop | Type | Default | Notes |
|---|---|---|---|
| `value` | `string` | — | Controlled text. |
| `onValueChange` | `(text) => void` | — | Pair with `value`. |
| `disabled` | `boolean` | `false` | Read-only when true. |
| `autoFocus` | `boolean` | `false` | Focus on mount. |
| `placeholder` | `string` | — | Sets `aria-placeholder` and stamps `data-placeholder` on the editable while the editor is empty and not composing. Your CSS draws it (see below). |
| `children` | `ReactNode \| (state) => ReactNode` | — | Typically `<Composer.Placeholder>`. A function receives `{ disabled, filled, composing }`, so you can gate the content yourself. |

The package ships no CSS. Add this rule once, and set the colour at each call site (`::before` inherits the editor's font):

```css
[data-composer-editor][data-placeholder]::before {
  content: attr(aria-placeholder);
  content: attr(aria-placeholder) / ""; /* alt text hides it from assistive tech; older Safari and Firefox drop this line, so the plain one goes first */
  float: left;
  float: inline-start; /* fixes RTL; newer than Chrome 111, so left goes first */
  height: 0; /* with float, keeps the caret before the text */
  pointer-events: none;
}
```

#### `Composer.Placeholder`
Rich or animated placeholder content, for what a string can't express. It gates itself: rendered inside `Composer.Textarea`, it shows only while the editor is empty and not composing. Throws outside `Composer.Textarea`. `keepMounted` keeps it rendered and marks it `data-hidden` while it would be hidden, for exit animations.

```tsx
<Composer.Textarea>
  <Composer.Placeholder><CustomNode /></Composer.Placeholder>
</Composer.Textarea>
```

Rotating strings live in the styled layer, not the package: the app's `Composer.Placeholder` takes `placeholder={["Ask...", "Search..."]}` and crossfades every ~3s.

#### `Composer.Actions`
Action-row container. Standard `div` props.

#### `Composer.Submit`
Send button. Auto-disables when there is nothing to send or `isSubmitting` is `true`. Defaults to a send icon; pass `children` to override. Standard `IconButton` props.

### Add-on: attachments

#### `Composer.Attachments`
Renders attachment thumbnails, the hidden file input, and the drag-drop overlay.

| Prop | Default |
|---|---|
| `accept` | `"image/*,application/pdf,text/*"` |
| `maxFiles` | `5` |
| `maxFileSize` | `10 * 1024 * 1024` (10 MB) |
| `multiple` | `true` |
| `globalDrop` | `false` — when true, drops anywhere on the page are accepted. |

Validation errors surface in `useComposer().attachments.error` and render inline.

#### `Composer.AttachmentTrigger`
Button that opens the native file picker. Accepts `IconButton` props.

```tsx
<Composer.Container>
  <Composer.Attachments accept="image/*" maxFiles={3} />
  <Composer.Textarea placeholder="..." />
  <Composer.Actions className="flex justify-between">
    <Composer.AttachmentTrigger><PaperClipIcon /></Composer.AttachmentTrigger>
    <Composer.Submit />
  </Composer.Actions>
</Composer.Container>
```

### Add-on: panel

The panel is the area above the editor that shows command lists, active tool progress, or a questionnaire. It auto-switches to `"command-list"` whenever a command list is open, regardless of the `value` you pass.

#### `Composer.Panel` / `Composer.PanelItem`

```tsx
<Composer.Panel value={panelState}>
  <Composer.PanelItem value="command-list">
    <Composer.Commands />
  </Composer.PanelItem>
  <Composer.PanelItem value="active">
    <ActiveSteps />
  </Composer.PanelItem>
  <Composer.PanelItem value="ask-user">
    <Composer.AskUser />
  </Composer.PanelItem>
</Composer.Panel>
```

Each `PanelItem` is a `motion.div`; pass `initial`/`animate`/`exit` to customize transitions.

The hook `useActiveComposerState(messages, status)` from `@/hooks/use-active-composer-state` derives the right panel value from chat state.

### Add-on: commands & chips

Configure prefixes via the root `commands` prop:

```tsx
const commands: ComposerCommandsMap = {
  "@": {
    kind: "insert",              // selecting an item inserts an inline chip
    trigger: "word-boundary", // active when "@" follows whitespace or starts a word
    items: mentionItems,
  },
  "/": {
    kind: "execute",             // selecting an item runs onSelect; prefix is removed
    trigger: "doc-start",        // active only at document start
    items: slashCommands,
  },
};
```

#### `ComposerCommandsConfig`

| Field | Type | Notes |
|---|---|---|
| `kind` | `CommandItemKind` (`"insert" \| "execute"`) | `insert` → selecting inserts a `Chip` into the editor. `execute` → selecting runs the item's `onSelect`. |
| `trigger` | `"doc-start" \| "word-boundary"` | When the prefix activates. |
| `items` | `CommandItemData[]` or `(query, { signal }) => CommandItemData[] \| Promise<CommandItemData[]>` | Selectable rows. The function form runs on each query change for async/remote lookups; `signal` aborts superseded requests. |

#### `CommandItemData`

```tsx
type CommandItemData = {
  value: string;
  label: string;
  description?: string;
  icon?: ChipIconKey;             // see lib/ai/chip-icons
  variant?: ChipVariant;          // "primary" | "accent" | "warning"
  keywords?: string;              // extra search terms
  disabled?: boolean;             // inert row: aria-disabled, skipped by nav/selection
  onSelect?: (ctx: PrefixOnSelectContext) => void;
};

type PrefixOnSelectContext = {
  editor: ComposerEditorHandle;   // focus, blur, clear, insertText, insertChip
  attachments: AttachmentsApi;    // add, remove, openFileDialog
};
```

#### Rendering

Easiest: drop in the default renderer.

```tsx
<Composer.PanelItem value="command-list">
  <Composer.Commands />
</Composer.PanelItem>
```

Custom: render per-prefix lists.

```tsx
<Composer.CommandList prefix="@">
  {(item) => (
    <Composer.CommandItem value={item.value}>
      {item.icon && <Composer.CommandItemIcon>{CHIP_ICONS[item.icon]}</Composer.CommandItemIcon>}
      <Composer.CommandItemLabel>{item.label}</Composer.CommandItemLabel>
      {item.description && (
        <Composer.CommandItemDescription>{item.description}</Composer.CommandItemDescription>
      )}
    </Composer.CommandItem>
  )}
</Composer.CommandList>
```

Sub-parts: `Composer.CommandItem`, `Composer.CommandItemIcon`, `Composer.CommandItemLabel`, `Composer.CommandItemDescription`, `Composer.CommandGroup`, `Composer.CommandGroupLabel`, `Composer.CommandCollection` (renders an array with a render prop), `Composer.CommandEmpty`, `Composer.CommandDismiss`.

#### The composing token (Linear-style)

While a command list is open, the trigger and the text after it (e.g. `@John Smith`) is treated as a single **token**, highlighted as a badge. The popup always filters by the *whole* token regardless of where the caret sits inside it — so you can move into the middle and fix a typo and the list re-filters on the corrected token. A token opens on a trigger that follows whitespace; once open it's tracked by range, so **spaces become part of the filter** (multi-word queries work) and the token only ends when you select an item or dismiss it.

Keyboard inside an open command list:

- **↑/↓** — navigate the suggestions.
- **←/→** — move the caret *within* the token. The caret is **trapped**: it stops at the prefix and at the last character and can't leave while the popup is open.
- **Enter/Tab** — select the highlighted item. For `kind: "insert"` the whole token is replaced by the chip and a trailing space is added (skipped if one already follows) so you can keep typing. When nothing matches, the "No results" row is the single highlighted option and selecting it dismisses (see below).
- **Esc** — dismiss: closes the popup and leaves the typed text in place. The token stays **dismissed** — re-entering it won't reopen the popup; delete/retype the prefix to start a fresh attempt.

When the filter matches nothing, the empty row acts as the single highlighted option: **Enter/Tab** select it (→ dismiss) and `Composer.CommandDismiss` is its click target. Render it in the empty state so there's always a way out:

```tsx
<Composer.CommandEmpty>
  No results found
  <Composer.CommandDismiss />
</Composer.CommandEmpty>
```

The default `<Composer.Commands />` renderer already wires this up.

### Add-on: questionnaire

Pass `questions` to switch the composer into structured-question mode. The default renderer covers the flow:

```tsx
<Composer onSubmit={handleSubmit} questions={askUserQuestions}>
  <Composer.Panel value="ask-user">
    <Composer.PanelItem value="ask-user">
      <Composer.AskUser />
    </Composer.PanelItem>
  </Composer.Panel>
  <Composer.Container>
    <Composer.Textarea placeholder="Type an answer..." />
    <Composer.Actions className="flex justify-end gap-2">
      <Composer.AskUserHints />
      <Composer.AskUserDismiss />
      <Composer.AskUserContinue />
    </Composer.Actions>
  </Composer.Container>
</Composer>
```

Parts:
- `Composer.AskUser` — full default UI (question text, options, step counter, nav arrows).
- `Composer.AskUserHints` — keyboard-hint footer (↑↓ ↵ ← → Esc).
- `Composer.AskUserDismiss` — skip the current question (`Esc`).
- `Composer.AskUserContinue` — advance / submit (`Enter`). Auto-toggles label between "Continue" and "Submit".

Keyboard: **↑/↓** navigate options, **Enter** select/advance, **←/→** between questions, **Esc** dismiss, printable keys type free-text.

On completion, `onSubmit` fires with `{ kind: "answers", answers }` where `answers` is a `ComposerAnswerEntry[]` (one entry per question, in order). See [Submit data](#submit-data) for the entry shape.

## Imperative API & state

There is no root `ref` handle. Editor content is controlled declaratively via `value` / `defaultValue` / `onValueChange` (a `ComposerSnapshot`).

For live state, read from the store with `useComposer(selector)`. It's a module singleton — no provider — so anything in the subtree, a toolbar, or a sibling panel can subscribe. A selector re-renders only when that slice changes identity:

```tsx
const askUser = useComposer((composer) => composer.askUser);         // questionnaire machine + actions
const attachments = useComposer((composer) => composer.attachments); // add, remove, openFileDialog, items, error
const commands = useComposer((composer) => composer.commands);       // open command-list state (isOpen, trigger, query)
```

Called with no selector, `useComposer()` returns the full snapshot and re-renders on any change. The `commands` slice is the open command-list state — not the registered `ComposerCommandsMap` you passed to the root prop.

To imperatively insert a chip/text or open the file picker when a command is chosen, use its `onSelect` context — each item receives `{ editor, attachments }` (`PrefixOnSelectContext`):

```tsx
const items: CommandItemData[] = [
  {
    value: "alice",
    label: "Alice",
    onSelect: ({ editor }) => editor.insertChip({ prefix: "@", value: "alice", label: "Alice" }),
  },
];
```

## Reference: types

Exported from `@/components/ai/composer`:

`ComposerEditorHandle`, `ComposerSnapshot`, `ComposerSubmitData`, `ComposerMessageSubmit`, `ComposerAnswersSubmit`, `ComposerAnswerEntry`, `ComposerCommandsMap`, `ComposerCommandsConfig`, `ComposerCommandsItems`, `CommandItemData`, `CommandItemKind`, `PrefixOnSelectContext`, `TriggerRule`, `ChipData`, `AttachmentsApi`.

`ChipVariant` is re-used from `@/components/ai/chip`.

Defaults (from `components/ai/attachments`): `DEFAULT_ATTACHMENT_ACCEPT`, `DEFAULT_ATTACHMENT_MAX_FILES`, `DEFAULT_ATTACHMENT_MAX_FILE_SIZE`.
