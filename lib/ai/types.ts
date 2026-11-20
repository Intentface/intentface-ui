import type { AskUserQuestion as ComposerAskUserQuestion } from "@intentface/ui/composer";
import type { ChatMessage, ChatStatus, FilePart } from "@intentface/ui/types";
import type * as sdk from "ai";
import type { askUser } from "@/tools/ask-user";
import type { listDocsPages } from "@/tools/list-docs-pages";
import type { readDocsPage } from "@/tools/read-docs-page";
import type { readSourceFile } from "@/tools/read-source-file";
import type { renderUi } from "@/tools/render-ui";
import type { createWebSearch } from "@/tools/web-search";

// This app's tools, as the chat route registers them (it checks itself against
// this). Typing messages with them types each tool part's input and output, so
// the chat reads them without casts.
export type AppTools = {
  askUser: typeof askUser;
  listDocsPages: typeof listDocsPages;
  readDocsPage: typeof readDocsPage;
  readSourceFile: typeof readSourceFile;
  renderUi: typeof renderUi;
  webSearch: ReturnType<typeof createWebSearch>;
};

export type AppUIMessage = sdk.UIMessage<
  { stopped?: boolean },
  // Transient stream-only parts (delivered via onData, never persisted into
  // message.parts): the server pushes the generated thread title mid-stream.
  { "thread-title": { title: string } },
  sdk.InferUITools<AppTools>
>;

/** One kind of part of this app's messages, by its type. */
export type AppPart<Type extends AppUIMessage["parts"][number]["type"]> = Extract<
  AppUIMessage["parts"][number],
  { type: Type }
>;

/** A tool part of any tool: a static one, or a dynamic one such as an MCP server's. */
export type ToolPart = sdk.ToolUIPart | sdk.DynamicToolUIPart;

/** Any message part, whatever the app's tools and data types. */
export type AnyPart = sdk.UIMessagePart<sdk.UIDataTypes, sdk.UITools>;

// The askUser tool's input, from its zod schema; the composer's generic question
// contract is satisfied structurally (see the assignability lock below).
export type AskUserInput = sdk.InferToolInput<typeof askUser>;
export type AskUserQuestion = AskUserInput["questions"][number];

// This app's concrete message roles. The headless Message primitive takes an
// opaque role string; the app owns the set.
export type MessageRole = "system" | "user" | "assistant";

// This app's concrete step statuses. The headless Steps primitive takes an
// opaque status string; the app owns the set.
export type StepStatus = "complete" | "active" | "pending" | "error";

// ---------------------------------------------------------------------------
// Assignability locks
//
// @intentface/ui owns structural message types that AI SDK shapes must keep
// satisfying. These asserts fail typecheck loudly if an `ai` upgrade (or a
// package change) breaks that structural compatibility.
// ---------------------------------------------------------------------------

type Assert<T extends true> = T;

export type MessageContractCheck = Assert<
  AppUIMessage extends ChatMessage<{ stopped?: boolean }> ? true : false
>;

export type FilePartContractCheck = Assert<sdk.FileUIPart extends FilePart ? true : false>;

export type ChatStatusContractCheck = Assert<sdk.ChatStatus extends ChatStatus ? true : false>;

// The askUser tool's question must keep satisfying the composer's generic
// question contract (its `questions` prop).
export type AskUserQuestionContractCheck = Assert<
  AskUserQuestion extends ComposerAskUserQuestion ? true : false
>;
