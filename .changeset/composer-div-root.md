---
"@intentface/ui": minor
---

- [Composer] [Breaking] `Composer.Root` renders a `<div>` instead of a `<form>`. Target `[data-composer-root]` instead of `form`, and pass `render={<form />}` to keep a form.
- [Composer] [Breaking] `Composer.Submit` and `AskUser.Continue` are `type="button"` and send through the store. Don't rely on them submitting an enclosing form.
- [Composer] [Breaking] `useComposerSubmit` returns `onClick` in place of `type`. Spread `onClick` onto your button and set `type="button"`.
- [Composer] New `submit()` on the composer store.
