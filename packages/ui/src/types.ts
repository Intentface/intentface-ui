// Structural message contract. These types are deliberately framework- and
// SDK-agnostic: an AI SDK `UIMessage` satisfies `ChatMessage` structurally, so
// no adapter or translation layer is needed. Extend via the generics.

// Every primitive stamps a bespoke part-identity attribute (data-composer-root,
// data-thread-scroller, …) — `data-slot` stays free for the consumer layer.
// The data-* index signature that lets internal props objects typecheck lives
// on the render machinery's HTMLProps (internal/render/baseTypes.ts), NOT as a
// React module augmentation — augmentation leaks into every consumer's app
// types and breaks structural assignability (e.g. react-markdown Components).

/**
 * The minimal part contract, which every part meets. Parts this package doesn't
 * describe, such as `step-start`, `dynamic-tool` and parts added later, are
 * carried through untouched.
 */
export type UnknownPart = { type: string };

/** Text in a message. `state` is `"streaming"` while it arrives and `"done"` once it's complete. */
export type TextPart = {
  type: "text";
  text: string;
  state?: "streaming" | "done";
};

/** The model's reasoning, kept apart from its answer. `state` works as on `TextPart`. */
export type ReasoningPart = {
  type: "reasoning";
  text: string;
  state?: "streaming" | "done";
};

/** A file in a message, by URL: a hosted URL or a data URL. */
export type FilePart = {
  type: "file";
  mediaType: string;
  url: string;
  filename?: string;
};

/** A web page the model cites as a source. */
export type SourceUrlPart = {
  type: "source-url";
  sourceId: string;
  url: string;
  title?: string;
};

/**
 * The point a tool call has reached: its input still streaming, its input
 * complete, its output returned, or an error. The AI SDK has three more states,
 * `approval-requested`, `approval-responded` and `output-denied`, and
 * `isToolPart` lets those parts through too.
 */
export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

/**
 * A tool call. `type` is `tool-` followed by the tool's name, and the type
 * parameters type `input` and `output`.
 */
export type ToolPart<Input = unknown, Output = unknown> = {
  type: `tool-${string}`;
  toolCallId: string;
  state: ToolPartState;
  input?: Input;
  output?: Output;
  errorText?: string;
};

/** Data the app streams with a message. `type` is `data-` followed by a name the app chooses. */
export type DataPart = {
  type: `data-${string}`;
  id?: string;
  data?: unknown;
};

/**
 * Every part a message carries. `UnknownPart` keeps the union open, so a check
 * on `part.type` can't narrow it. Use the part guards instead.
 */
export type MessagePart =
  | TextPart
  | ReasoningPart
  | FilePart
  | SourceUrlPart
  | ToolPart
  | DataPart
  | UnknownPart;

/**
 * A chat message. An AI SDK `UIMessage` satisfies it structurally, so no
 * adapter is needed. `Metadata` types `metadata`, and `Part` types each part.
 */
export type ChatMessage<Metadata = unknown, Part extends UnknownPart = MessagePart> = {
  id: string;
  // Opaque role string — consumers own the concrete union (e.g. system/user/
  // assistant). AI SDK message shapes satisfy this structurally.
  role: string;
  metadata?: Metadata;
  parts: Part[];
};

/**
 * The status of the chat's request: `"submitted"` from the send until the
 * reply starts, `"streaming"` while it arrives, then `"ready"` or `"error"`.
 * Structurally identical to the AI SDK's `ChatStatus`.
 */
export type ChatStatus = "submitted" | "streaming" | "ready" | "error";

// ---------------------------------------------------------------------------
// Ask-user contract
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Part guards
//
// `UnknownPart` sits in the `MessagePart` union, so a raw discriminant check
// (`part.type === "text"`) cannot narrow. Use these guards instead.
// ---------------------------------------------------------------------------

/** Narrows a part to `TextPart` when its `type` is `"text"`. */
export const isTextPart = (part: UnknownPart): part is TextPart => part.type === "text";

/** Narrows a part to `ReasoningPart` when its `type` is `"reasoning"`. */
export const isReasoningPart = (part: UnknownPart): part is ReasoningPart =>
  part.type === "reasoning";

/** Narrows a part to `FilePart` when its `type` is `"file"`. */
export const isFilePart = (part: UnknownPart): part is FilePart => part.type === "file";

/** Narrows a part to `SourceUrlPart` when its `type` is `"source-url"`. */
export const isSourceUrlPart = (part: UnknownPart): part is SourceUrlPart =>
  part.type === "source-url";

/**
 * Narrows a part to `ToolPart` when its `type` starts with `tool-` and it has
 * `state` and `toolCallId`. A `dynamic-tool` part doesn't match.
 */
export const isToolPart = (part: UnknownPart): part is ToolPart =>
  part.type.startsWith("tool-") && "state" in part && "toolCallId" in part;
