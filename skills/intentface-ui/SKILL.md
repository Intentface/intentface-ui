---
name: intentface-ui
description: Rules for building chat interfaces and app shells with @intentface/ui, a headless React primitive library whose parts ship no styles. Covers the entry points, styling hooks and conventions, the chat primitives and AI SDK messages, the sidebar, nav tree and tabs, accessibility, upgrades, and the experimental generative entry. Use when a project depends on @intentface/ui or @intentface/chat, or when building, styling or upgrading a chat, composer, message list, sidebar, nav tree or tabs with either package.
---

# @intentface/ui

The docs hold the full API. Start at https://ui.intentface.com/llms.txt, and fetch any page as Markdown by adding `.md` to its URL. These rules cover what the docs leave easy to get wrong.

In an existing app, the app's design system and conventions decide the look.

## The package

The package owns behavior: state, keyboard handling, focus, ARIA wiring and measurement. The app owns every class, every color and every word of copy.

| Rule | Summary |
|------|---------|
| Headless | The parts render semantic DOM with `data-*` attributes and no classes. There is no styled package, stylesheet or theme. Style the parts, and use the app's own components through `render`. Never replace the parts with another library's chat components. |
| Explicit roots | Render `<Composer.Root>`, never `<Composer>`. Import each entry point, such as `@intentface/ui/composer`. There is no bare `@intentface/ui` import. |
| Client parts | A server component can render the parts. Event handlers, render functions and hooks need a `"use client"` module. `@intentface/ui/types`, `@intentface/ui/message-utils` and `@intentface/ui/chip-markdown` import anywhere. |
| No transport | The package never makes a request. The app owns the client, the routes, the message list and persistence. A Vercel AI SDK `UIMessage` fits the message types with no adapter. |

## Entry points

Each entry point is its own import and has its own docs page.

| Entry point | What it covers |
|------|---------|
| `@intentface/ui/thread` | The scroll container: following the stream, landing new turns and keeping messages clear of the composer. https://ui.intentface.com/primitives/thread.md |
| `@intentface/ui/message` | One message: its author, its position, and text with chips. https://ui.intentface.com/primitives/message.md |
| `@intentface/ui/composer` | The input: editor, commands, chips, attachments, submit and the ask-user flow. https://ui.intentface.com/primitives/composer.md |
| `@intentface/ui/ask-user` | The parts for the questions a model asks, used inside a composer. The composer page covers them. |
| `@intentface/ui/steps` | A collapsible timeline of a run's tool calls and steps. https://ui.intentface.com/primitives/steps.md |
| `@intentface/ui/reasoning` | A disclosure for a model's thinking that tracks streaming and duration. https://ui.intentface.com/primitives/reasoning.md |
| `@intentface/ui/chip` | Inline tokens for mentions in the composer and chips in messages. https://ui.intentface.com/primitives/chip.md |
| `@intentface/ui/attachments` | The attachment tray: items, remove buttons, a drop zone and a file picker. https://ui.intentface.com/primitives/attachments.md |
| `@intentface/ui/shell` | A collapsible, resizable sidebar beside the content. https://ui.intentface.com/primitives/shell.md |
| `@intentface/ui/nav` | A nav tree with roving focus, typeahead and collapsible groups. https://ui.intentface.com/primitives/nav.md |
| `@intentface/ui/tabs` | Closable tabs whose panel renders in the layout or anchored to its tab. https://ui.intentface.com/primitives/tabs.md |
| `@intentface/ui/types` | The message types and part type guards, such as `isToolPart`. No page, so read the exported types and their JSDoc. |
| `@intentface/ui/message-utils` | Pure helpers over messages: `groupTurns`, `getSegmentedParts`, `getTextInfo` and `getFileParts`. No page, so read the exported types and their JSDoc. |
| `@intentface/ui/chip-markdown` | The chip wire format in message text: `encodeChipMarkdown` and `parseChipSegments`. No page, so read the exported types and their JSDoc. |
| `@intentface/ui/generative` | Experimental. Checks and reads a model's UI tool call against a catalog of the app's components. https://ui.intentface.com/generative/catalog.md |

