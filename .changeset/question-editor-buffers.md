---
"@intentface/ui": minor
---

- [Composer] Keep the message being typed when questions arm and restore it, chips included, when the flow ends. It never becomes an answer's text, and a controlled `value` never sees a step's text.
- [Composer] Arming questions no longer moves focus out of a focused editor.
- [Composer] Enter in an empty editor with nothing selected on the current question does nothing instead of skipping it.
- [Composer] [Breaking] `AnswerDraft.freeText` is now `buffer`, the step's saved editor content with its `text`. Read `draft.buffer?.text` where you read `draft.freeText`.
- [Composer] [Breaking] `questions.continueStep` takes no argument and reads the editor itself. Drop the text you passed.
