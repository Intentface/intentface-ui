---
"@intentface/ui": minor
---

- [Composer] [Breaking] The ask-user parts move into Composer as `Composer.Question` parts, and `@intentface/ui/ask-user` is removed. Replace `AskUser.X` with `Composer.QuestionX` and `useAskUserOption(s)` with `useQuestionOption(s)`.
- [Composer] [Breaking] Questions carry an `id` you mint and a `label`, and options an optional `value` that answers echo back. Rename `AskUserQuestion` to `ComposerQuestion`, its `question` field to `label`, and give each question an `id`.
- [Composer] [Breaking] Answers are one flat `ComposerAnswer` shape, `{ id, selected, text? }`, so a tool approval is just a question. Match `data.answers` to your questions by `id` instead of by question text.
- [Composer] [Breaking] The store slice is `composer.questions`, with `items` and `drafts`, and `interpretAskUserKey` is `interpretQuestionKey`. Rename `composer.askUser` reads, and `data-ask-user-*` selectors to `data-composer-question-*`.
- [Composer] Fix an empty `questions` array arming the question flow.
- [Composer] Fix the question flow taking keys from unrelated elements, such as Space on a button outside the composer.