## Docs and versions

This skill names what is easy to get wrong. The docs pages hold everything else.

| Rule | Summary |
|------|---------|
| Version first | Compare the installed `@intentface/ui` or `@intentface/chat` with `npm view @intentface/ui version`. Upgrade first when the app is behind, because the docs and this skill describe the latest release. |
| Docs first | Before writing markup, read the `.md` page of every primitive you use. Its Props and Attributes tables are the full list, and its demo source is inlined. |
| Never guess names | Use only the props, attributes and CSS variables the page lists. A name that isn't there doesn't exist. |
| Upgrade by the changelog | Read the release notes between the installed version and the latest at https://ui.intentface.com/changelog.md. Apply the migration in every `[Breaking]` line, oldest release first. Before 1.0, a minor release can break. |
| The old name | `@intentface/chat` is the package's old name. Version 0.7.0 renamed it and changed nothing else, so swap the dependency and replace `@intentface/chat/` with `@intentface/ui/` in imports. |

## Before building

Most developers don't know everything the package can do. Offer the options the request left open before building, so the developer picks them instead of discovering them later.

| Rule | Summary |
|------|---------|
| Discover first | Read the repo before offering anything: the design system, the styling setup, the existing route and client, and the installed version. Never ask what the code answers. |
| Offer the options once | List the options below that the request left open, each with its default, in one message, and build with the developer's picks. |
| Never block a run that can't answer | In a headless run, such as `claude -p` or `codex exec`, build what the request names with the defaults. End the report with the options you didn't use, so the developer still learns they exist. |

| Option | Choices | Default |
|------|------|------|
| Auto-scroll | `<Thread.Root autoScroll>`: `"follow"` follows the stream and lands each new turn at the top, `"jump"` lands it without following, `"bottom"` keeps the newest message at the bottom, `"off"` does neither | `"follow"` |
| Send key | `<Composer.Textarea submitOn>`: `"enter"` or `"shift-enter"` | `"enter"` |
| Attachments | Off, or on with `<Composer.Attachments accept maxFiles maxFileSize globalDrop>` for the accepted types, the limits, and drops anywhere on the page | Off. When on, every type, no limits, drops on the composer only |
| Mentions and commands | `<Composer.Root commands>`: `@` mentions that insert chips, `/` commands that run an action, or a prefix of the app's own, with items listed or loaded as the user types | None |
| Command list placement | `Composer.Popover` floating at the typed token, or `Composer.Panel` above the input, anchored or in flow with `<Composer.Panel anchor={false}>` | — |
| Questions from the model | `<Composer.Root questions>`, fed by a client-side tool and answered in the composer | Off |
| Reasoning and tool calls | `Reasoning` for the model's thinking, `Steps` for its tool calls | Shown whenever the backend streams them |
| Layout | A full page, a side panel beside `Shell`, or a dock in `Tabs` | A full page |
| App shell | A `Shell` sidebar, a `Nav` tree with `<Nav.Root guide>`, and `Tabs` | None |
| Persistence | Whether past chats survive a reload. The app stores them | None |
| Generative UI | `@intentface/ui/generative`, experimental | Off |

## Props, attributes and CSS variables

Every part reports its state the same way. Props carry what the app knows into the part. Data attributes carry state out to CSS. CSS variables carry measured sizes. Once you know which way a state travels, you know where to style it. `references/hooks.md` lists the ones that matter for each primitive.

