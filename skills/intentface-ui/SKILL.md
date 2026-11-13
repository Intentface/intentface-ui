---
name: intentface-ui
description: Rules for building chat UIs and app shells with @intentface/ui, a headless React primitive library whose parts ship no styles. Covers the entry points, the props, data attributes and CSS variables that carry each part's state, the chat primitives with AI SDK messages, motion, accessibility, upgrades, and the sidebar, nav tree and tabs. Use when building, styling, animating, debugging or upgrading a chat UI, chatbot or AI assistant in a project that uses @intentface/ui or @intentface/chat, including the thread, composer, message rows, reasoning, tool-call steps, attachments, mentions and commands, ask-user questions, or the sidebar, nav tree and tabs.
---

# @intentface/ui

The docs hold the full API. Start at https://ui.intentface.com/llms.txt, and fetch any page as Markdown by adding `.md` to its URL. These rules cover what the docs leave easy to get wrong.

## The package

The package owns behavior: state, keyboard handling, focus, ARIA wiring and measurement. The app owns every class, every color and every word of copy.

| Rule | Summary |
|------|---------|
| Headless | The parts render semantic DOM with `data-*` attributes and no classes. There is no styled package, stylesheet or theme. Style the parts, and use the app's own components through `render`. Never replace the parts with another library's chat components. |
| Explicit roots | Render `<Composer.Root>`, never `<Composer>`. Import each entry point, such as `@intentface/ui/composer`. There is no bare `@intentface/ui` import. |
| Client parts | A server component can render the parts. Event handlers, render functions and React hooks need a `"use client"` module. `@intentface/ui/types` and `@intentface/ui/chip-markdown` import anywhere. |
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
| `@intentface/ui/chip-markdown` | The chip wire format in message text: `encodeChipMarkdown` and `parseChipSegments`. No page, so read the exported types and their JSDoc. |
| `@intentface/ui/generative` | Experimental. Checks and reads a model's UI tool call against a catalog of the app's components. https://ui.intentface.com/generative/catalog.md |

## Before building

Work in this order:

1. Read the repo: the design system, the styling setup, the existing route and client, and the installed `@intentface/ui` or `@intentface/chat` version. Never ask what the code answers.
2. Compare the installed version with `npm view @intentface/ui version`. The docs and this skill describe the latest release. When the app is behind, add the upgrade to the options message with the `[Breaking]` lines it brings. Never upgrade without the developer's yes. When the app stays behind, build against the installed version: its `CHANGELOG.md` names what a `[Breaking]` line changed, so use the old API wherever this skill describes a newer one.
3. Offer the options below that the request left open, each with its default, in one message. Build with the developer's picks.
4. Read the `.md` page of every primitive the picks need. Its Props and Attributes tables are the full list, and its demo source is inlined. Use only the names the page lists. A name that isn't there doesn't exist.
5. Read the references the work needs, as the list at the end says.
6. Build, then run the checks under Verify.

In a non-interactive run, such as `claude -p` or `codex exec`, ask nothing. Build what the request names with the defaults, and don't upgrade. End the report with the options you didn't use and any upgrade available, so the developer still learns they exist.

| Option | Choices | Default | Rules |
|------|------|------|------|
| Auto-scroll | `<Thread.Root autoScroll>`: `"follow"` follows the stream and lands each new turn at the top, `"jump"` lands it without following, `"bottom"` keeps the newest message at the bottom, `"off"` does neither | `"follow"` | This file |
| Send key | `<Composer.Textarea submitOn>`: `"enter"` or `"shift-enter"` | `"enter"` | This file |
| Attachments | `<Composer.Attachments accept maxFiles maxFileSize globalDrop>` for the accepted types, the limits, and drops anywhere on the page | Off, with `<Composer.Attachments maxFiles={0} />`. Without it, the composer takes every dropped or pasted file, with no limits | `references/attachments.md` |
| Mentions and commands | `<Composer.Root commands>`: `@` mentions that insert chips, `/` commands that run an action, or a prefix of the app's own, with items listed or loaded as the user types | None | This file |
| Command list placement | `Composer.Popover` floating at the typed token, or `Composer.Panel` above the input, anchored or in flow with `<Composer.Panel anchor={false}>` | `Composer.Popover` | This file |
| Questions from the model | `<Composer.Root questions>`, fed by a client-side tool and answered in the composer | Off | `references/ask-user.md` |
| Reasoning and tool calls | `Reasoning` for the model's thinking, `Steps` for its tool calls | Shown whenever the backend streams them | This file |
| Layout | A full page, a side panel beside `Shell`, or a chat inside `Tabs` | A full page | `references/shell.md` for `Shell` and `Tabs` |
| App shell | A `Shell` sidebar, a `Nav` tree with `<Nav.Root guide>`, and `Tabs` | None | `references/shell.md` |
| Persistence | Whether past chats survive a reload. The app stores them | None | The app's own |
| Generative UI | `@intentface/ui/generative`, experimental | Off | `references/generative.md` |

