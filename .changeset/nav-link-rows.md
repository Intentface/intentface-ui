---
"@intentface/ui": patch
---

- [Nav] Fix `Nav.Item`, `Nav.Trigger` and `Nav.Action` rendered as links announcing as buttons. They now set `role="button"` only on their own `div`.