| Rule | Summary |
|------|---------|
| Two sources of state | A state comes from the app or from the part. The app passes what only it knows as props, such as a message's `role`, `isError`, `isStreaming`, a step's `status` or a nav row's `active`. The part tracks the rest itself, such as highlight, open, scroll position, drag and resize, and needs no prop for it. Never mirror the part's own state in React state. |
| Props come back as attributes | A state prop reappears on the element as an attribute: `<Message.Root isError>` sets `data-error`, and `<Composer.Submit isGenerating>` sets `data-generating`. Style from the attribute, so the markup needs no condition and the style follows the state wherever it changes. |
| Part attributes name the element | Every part's element carries an attribute naming it, such as `data-composer-editor` or `data-thread-content`, for as long as it renders. Use them to reach elements the app doesn't render itself, such as the editor and the thread's content column, and to target parts from global CSS. |
| State attributes come and go | A boolean state is present or absent, as with `data-highlighted`. Its absence is a state too: `Thread.Root` without `data-at-bottom` means the user scrolled away. A string state carries its value, as with `data-role`, `data-status` and `data-state`. |
| Where an attribute reaches | An attribute styles its own element, its descendants through a parent selector, and its ancestors through `:has()`. Many parts repeat their primitive's main state, such as `data-state` on every `Shell` part and `data-status` on `Steps.Icon` and `Steps.Label`, so a child can often style itself directly. |
| Open, closed and the frames between | A disclosure carries `data-open` or `data-closed`. On its first frame open it also carries `data-starting-style`, and while closing `data-ending-style`. Transition from and to those two, and the part waits for the transition to end before it unmounts. Content that must stay in the DOM while closed needs `keepMounted`. |
| Positioned surfaces | A positioned panel, popover or tab popup carries `data-side` and `data-align`, the side it actually landed on after flipping. Animate from that side. |
| Variables flow down | A CSS variable is a measured size in px, written on one element. It reaches that element and its descendants, never its ancestors, its siblings or anything rendered in a portal. Each variable's row in `references/hooks.md` says which element holds it. |
| Variables have a lifetime | The composer's sizes, such as `--composer-height`, are absent until first measured, `--shell-sidebar-width` until the first drag, and `--panel-height` and `--nav-list-height` exist only while a transition runs. Read each one with a fallback. |
| Only listed variables are measured | Some demos define variables of their own, such as a height for the thread's top overlay. Those are the demo's. Only the variables in a page's Attributes table come from the package. |
| No feedback loops | Never size an element's own contents from a variable measured on that element. Sizing `Composer.Root`'s contents from `--composer-height` grows the root, which raises the variable again. |
| `className` and `style` functions | Both accept a function of the part's state, for a value computed in JavaScript. Prefer the attribute when a selector can express it, because it needs no render. |
| `render` | Swap the element, or render the part as one of the app's components, as in `render={<Button />}`. The component must spread the props it receives onto its DOM element and accept `ref` as a prop. The part keeps its behavior and attributes. |

## Styling conventions

Where the styles live is the app's decision. These rules keep them in one place and keep them reading the package's state.

| Rule | Summary |
|------|---------|
| App conventions win | Use the app's tokens, class-merging helper, variant tool and file layout. Use semantic tokens such as `bg-muted`, never raw palette classes or hex values. In an app with no design system, the docs demos set the look. When copying a demo into an app with tokens, swap its palette classes for the tokens. |
| Wrap each part once | In an app with a components layer, such as `components/ui`, wrap each part it uses once, with its styles and variants. Feature code uses the wrapper and never imports `@intentface/ui` directly. In an app without such a layer, style the parts where they're used. |
| String className on wrappers | A wrapper merges classes with the app's helper, such as `cn()`, and takes `className` as a string only. The helper drops a function, so a wrapper that accepts the part's function form loses those classes without an error. |
| State from attributes | Never copy a state the package already exposes into React state or a class of your own. The attribute follows the keyboard, the pointer and the filter, and a copy follows only the events you wired. |
| Variants on attributes | A variant that depends on a part's state reads the attribute, not a prop the wrapper threads through. |
| Know what a part sets | `references/styling.md` lists what each part renders, what the package already sets inline, and what it leaves to the app. Never repeat a position, overflow or padding the package sets, and always set what it leaves, such as heights and `z-index`. |

## Thread

