---
"@intentface/ui": patch
---

- [Shell] Fix `Shell.Sidebar` reporting a stale width after only its padding or border changed.
- [Nav] Fix `Nav.List` keeping a stale `--nav-list-height` and `--nav-list-width` during a transition after only a row's padding or border changed.
