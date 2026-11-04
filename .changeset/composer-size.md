---
"@intentface/ui": minor
---

- [Composer] New `--composer-height`, `--composer-width`, `--composer-container-height` and `--composer-container-width` on `Composer.Root`, and the same numbers as `size` on the composer store.
- [Composer] New `getServerSnapshot()` on the composer store, with `size` null as the server rendered it. `useComposer` and `useComposerStore` hydrate against it.
- [Composer] [Breaking] `Composer.Panel` and `Composer.Popover` render callbacks receive `Omit<ComposerState, "size">`. Let a separately declared callback infer its argument, or type it with that.
