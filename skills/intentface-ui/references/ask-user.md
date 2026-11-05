# Ask-user flow

The model asks the user questions through the composer, which turns the user's input into answers.

## Rules

| Rule | Summary |
|------|---------|
| The demos are the spec | The composer page describes the flow in prose, and its ask-user demos hold the full wiring. Copy their source from https://ui.intentface.com/primitives/composer.md. |
| Stable questions | Pass `<Composer.Root questions>` a stable array. A new array on every stream chunk restarts the flow at the first question. |
| Questions block messages | While `questions` is set, every submit answers a question, and no message can be sent. Unset `questions` once the answers arrive. With questions from a tool call, `addToolOutput` does this, because `questions` derives from the part's state. |
| Wire the parts | `AskUser` parts are stateless. Pass `askUser.optionsRef` as the `ref` of `AskUser.Options`, give each `AskUser.Option` its label as its `value`, and wire the previous, next and dismiss buttons to the composer's `askUser` actions. |
| Questions from a tool call | The model asks through a tool with no `execute`, whose input is the questions. While its part waits in `"input-available"`, pass its questions to the composer, kept as one array per `toolCallId`. |
| Answers as the tool's output | On `kind: "answers"`, call `addToolOutput` with the tool call's id. Set `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` on `useChat`, so the answers go back to the model without another send. |

## Ask-user from a tool call

```ts
// The server tool. It has no execute, so the call waits for the user's answers.
import { tool } from "ai";
import { z } from "zod";

export const askUser = tool({
  description: "Ask the user clarifying questions with predefined options.",
  inputSchema: z.object({
    questions: z.array(
      z.object({
        question: z.string(),
        options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
        multiSelect: z.boolean().optional(),
      }),
    ),
  }),
});
```

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { type AskUserQuestion, Composer, type ComposerSubmitData } from "@intentface/ui/composer";
import { isToolPart } from "@intentface/ui/types";
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useState } from "react";
import { Question } from "./question";

type PendingAskUser = { toolCallId: string; questions: AskUserQuestion[] };

const usePendingAskUser = (messages: UIMessage[]): PendingAskUser | null => {
  const part = messages
    .at(-1)
    ?.parts.find(
      (candidate) =>
        isToolPart(candidate) && candidate.type === "tool-askUser" && candidate.state === "input-available",
    );
  const next =
    part && isToolPart(part)
      ? { toolCallId: part.toolCallId, ...(part.input as { questions: AskUserQuestion[] }) }
      : null;
  const [pending, setPending] = useState(next);
  if (pending?.toolCallId !== next?.toolCallId) {
    setPending(next);
    return next;
  }
  return pending;
};

export const AskingChat = () => {
  const { messages, sendMessage, addToolOutput } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
  const pending = usePendingAskUser(messages);

  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind === "answers") {
      if (pending) {
        addToolOutput({ tool: "askUser", toolCallId: pending.toolCallId, output: data.answers });
      }
      return;
    }
    sendMessage({ text: data.text });
  };

  return (
    <Composer.Root questions={pending?.questions} onSubmit={handleSubmit}>
      <Composer.Panel anchor={false}>
        {(composer) => composer.askUser.active && <Question />}
      </Composer.Panel>
      <Composer.Container>
        <Composer.Textarea>
          <Composer.Placeholder placeholder="Or type your own answer" />
        </Composer.Textarea>
        <Composer.Actions>
          <Composer.Submit />
        </Composer.Actions>
      </Composer.Container>
    </Composer.Root>
  );
};
```

- The tool has no `execute`, so its part waits in `"input-available"` until the app adds the output.
- The pending call is the first `askUser` part still waiting in `"input-available"`, so a message with several calls asks them one after another. It is kept as one object per `toolCallId`. Every stream chunk produces new message objects, and a new `questions` array would restart the flow at the first question.
- The composer submits `kind: "answers"` once the last question is answered or skipped. `addToolOutput` moves the part out of `"input-available"`, so `pending` becomes `null` and `questions` unsets, and `sendAutomaticallyWhen` sends the answers to the model.
- `Question` is the prompt from the composer page's ask-user demo, built from the `AskUser` parts and the composer's `askUser` state.
- The panel's children gate on `composer.askUser.active`, so the panel opens only while a question is waiting.
