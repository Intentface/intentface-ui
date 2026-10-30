---
"@intentface/ui": minor
---

- [Chip] Fix `parseChipSegments` dropping chips whose label has brackets, and keeping the backslashes `encodeChipMarkdown` adds before brackets, parentheses and backslashes.
- [Chip] [Breaking] Remove `CHIP_REF_PATTERN`. Read chip tokens with `parseChipSegments`.