The thread owns scrolling. It follows the stream while the user is at the bottom, lands each new turn at the top and measures the composer. The app owns the layout and reads the measurements.

| Rule | Summary |
|------|---------|
| Build order | `Thread.Root` holds `Thread.Viewport`, which holds `Thread.Content` directly, and the turns are the direct children of `Thread.Content`. `Thread.Viewport` carries the top and bottom padding. `Thread.Composer` comes after the viewport and holds `Composer.Root`. |
| Turns in Content | Never render turns straight into `Thread.Viewport`, even where a docs snippet does. The thread watches only the direct children of `Thread.Content`, so auto-follow and landing stop working. |
| One turn per exchange | Group messages with `groupTurns`, and wrap each question and its replies in one `Message.Turn`. Otherwise the newest reply lands at the top and pushes its question out of view. |
| Definite height | `Thread.Root` needs a height from the app's layout. |
| Read the insets | Pad `Thread.Viewport`'s bottom with `--thread-overlay-bottom-height`, so messages never hide behind the composer. Give the last turn a minimum height of `--thread-turn-min-height`, so a new turn lands at the top. |
| Gap above a landed turn | A landed turn must never touch the thread's top edge or slide under anything above it. Size the gap from the app's layout: a header or toolbar that floats over the thread needs its full height plus breathing room, and a header in flow above `Thread.Root` needs breathing room only. Define the gap once as an app variable on `Thread.Root`. The height of `<Thread.Overlay direction="top">` reads it, and that is where a landed turn stops, so always render one: without it the gap is 0. `Thread.Viewport`'s top padding reads it too, which places the first turn. Never put that padding inside `Thread.Content`. The landing gap recipe in `references/patterns.md` shows a floating header. |
| Keep off the scrollbar | Anything the app positions over `Thread.Viewport`, such as the fades, a floating header or the composer dock, must not cover or catch its scrollbar. Limit each one to the content column's width, centered like the column, and give the viewport `scrollbar-gutter: stable` so the scrollbar never shifts the column. Make the dock click-through with `pointer-events: none`, and turn the pointer back on for the composer itself. |
| Scroll button | There is no scroll-to-bottom part. Build one from `useThread()`, which returns `isAtBottom` and `scrollToBottom`. |
| Portals | The command popover, the composer panel and the attachment preview render into `document.body`. Give the app root `isolation: isolate`, and put theme classes and tokens on `html` or `body`. |

## Message

`Message.Root` reports a message's author and position. The bubble, the markdown, the avatar and the actions are the app's.

| Rule | Summary |
|------|---------|
| Role is the author | `role` is not an ARIA role. It reaches the DOM only as `data-role`, so style each role from `Message.Root` and a Tailwind `group` for the parts inside. |
| Text is one string | `Message.Text` takes one string, renders a `span` and turns chip tokens back into chips. Pass `renderText` to render markdown runs, with `render={<div />}` when they hold blocks. |
| User text through Message.Text | The composer writes chips into the text as `[Label](chip:prefix:value)`, which a plain markdown renderer shows as links. |
| Memoize the row | Memoize the app's row component and pass it the original message object. Otherwise every message re-renders on every stream chunk. |

## Message parts

An AI SDK message holds a list of parts. Split them into segments in order, and render each kind with its own primitive.

| Rule | Summary |
|------|---------|
| Segment the parts | `getSegmentedParts(message.parts)` groups neighboring parts of one kind into `text`, `reasoning`, `tool` and `file` segments, in order. It skips kinds it doesn't render, such as sources. |
| Text segments | Render the user's text with `Message.Text`. Render the assistant's text with the app's markdown renderer, through `renderText` when it can hold chips. |
| Reasoning segments | A reasoning segment becomes a `Reasoning.Root`. Its parts' `state` says whether it is still streaming. |
| Tool segments | A tool segment becomes `Steps` items, one per tool part, keyed by `toolCallId`. Map each part's `state` to a status of the app's own, such as `active` while the input streams and `complete` once the output is available. The status is an opaque string that reaches the DOM as `data-status`. |
| File segments | `getFileParts(segments)` returns the file parts, which render with the app's own preview. |