## Upgrades

| Rule | Summary |
|------|---------|
| Upgrade by the changelog | Read the release notes between the installed version and the latest at https://ui.intentface.com/changelog.md. Apply the migration in every `[Breaking]` line, oldest release first. Before 1.0, a minor release can break. |
| The old name | `@intentface/chat` is the package's old name. Version 0.7.0 renamed it and changed nothing else, so swap the dependency and replace `@intentface/chat/` with `@intentface/ui/` in imports. |

## Props, attributes and CSS variables

Every part reports its state the same way. Props carry what the app knows into the part. Data attributes carry state out to CSS. CSS variables carry measured sizes out, and the thread's insets and scroll timing in. `references/state.md` lists them for each primitive, with the element each one sits on and when it is present.

| Rule | Summary |
|------|---------|
| Two sources of state | A state comes from the app or from the part. The app passes what only it knows as props, such as a message's `role`, `isError`, `isStreaming`, a step's `status` or a nav row's `active`. The part tracks the rest itself, such as highlight, open, scroll position, drag and resize, and needs no prop for it. |
| Never copy the part's state | Never mirror a state the part exposes in React state or a class of your own. The attribute follows the keyboard, the pointer and the filter, and a copy follows only the events you wired. |
| Props come back as attributes | A state prop reappears on the element as an attribute. `<Message.Root isError>` sets `data-error`, and `<Composer.Submit isGenerating>` sets `data-generating`. Style from the attribute, so the markup needs no condition and the style follows the state wherever it changes. |
| Part attributes name the element | Every part's element carries an attribute naming it, such as `data-composer-editor` or `data-thread-content`, for as long as it renders. Use them to reach elements the app doesn't render itself, such as the editor and the thread's content column, and to target parts from global CSS. |
| State attributes come and go | A boolean state is present or absent, as with `data-highlighted`. Its absence is a state too, so `Thread.Root` without `data-at-bottom` means the user scrolled away. A string state carries its value, as with `data-role`, `data-status` and `data-state`. |
| Where an attribute reaches | An attribute styles its own element, its descendants through a parent selector, and its ancestors through `:has()`. Many parts repeat their primitive's main state, such as `data-state` on every `Shell` part and `data-status` on `Steps.Icon` and `Steps.Label`, so a child can often style itself directly. |
| Open, closed and the frames between | A disclosure carries `data-open` or `data-closed`. On its first frame open it also carries `data-starting-style`, and while closing `data-ending-style`. Transition from and to those two, and the part waits for the transition to end before it unmounts. Content that must stay in the DOM while closed needs `keepMounted`. |
| Positioned surfaces | `Composer.Panel`, `Composer.Popover` and `Tabs.Positioner` carry `data-side` and `data-align` while positioned, the side they landed on after flipping. `Tabs.Popup` sits inside its positioner and reads them from there. Animate from that side. |
| Variables flow down | A variable the package writes sits on one element. It reaches that element and its descendants, never its ancestors, its siblings or anything rendered in a portal. Each variable's row in `references/state.md` says which element holds it. |
| Variables have a lifetime | The composer's sizes, such as `--composer-height`, are absent until first measured, so read them with a fallback. `--thread-inset-bottom`, `--thread-composer-height` and `--thread-composer-width` exist only while `Thread.Composer` is mounted. `--shell-sidebar-width` is absent until the first drag, so set its default on `Shell.Root`. `--panel-height` and `--nav-list-height` hold a length while a transition runs and are `initial` once the panel or list settles open, so it never inherits an outer one's height. Read those two with no fallback, so an open panel takes its natural height. |
| The app sets the inputs | `Thread.Root` reads `--thread-inset-top`, `--thread-composer-gap` and the `--thread-scroll` timing, which the app sets. The thread page marks them "Set by you". Any other variable a demo defines, such as a column width, is the app's own, and the package never reads it. |
| No feedback loops | Never size an element's own contents from a variable measured on that element. Sizing `Composer.Root`'s contents from `--composer-height` grows the root, which raises the variable again. |
| `className` and `style` functions | Both accept a function of the part's state, for a value computed in JavaScript. Prefer the attribute when a selector can express it, because it needs no render. |
| `render` | Swap the element, or render the part as one of the app's components, as in `render={<Button />}`. The component must spread the props it receives onto its DOM element and accept `ref` as a prop. The part keeps its behavior and attributes. |

