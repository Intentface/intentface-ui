---
"@intentface/ui": minor
---

- [Composer] New `--composer-height`, `--composer-width`, `--composer-container-height` and `--composer-container-width` on `Composer.Root`, and the same numbers as `size` on the composer store.
- [Composer] [Breaking] `Composer.Panel` and `Composer.Popover` render callbacks receive `Omit<ComposerState, "size">`. Let a separately declared callback infer its argument, or type it with that.