## Chat lifecycle

A chat moves through four states: sent and waiting for the first token, streaming, done, and failed. Each one shows somewhere in the parts.

| Rule | Summary |
|------|---------|
| Submitted is generating | `useChat` reports `"submitted"` from the send until the first token, then `"streaming"`. Treat both as generating, for `isGenerating` and for any pending indicator. With only `"streaming"`, the button shows send and nothing shows a reply is coming. |
| Rows inside the last turn | Render the pending indicator and the error row inside the last `Message.Turn`. A row added as its own child of `Thread.Content` becomes the newest turn, lands at the top and pushes the question out of view. |
| Failed message | On `"error"`, pass `isError` to the last message, so `data-error` styles it, and render an error row with a retry that calls `regenerate()`. Never show the raw error text to the user. |
| Announce the state | Keep one `role="status"` region mounted outside the transcript, and set its text while generating. Give the error row `role="alert"`. A region mounted together with its text is often not announced. |
| Newest message only | Pass `isError` only to the newest message, as in `isError={status === "error" && message.id === lastId}`. Passing the chat's error to every row marks old messages failed and re-renders every memoized row when the status changes. |

## Composer

The composer owns the editor, the commands, the chips and the submit button. What a submit sends, and where, is the app's.

| Rule | Summary |
|------|---------|
| Required parts | `Composer.Root`, `Composer.Container` and `Composer.Textarea`. The textarea holds `Composer.Placeholder`, and `Composer.Actions` holds `Composer.Submit`. |
| Submit data | `onSubmit` receives a `ComposerSubmitData`. Check `kind`: `"message"` carries the trimmed `text` and the `files`, and `"answers"` carries the ask-user answers. The editor is already cleared when `onSubmit` runs. |
| Editor styling | The editable element belongs to the editor engine. Style its text color and focus from `Composer.Textarea` with descendant selectors on `data-composer-editor`. Never override its `white-space`. |
| Box and type on the textarea | Put the padding, minimum and maximum height, scrolling, and the font family, size and line height on `Composer.Textarea`. The editor and the placeholder both inherit them, so their text lines up. Padding or type on the editor alone moves the caret but not the placeholder. |
| The placeholder is positioned | While the editor is empty, `Composer.Textarea` lays an overlay, `data-composer-placeholder`, over the editor at `inset: 0`, and `Composer.Placeholder` renders inside it. Never position or pad `Composer.Placeholder`, and give it a color only. An `absolute` with `top` and `left` counts the textarea's padding twice. |
| Send-to-stop | `<Composer.Submit isGenerating onStop>` turns the button into stop while generating. Count both of `useChat`'s `"submitted"` and `"streaming"` as generating. `<Composer.Root isSubmitting>` only blocks sending. |
| Never disable Submit for streaming | `disabled` on `Composer.Submit` replaces its automatic disabled state, so the button turns on with an empty field. |
| Panel opens on children | `Composer.Panel` and `Composer.Popover` open whenever they have children. Gate inside, as in `{(composer) => composer.askUser.active && <Question />}`. A child that returns `null` still opens an empty panel. |
| Panel placement | `Composer.Panel` renders into a portal anchored to the container by default, with no width and no `z-index`. Size it with `--anchor-width`, or render it in flow with `<Composer.Panel anchor={false}>`. |
| Popover for commands | `Composer.Popover` anchors to the active command badge, so use it only for command lists. It stays mounted, so hide it with `data-closed:hidden`. |
| Empty and loading rows | `Composer.CommandEmpty` and `Composer.CommandLoading` always render. Show them from the `data-empty` and `data-loading` attributes on `Composer.Command`. |

## Attachments

The composer collects files and hands them to `onSubmit`. Storing and sending them is the app's.

