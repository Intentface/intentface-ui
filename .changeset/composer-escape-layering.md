---
"@intentface/ui": minor
---

- [Composer] Fix an Escape the composer uses also closing a popup or dialog around it from another library, such as a Base UI `Popover` or `Dialog`.
- [Composer] Fix Escape with the command list open also stopping generation.
- [Composer] Fix an Escape that cancels an IME conversion also stopping generation or dismissing an open question's step.
- [Tabs] Fix an Escape that cancels an IME conversion also closing the popup.
- [Composer] Fix Escape, Enter or `AskUser.Continue` after the last question step sending the answers again. `askUser.active` now turns false once the last step is answered or skipped, while `questions` stays set. Pass a new array to ask again.
- [Composer] Fix an Escape typed into another field inside `Composer.Root` dismissing the open question's step or stopping generation.
- [Composer] Fix Space and the arrow keys typed into the editor selecting an option or changing the step while an option was highlighted.
- [Composer] Fix Enter or Space on a button inside the composer selecting the highlighted option instead of pressing the button.
- [Composer] Fix keys on other elements of the page driving the composer's open question. Keys still reach it when focus fell onto the page itself, or onto a popup or other container around the composer.
- [Composer] An empty `questions` array now asks nothing.
- [Composer] `preventPrimitiveHandler()` in `Composer.Root`'s `onKeyDown` now also skips the question's keys, which `Composer.Root` now handles.
- [Composer] [Breaking] Remove `interpretEditorKey`, `interpretAskUserKey`, `EditorKeyAction` and `EditorKeyContext` from `@intentface/ui/composer`; they were the composer's internal key tables, so handle keys in `Composer.Textarea`'s or `Composer.Root`'s `onKeyDown` instead.
