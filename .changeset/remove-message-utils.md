---
"@intentface/ui": minor
---

- [Breaking] Remove the `@intentface/ui/message-utils` entry point. Copy the helpers you use from [its 0.8.0 source](https://github.com/Intentface/intentface-ui/blob/b0e1802e397d7bfa5b82f0c472ef27e87b175a9f/packages/ui/src/message-utils.ts) into your app, where they import only `@intentface/ui/types`.