| Rule | Summary |
|------|---------|
| Convert before sending | `data.files` holds blob URLs. The composer revokes them once `onSubmit` settles, and a server can't read them anyway. Make `onSubmit` async, and turn each file into a data URL or an upload before sending. |
| Render a strip | The composer accepts dropped and pasted files with no strip mounted. Render a strip whenever the composer can receive files. |
| Policy, not a strip | `Composer.Attachments` sets the accept rules and renders no strip of its own. Read the items from `useComposer((composer) => composer.attachments)` and render them with the `Attachments` parts. |
| Composer.AttachmentTrigger | Inside a composer, open the file picker with `Composer.AttachmentTrigger`. `Attachments.Trigger` is a bare button with no file input. |

## Ask-user flow

The model asks the user questions through the composer, which turns the user's input into answers.

| Rule | Summary |
|------|---------|
| The demos are the spec | The composer page describes the flow in prose, and its ask-user demos hold the full wiring. Copy their source from the `.md` page. |
| Stable questions | Pass `<Composer.Root questions>` a stable array. A new array on every stream chunk restarts the flow at the first question. |
| Clear after answers | Clear `questions` when `onSubmit` receives `kind: "answers"`. While `questions` is set, every submit answers a question, and no message can be sent. |
| Wire the parts | `AskUser` parts are stateless. Pass `askUser.optionsRef` as the `ref` of `AskUser.Options`, give each `AskUser.Option` its label as its `value`, and wire the previous, next and dismiss buttons to the composer's `askUser` actions. |
| Questions from a tool call | The model asks through a tool with no `execute`, whose input is the questions. While its part waits in `"input-available"`, pass its questions to the composer, kept as one array per `toolCallId`. |
| Answers as the tool's output | On `kind: "answers"`, call `addToolOutput` with the tool call's id. The part leaves `"input-available"`, which clears `questions`. Set `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` on `useChat`, so the answers go back to the model without another send. |

## Steps, Reasoning and chips

These parts are disclosures and inline tokens with no copy of their own.

| Rule | Summary |
|------|---------|
| Height animation | `Steps.Panel` and `Reasoning.Content` animate only through the app's CSS on `--panel-height`, which exists only while a transition runs. |
| Closed content unmounts | Both mount closed content only with `keepMounted`. |
| Name the trigger group | A chevron that turns with `Steps.Trigger` needs a named `group` class on the trigger. The trigger adds none. |
| Reasoning is bare | `Reasoning` is a disclosure with no copy, shimmer or markdown. Build the label from `useReasoning()`. It doesn't open while streaming or close after. |
| Keep the duration | The duration is measured only while the part is mounted. Save it with the message to show it after a reload. |
| Chip tints | `Chip.Root` has no tints and no variant. Tint a chip with a class, or with an attribute of the app's own. |
| Chip preview | `Chip.Preview` works only as a direct child of `<Chip.Root renderWithPreview>`. The popup, opening it on focus and closing it on Escape are the app's. |

## App shell

`Shell`, `Nav` and `Tabs` work on their own or around a chat. They position nothing, so the layout is the app's.