## Styling conventions

Where the styles live is the app's decision. These rules keep them in one place and keep them reading the package's state.

| Rule | Summary |
|------|---------|
| App conventions win | In an existing app, the app's design system decides the look. Use its tokens, class-merging helper, variant tool and file layout. Use semantic tokens such as `bg-muted`, never raw palette classes or hex values. In an app with no design system, the docs demos set the look. When copying a demo into an app with tokens, swap its palette classes for the tokens. |
| Wrap each part once | In an app with a components layer, such as `components/ui`, wrap each part it uses once, with its styles and variants. Feature code renders parts only through the wrappers, and imports the helpers, types and React hooks directly. In an app without such a layer, style the parts where they're used. |
| String className on wrappers | A wrapper merges classes with the app's helper, such as `cn()`, and takes `className` as a string only. The helper drops a function, so a wrapper that accepts the part's function form loses those classes without an error. |
| Variants on attributes | A variant that depends on a part's state reads the attribute, not a prop the wrapper threads through. |
| Know what a part sets | Never repeat a position, overflow or padding the package sets, and always set what it leaves, such as heights and `z-index`. `references/styling.md` lists both for each part. |

## Thread

The thread owns scrolling. It follows the stream while the user is at the bottom, lands each new turn at the top, measures the composer and publishes CSS variables. The app applies all the layout from them: the composer's position, the padding and the last turn's minimum height.

| Rule | Summary |
|------|---------|
| Build order | `Thread.Root` holds `Thread.Viewport`, which holds `Thread.Content`, and the turns are the direct children of `Thread.Content`. `Thread.Composer` comes after the viewport and holds `Composer.Root`. |
| Content from the start | Render `Thread.Content` together with `Thread.Root`, even with no messages. A `Thread.Content` mounted later, as in `{messages.length > 0 && <Thread.Content>}`, never lands or follows. |
| Turns in Content | Never render turns straight into `Thread.Viewport`. The thread watches only the direct children of `Thread.Content`, so auto-follow and landing stop working. |
| One turn per exchange | Group messages into turns with a `groupTurns` of the app's own (`references/patterns.md` has one), and wrap each question and its replies in one `Message.Turn`. Otherwise the newest reply lands at the top and pushes its question out of view. A flat transcript with one row per message needs `autoScroll="bottom"`. |
| Definite height | `Thread.Root` needs a height from the app's layout. `Thread.Viewport` is a size container, so it needs a definite height too, such as `h-full`. A viewport sized only by `max-height` collapses. |
| Set the insets | Set `--thread-inset-top` on `Thread.Root` for the space a landed turn keeps below the thread's top edge, and `--thread-composer-gap` for the room between the last line and the composer. Both default to 0. Make the top inset the height of anything that floats over the thread, plus a spacing token. A header in flow above `Thread.Root` adds nothing. `references/patterns.md` has both cases. |
| Pad the content | Pad `Thread.Content`'s top with `--thread-inset-top` and its bottom with `--thread-inset-bottom`, and give its last child a minimum height of `--thread-turn-min-height`. A turn lands exactly at the top inset only while these three agree, so add no other padding, margin or gap between the viewport and the turns. The minimum height is `0px` in `"bottom"` and `"off"`, so the rule stays in every mode. |
| Position the composer | `Thread.Composer` has no position of its own. Place it over the viewport's bottom edge, as in `absolute inset-x-0 bottom-0`, so the transcript scrolls under it. It writes the room it takes, plus the gap, as `--thread-inset-bottom` on the root. Without a `Thread.Composer`, nothing writes it, so set it yourself when the transcript needs room at the bottom. Make anything inside it that must not add to the inset absolute or portaled, such as a scroll button. |
| Fades are the app's | There is no overlay part. A fade is the app's own `div` inside `Thread.Root`, absolute, `aria-hidden` and `pointer-events-none`. Make the top one `--thread-inset-top` tall and the bottom one `--thread-inset-bottom` tall. |
| Keep off the scrollbar | Anything the app positions over `Thread.Viewport`, such as the fades, a floating header or `Thread.Composer`, must not cover or catch its scrollbar. Limit each one to the content column's width, centered like the column, and give the viewport `scrollbar-gutter: stable` so the scrollbar never shifts the column. Make `Thread.Composer` click-through with `pointer-events: none`, and turn the pointer back on for `Composer.Root`. |
| Jump to a message | `scrollToMessage(id)` from `useThread()` scrolls only the thread's viewport, to the row carrying `data-message-id={id}`. Put it on each message's own row, as in `<Message.Root data-message-id={message.id}>`. A turn's `key` is its first message's id, so a turn carrying it can't be found by a reply's id. Give `Thread.Viewport` the insets as its `scroll-padding`, `scroll-pt-(--thread-inset-top) scroll-pb-(--thread-inset-bottom)` in Tailwind, so a row lands clear of the top fade and the composer. A `scroll-margin` on a row adds room around it. |
| Scroll button | There is no scroll-to-bottom part. Build one from `useThread()`, which returns `isAtBottom` and `scrollToBottom`. |
| Portals | `Composer.Popover`, an anchored `Composer.Panel` and `Tabs.Portal` render into `document.body`, and render nothing on the server or on the first client render. Give the app root `isolation: isolate`, and put theme classes and tokens on `html` or `body`. The composer's size variables don't reach a portal, so read `useComposer((composer) => composer.size)` there. |

