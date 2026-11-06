# Generative UI (experimental)

The model writes UI as data, and the helpers check it and read it while it streams. Nothing here renders.

| Rule | Summary |
|------|---------|
| Only when asked | `@intentface/ui/generative` may change or be removed before 1.0. Use it only when the user asks for UI the model generates, and pin the exact version. |
| Data, not markup | The model's UI tool call names the app's catalog components as data. There are no parts, attributes or CSS variables. The app draws every node. |
| Docs first | Read https://ui.intentface.com/generative/catalog.md, which has the full tool, the client and every demo. |
| Schema as is | Pass `tree.schema(catalog)` as the tool's `inputSchema` itself. Spreading it into another object drops its Standard Schema. |
| Validators | Every component's `props` schema must convert to JSON Schema: zod 4.2+, ArkType 2.1.28+, or Valibot through `toStandardJsonSchema`. |
| Tools in history | Pass the same tools to `convertToModelMessages(messages, { tools })`, with a `toModelOutput` on the UI tool, as the catalog page's tool has. Without them, every later turn sends whole results back to the model. |