| Rule | Summary |
|------|---------|
| Inside the root | Every `Shell`, `Nav` and `Tabs` part throws outside its root. |
| Controlled state reports | With a controlled `open`, `expanded`, `value` or `items`, the change callback hands over the new value, and nothing changes until the app passes it back. |
| One store per mount | Create an external store with `useState(() => Shell.createStore())`, and the same for `Nav.createStore` and `Tabs.createStore`. A store at module scope is shared by every mount and every server request. |
| Shell positions nothing | Take `Shell.Sidebar` out of flow, fixed or absolute inside a relative root. Give the content side a gutter element whose width reads `--shell-sidebar-width` and drops to 0 while `data-state="collapsed"`. |
| Sidebar width in CSS | The width and the drag range are the sidebar's `width`, `min-width` and `max-width`. There is no width prop. `--shell-sidebar-width` is unset until the first drag, so give it a default on the root. |
| Opaque sidebar | Content slides under the sidebar, so its background is opaque in every state. Turn transitions off while `data-resizing` is present. |
| Nav is a div | Render `<Nav.Root render={<nav />} aria-label="Main">`. |
| Nav rows as links | There is no router integration. Compute `active` from the app's router and render rows as its links, through `render`. A render function must spread the props it receives, or keyboard navigation breaks. |
| Nav guides are CSS | The guides only emit attributes. The indent, the rail and the elbows are the app's CSS, and `--nav-depth` gives one indent rule for every level. Never put `overflow: hidden` on a row, because the rail draws outside it. |
| Tabs is a toolbar | `Tabs` is a toolbar of disclosures, not a tablist. `value` may be `null`, which means no tab is open. Without `selectOnClose`, closing the open tab leaves nothing open. |
| Only the open tab renders | Switching tabs unmounts the rest. Keep live state, such as a streaming chat, in a store outside the tab. |
| Tabs popup placement | Never set `position`, `left` or `top` on `Tabs.Positioner`. Animate `Tabs.Popup`, set its `z-index`, and size it from `--anchor-width` and `--anchor-available-height`. |

## Motion

A polished chat animates its state changes. The parts provide the hooks and time their own mount and unmount, and the app provides every duration and easing. `references/motion.md` lists what can move in each primitive and the hook that drives it.

| Rule | Summary |
|------|---------|
| Animate the state changes | Animate panels and popovers opening and closing, disclosures expanding, the send and stop swap, the drop affordance, and new messages arriving. A chat with only hover fades feels unfinished. |
| Timing from the design system | Take durations and easing from the app's motion tokens, such as a Motion section in its `DESIGN.md`. Without tokens, match the app's existing motion, then the docs demos. Never invent values. |
| Frames drive enter and exit | Transition from `data-starting-style` and to `data-ending-style`, on the part's own element. The part waits for that transition before it unmounts. `Composer.Popover` has no frames and never unmounts, so animate it between `data-open` and `data-closed`. |
| Reduced motion | Gate movement and scale behind `prefers-reduced-motion`, and keep opacity fades or nothing. |
| New messages are the app's | The package doesn't animate message rows. Give new rows an entrance of the app's own, and skip the rows present at mount, so a reload doesn't replay the transcript. |

## Keyboard

The parts already handle their keys. The app adds shortcuts around them, never on top of them. Each page's Keyboard table has the full list.

| Rule | Summary |
|------|---------|
| The composer owns its keys | Enter sends and Shift+Enter breaks the line, or the reverse with `<Composer.Textarea submitOn="shift-enter">`. While a command list is open, the arrows move the highlight, Enter or Tab picks, and Escape closes it. While ask-user is active, the arrows move between options and questions, Enter picks, and Escape dismisses the step. |
| No handlers on top | Never add an `onKeyDown` for Enter, Tab, Escape or the arrows to the composer. It sends twice or breaks the command list. To claim a key the composer uses, call `event.preventPrimitiveHandler()` in `Composer.Root`'s `onKeyDown`. |
| Escape stops inside the composer | While generating, and only with `onStop`, Escape inside the composer stops the reply. To stop on Escape anywhere in the chat, handle it on `Thread.Root`. |
| Skip handled keys | The composer calls `preventDefault()` on the Escape it uses, and `Tabs` ignores an Escape that is already prevented. An app handler on a container or `window` does both: it skips events whose `defaultPrevented` is set, and prevents the ones it handles. |
| Upward keys release follow | ArrowUp, PageUp and Home in the thread release auto-follow. Scrolling down never does. |
| Nav and Tabs keys | `Nav` moves between rows with the arrows, opens and closes groups with left and right, activates with Enter or Space, and seeks by typed letters. `Tabs` moves along the strip with the arrows, opens with Enter or Space, closes a tab with Delete or Backspace inside a `Tabs.List`, and closes the open panel with Escape. |
| Shell shortcut | The grip resizes with the arrow keys. No shortcut to toggle the sidebar ships. Bind one, such as Cmd+B, and call the store's `toggle`. |