## Message

`Message.Root` reports a message's author and position. The bubble, the markdown, the avatar and the actions are the app's.

| Rule | Summary |
|------|---------|
| Role is the author | `role` is not an ARIA role. It reaches the DOM only as `data-role`, so style each role on `Message.Root`, and reach the parts inside through a descendant selector. |
| Text is one string | `Message.Text` takes one string, renders a `span` and turns chip tokens back into chips. Pass `renderText` to render markdown runs, with `render={<div />}` when they hold blocks. |
| Memoize the row | Memoize the app's row component and pass it the original message object. Otherwise every message re-renders on every stream chunk. |

## Message parts

An AI SDK message holds a list of parts. Split them into segments in order, and render each kind with its own primitive.

| Rule | Summary |
|------|---------|
| Segment the parts | Group neighboring parts of one kind into `text`, `reasoning`, `tool` and `file` segments, in order, with a `getSegmentedParts` of the app's own (`references/patterns.md` has one). It skips kinds it doesn't render, such as sources, and `dynamic-tool` parts, which MCP and other dynamic tools produce, and merges the text on either side of a skipped part. A chat with dynamic tools renders `message.parts` in one pass instead, so each tool keeps its place. |
| Text segments | Render the user's text with `Message.Text`, never a plain markdown renderer. The composer writes chips into the text as `[Label](chip:prefix:value)`, which a markdown renderer shows as links. Render the assistant's text with the app's markdown renderer, through `renderText` when it can hold chips. |
| Reasoning segments | A reasoning segment becomes a `Reasoning.Root`. Its parts' `state` says whether it is still streaming. |
| Tool segments | A tool segment becomes `Steps` items, one per tool part, keyed by `toolCallId`. Map each of the AI SDK's tool states to a status of the app's own, including the approval states and `"output-denied"`. A state you don't map gives `undefined`, and `Steps.Item` shows it as complete. The status reaches the DOM as `data-status`. |
| File segments | A file segment's parts render with the app's own preview. |

## Chat lifecycle

A chat moves through four states: sent and waiting for the reply, streaming, done, and failed. Each one shows somewhere in the parts.

| Rule | Summary |
|------|---------|
| Submitted is generating | `useChat` reports `"submitted"` from the send until the first stream chunk that changes the message, then `"streaming"`. That chunk can come before any text. Pass both to `isGenerating`. Show the pending indicator while `"submitted"`, and while `"streaming"` until the reply has a segment to show. |
| Rows inside the last turn | Render the pending indicator and the error row inside the last `Message.Turn`. A row added as its own child of `Thread.Content` becomes the newest turn, lands at the top and pushes the question out of view. |
| Failed message | On `"error"`, pass `isError` to the last message, so `data-error` styles it, and render an error row with a retry that calls `regenerate()`. Never show the raw error text to the user. |
| Announce the state | Keep one `role="status"` region mounted outside the transcript, and set its text while generating. Give the error row `role="alert"`. A region mounted together with its text is often not announced. |
| Newest message only | Pass `isError` only to the newest message, as in `isError={status === "error" && message.id === lastId}`. Passing the chat's error to every row marks old messages failed and re-renders every memoized row when the status changes. |

