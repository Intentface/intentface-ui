---
"@intentface/ui": minor
---

- [Composer] Keep the message being typed when questions arm and restore it, chips included, when the flow ends. It never becomes an answer's text, and a controlled `value` never sees a step's text.
- [Composer] Arming questions no longer moves focus out of a focused editor, or out of another field the user is typing in.
- [Composer] Ending a question flow returns focus to the editor only while focus is still in the composer.
- [Composer] Fix a second click on `Composer.QuestionContinue` after the answers went out sending the waiting message. Continue is now a plain button that calls `questions.continueStep`, not a form submit.
- [Composer] Fix Backspace in an empty question step removing the waiting message's last attachment.
- [Composer] Fix loading editor content (a question step, the message coming back, a new `value` or `defaultValue`) moving focus into the editor in Chrome.
- [Composer] Enter in an empty editor with nothing selected on the current question does nothing instead of skipping it.
- [Composer] [Breaking] `AnswerDraft.freeText` is now `buffer`, the step's saved editor content with its `text`. Read `draft.buffer?.text` where you read `draft.freeText`.
- [Composer] [Breaking] `questions.continueStep` takes no argument and reads the editor itself. Drop the text you passed.
