---
"@intentface/ui": minor
---

- [Composer] [Breaking] `Composer.Textarea`'s `placeholder` no longer renders an overlay. It stamps `data-placeholder` on the editable while the editor is empty, so add the `[data-composer-editor][data-placeholder]::before` rule from the docs and set its colour.
- [Composer] [Breaking] Remove `Composer.Placeholder`. Pass a string through `Composer.Textarea`'s `placeholder`, or your own element as its `children` for rich content.
- [Composer] [Breaking] `Composer.Textarea` renders its `children` always, not only while empty. Pass a function to receive `{ disabled, filled, composing }` and hide them yourself.
- [Composer] Add `data-composing` on the `Composer.Textarea` wrapper during an IME composition.