## Composer

The composer owns the editor, the commands, the chips and the submit button. What a submit sends, and where, is the app's.

| Rule | Summary |
|------|---------|
| Required parts | `Composer.Root`, `Composer.Container` and `Composer.Textarea`. `Composer.Actions` holds `Composer.Submit`. |
| Submit data | `onSubmit` receives a `ComposerSubmitData`. Check `kind`. `"message"` carries the trimmed `text` and the `files`, and `"answers"` carries the ask-user answers. The editor is already cleared when `onSubmit` runs. |
| Editor styling | The editable element belongs to the editor engine. Style its text color and focus from `Composer.Textarea` with descendant selectors on `data-composer-editor`. Never override its `white-space`. |
| Box and type on the textarea | Put the padding, minimum and maximum height, scrolling, and the font family, size and line height on `Composer.Textarea`. The editor and the placeholder both inherit them, so their text lines up. Padding or type on the editor alone moves the caret but not the placeholder. |
| The placeholder | Pass the hint as `Composer.Textarea`'s `placeholder`, which also sets `aria-placeholder`. While the editor is empty, the textarea draws it in an `aria-hidden` overlay, `data-composer-placeholder`, at `inset: 0` over the editor. A `Composer.Placeholder` inside the textarea replaces the drawn hint with rich content, which screen readers never hear, so keep the `placeholder` prop with it. Give the overlay a color only. An `absolute` with `top` and `left` counts the textarea's padding twice. |
| Send-to-stop | `<Composer.Submit isGenerating onStop>` turns the button into stop while generating. `<Composer.Root isSubmitting>` only blocks sending. |
| Never disable Submit for streaming | `disabled` on `Composer.Submit` replaces its automatic disabled state, so the button turns on with an empty field. |
| Panel opens on children | `Composer.Panel` and `Composer.Popover` open whenever they have children. Gate inside, as in `{(composer) => composer.askUser.active && <Question />}`. A child that returns `null` still opens an empty panel. |
| Panel placement | `Composer.Panel` renders into a portal anchored to the container by default, with no width and no `z-index`. Size it with `--anchor-width`, or render it in flow with `<Composer.Panel anchor={false}>`. |
| Popover for commands | `Composer.Popover` anchors to the typed command token, so use it only for command lists. Its `--anchor-width` is the token's width, so set the popover's width yourself. It stays mounted, and until its first open it is an unpositioned element at the end of `body`, so its `data-closed` style must hide it. |
| Empty and loading rows | `Composer.CommandEmpty` and `Composer.CommandLoading` always render. Show them from the `data-empty` and `data-loading` attributes on `Composer.Command`. |

## Steps, Reasoning and chips

These parts are disclosures and inline tokens with no copy of their own.

| Rule | Summary |
|------|---------|
| Height animation | `Steps.Panel` and `Reasoning.Content` animate only through the app's CSS on `--panel-height`, which holds a length while a transition runs and is `initial` once the panel settles open. |
| Closed content unmounts | Both mount closed content only with `keepMounted`. |
| Chevron on the trigger | A chevron inside `Steps.Trigger` reads the trigger's `data-open` through a descendant selector. The trigger adds no class, so in Tailwind name a `group` on it. |
| Reasoning is bare | `Reasoning` is a disclosure with no copy, shimmer or markdown. Build the label from `useReasoning()`. It never opens or closes by itself. |
| Keep the duration | The duration is measured only while the part is mounted. Save it with the message to show it after a reload. |
| Chip tints | `Chip.Root` has no tints and no variant. Tint a chip with a class, or with an attribute of the app's own. |
| Chip preview | `Chip.Preview` works only as a direct child of `<Chip.Root renderWithPreview>`. The popup, opening it on focus and closing it on Escape are the app's. |

## Motion

The parts time their own mount and unmount, and the app provides every duration and easing. `references/motion.md` lists what can move in each primitive and the attribute or variable that drives it.

