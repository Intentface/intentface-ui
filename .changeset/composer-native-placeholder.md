---
"@intentface/ui": minor
---

- [Composer] [Breaking] `Composer.Textarea`'s `placeholder` no longer renders an overlay. It stamps `data-placeholder` on the editable while the editor is empty, so add the `[data-composer-editor][data-placeholder]::before` rule from the docs and set its colour.
- [Composer] [Breaking] Remove the `placeholder` prop and `data-composer-placeholder-text` from `Composer.Placeholder`. Pass strings through `Composer.Textarea`'s `placeholder`, and use `Composer.Placeholder` for rich content only.
- [Composer] Change `Composer.Placeholder` to hide itself while the editor is filled or composing, and add `keepMounted` to keep it rendered with `data-hidden`.
- [Composer] Add a function form of `Composer.Textarea` `children` that receives `{ disabled, filled, composing }`, and `data-composing` on the wrapper.
- [Composer] [Breaking] `Composer.Placeholder` outside `Composer.Textarea` now throws.