## Accessibility

The parts own roles, keyboard handling and focus movement. Everything visual is the app's, and some of it is required. https://ui.intentface.com/handbook/accessibility.md has the full list.

| Rule | Summary |
|------|---------|
| Visible focus | Focus moves correctly, and nothing paints it. Style `:focus-visible` on every interactive part. In command lists and ask-user options, the highlight is the focus indicator, so give it the contrast of a focus ring. |
| Contrast | No color ships, so the app's colors carry all of the contrast. |
| Speaker identity | `data-role` reaches no screen reader. Add a visually hidden speaker label or an `aria-label` to each message. |
| Status copy | Nothing announces "generating" beyond the submit button's label, and validation emits codes, not messages. Add a `role="status"` region for in-flight state and `role="alert"` for failures, with copy of the app's own. |
| Names on bare controls | Parts with no text of their own, such as `Shell.Trigger`, `Shell.Grip` and `Tabs.Close`, need an `aria-label`. A remove button in a list takes the distinguishing part as a prop, as in `<Attachments.Remove filename>`. |
| Seams keep obligations | A surface the app builds through `render`, such as a chip's hover preview, keeps its pattern's obligations: it opens on focus as well as hover, and Escape closes it. |

## Generative UI (experimental)

The model writes UI as data, and the helpers check it and read it while it streams. Nothing here renders.

| Rule | Summary |
|------|---------|
| Only when asked | `@intentface/ui/generative` may change or be removed before 1.0. Use it only when the user asks for UI the model generates, and pin the exact version. |
| Data, not markup | The model's UI tool call names the app's catalog components as data. There are no parts, attributes or CSS variables. The app draws every node. |
| Docs first | Read https://ui.intentface.com/generative/catalog.md, which has the full tool, the client and every demo. |
| Schema as is | Pass `tree.schema(catalog)` as the tool's `inputSchema` itself. Spreading it into another object drops its Standard Schema. |
| Validators | Every component's `props` schema must convert to JSON Schema: zod 4.2+, ArkType 2.1.28+, or Valibot through `toStandardJsonSchema`. |
| Tools in history | Pass the same tools to `convertToModelMessages(messages, { tools })`. Without them, every later turn sends whole results back to the model. |

## Verify

A chat that builds can still hide messages behind the composer or lose the keyboard. Check the running app.

| Rule | Summary |
|------|---------|
| Type-check and build | Run the app's type-check and build. A part or prop that fails the type-check doesn't exist, so fix the name instead of casting. |
| Send and stream | Send a message and watch the reply stream. The thread follows while you're at the bottom and stops following when you scroll up. Stop works from the button, and from Escape inside the composer. |
| Grow and resize | Type several lines into the composer and resize the window. No message hides behind the composer, and a new turn lands at the top. |
| Landing gap | Send a second message once the first reply is long. The new turn lands with its gap below the header or the thread's top edge, never touching it or hidden under it. |
| Keyboard pass | Tab through the chat. Open a command list with its prefix, move with the arrow keys and pick with Enter. Every focused control shows its focus. |
| Styles read the package | Every state the styles show comes from a part's attribute, and every measured size from the package's CSS variables. |

Hooks: `references/hooks.md` lists the props, attributes and CSS variables of each primitive, with where each one sits, when it is present and what it is for.

Structure: `references/styling.md` lists what each part renders, what the package sets inline and what the app sets.

Motion: `references/motion.md` lists what can animate in each primitive, the hook that drives it, and how the part times its unmount.

Examples: `references/patterns.md` has the chat skeleton, the landing gap under a floating header, a message row rendering AI SDK parts, the chat lifecycle, commands and chips, ask-user from a tool call, the attachment submit, the collapsible height animation, the shell gutter, and nav rows as router links. The examples carry only the classes the behavior needs. The look is the app's.