| Rule | Summary |
|------|---------|
| Animate the state changes | Animate panels and popovers opening and closing, disclosures expanding, the send and stop swap, the drop affordance, and new messages arriving. |
| Timing from the design system | Take durations and easing from the app's motion tokens, such as a Motion section in its `DESIGN.md`. Without tokens, match the app's existing motion, then the docs demos. Never invent values. |
| Reduced motion | Gate movement and scale behind `prefers-reduced-motion`, and keep opacity fades or nothing. |
| New messages are the app's | The package doesn't animate message rows. Give new rows an entrance of the app's own, and skip the rows present at mount, so a reload doesn't replay the transcript. |
| Time the thread's scroll | The thread runs every scroll itself, so never animate the scroll in your own code. Its smooth scrolls are the browser's own until the app sets `--thread-scroll` on `Thread.Root`, a duration and an easing from the motion tokens. Set it once. `references/motion.md` has the rules. |

## Keyboard

The parts already handle their keys. The app adds shortcuts around them, never on top of them. Each page's Keyboard table has the full list.

| Rule | Summary |
|------|---------|
| No handlers on top | Never add an `onKeyDown` for Enter, Tab, Escape or the arrows to the composer. It sends twice or breaks the command list. To claim a key the editor uses, pass `onKeyDown` to `Composer.Textarea` and call `event.preventDefault()`. `event.preventPrimitiveHandler()` in `Composer.Root`'s `onKeyDown` only keeps Escape from stopping the reply. |
| Escape stops inside the composer | While generating, and only with `onStop`, Escape inside the composer stops the reply. To stop on Escape anywhere in the chat, handle it on `Thread.Root`. |
| Skip handled keys | The composer calls `preventDefault()` on the Escape it uses, and `Tabs` ignores an Escape that is already prevented. An app handler on a container or `window` does both. It skips events whose `defaultPrevented` is set, and prevents the ones it handles. |

## Accessibility

The parts own roles, keyboard handling and focus movement. Everything visual is the app's, and some of it is required. https://ui.intentface.com/handbook/accessibility.md has the full list.

| Rule | Summary |
|------|---------|
| Visible focus | Focus moves correctly, and nothing paints it. Style `:focus-visible` on every interactive part. In command lists and ask-user options, the highlight is the focus indicator, so give it the contrast of a focus ring. |
| Contrast | Check the contrast of text, the command highlight and the focus indicators in the app's colors. No color ships with the package. |
| Speaker identity | `data-role` reaches no screen reader. Add a visually hidden speaker label to each message, as the row in `references/patterns.md` does. `Message.Root` is a plain `div`, where an `aria-label` isn't allowed. |
| Validation copy | Validation emits codes, not messages. Map each code to copy of the app's own. |
| Names on bare controls | Parts with no text of their own, such as `Shell.Trigger`, `Shell.Grip` and `Tabs.Close`, need an `aria-label`. A remove button in a list takes the distinguishing part as a prop, as in `<Attachments.Remove filename={item.filename}>`. |
| Popups through render keep focus and Escape | A surface the app builds through `render`, such as a chip's hover preview, opens on focus as well as hover, and Escape closes it. |

## Verify

A chat that builds can still hide messages behind the composer or lose the keyboard. Check the running app.

| Rule | Summary |
|------|---------|
| Type-check and build | Run the app's type-check and build. A part or prop that fails the type-check doesn't exist, so fix the name instead of casting. |
| Send and stream | Send a message and watch the reply stream. The thread follows while you're at the bottom and stops following when you scroll up. Stop works from the button, and from Escape inside the composer. |
| Grow and resize | Type several lines into the composer and resize the window. No message hides behind the composer, and a new turn lands at the top. |
| Landing | Send a second message once the first reply is long. The new turn's top stops `--thread-inset-top` below the thread's top edge, clear of any floating header. |
| Keyboard pass | Tab through the chat. Open a command list with its prefix, move with the arrow keys and pick with Enter. Every focused control shows its focus. |
| Styles read the package | Every state the styles show comes from a part's attribute, and every measured size from the package's CSS variables. |

## References

Read each reference when the work reaches it.

- `references/state.md`, before styling a part: its props, attributes and CSS variables, with the element each one sits on, when it is present and what it is for.
- `references/styling.md`, before styling a part: what it renders, what the package sets inline and what the app sets.
- `references/motion.md`, before animating: what can move in each primitive, what drives it and how the part times its unmount.
- `references/patterns.md`, before writing the thread, a message row, the chat lifecycle, a command list or a collapsible: start each one from its example. The examples carry only the classes the behavior needs. The look is the app's.
- `references/attachments.md`, `references/ask-user.md`, `references/shell.md` and `references/generative.md`, when that option is on: its rules and its example.
