---
"@intentface/ui": minor
---

- [Chip] [Breaking] Remove `variant` and `ChipState` from `Chip.Root`. Style a chip with a class or your own `data-variant`, and use that value directly where a `className`, `style` or `render` callback read `state.variant`.
