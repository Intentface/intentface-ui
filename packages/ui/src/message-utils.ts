// Derivation helpers over the structural message contract in types.ts.
// Pure functions — no React, no styling. Renderers and panel-state hooks share
// these so they stay decoupled from concrete part shapes.

import {
  type ChatMessage,
  type FilePart,
  isFilePart,
  isReasoningPart,
  isTextPart,
  isToolPart,
  type ReasoningPart,
  type TextPart,
  type ToolPart,
  type UnknownPart,
} from "./types";

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

/** Classifies message parts into coarse groups for chronological rendering. */
export type SegmentType = "reasoning" | "tool" | "text" | "file";

/**
 * A contiguous run of same-typed message parts. Used by message renderers to
 * group reasoning blocks, tool calls, text chunks, etc.
 */
export type MessageSegment =
  | { type: "reasoning"; parts: ReasoningPart[] }
  | { type: "tool"; parts: ToolPart[] }
  | { type: "text"; parts: TextPart[] }
  | { type: "file"; parts: FilePart[] };

/**
 * Maps a single message part to its segment type.
 * Returns `null` for parts that are not rendered chronologically.
 */
export const partSegmentType = (part: UnknownPart): SegmentType | null => {
  if (isReasoningPart(part)) return "reasoning";
  if (isTextPart(part)) return "text";
  if (isFilePart(part)) return "file";
  if (isToolPart(part)) return "tool";
  return null;
};

/**
 * Groups an array of message parts into contiguous segments of the same type.
 * Adjacent parts with the same type are merged into a single segment. This
 * preserves chronological order for interleaved rendering (e.g. reasoning
 * interspersed with tool calls).
 */
export const getSegmentedParts = (parts: readonly UnknownPart[]): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  for (const part of parts) {
    const segType = partSegmentType(part);
    if (!segType) continue;

    const last = segments.at(-1);
    if (last && last.type === segType) {
      (last.parts as unknown[]).push(part);
    } else {
      segments.push({ type: segType, parts: [part] } as MessageSegment);
    }
  }
  return segments;
};

// ---------------------------------------------------------------------------
// Turn grouping
// ---------------------------------------------------------------------------

/** A conversational turn: a user message plus its trailing assistant/tool replies. */
export type Turn<Message extends { id: string; role: string } = ChatMessage> = {
  key: string;
  messages: Message[];
};

/**
 * Groups messages into turns. A new turn starts at every user message;
 * non-user messages attach to the current turn. A conversation that opens with
 * a non-user message still gets a leading turn so nothing is dropped. The turn
 * key is the first message's id — stable while the trailing assistant message
 * streams, so React keys and entrance animations stay put.
 */
export const groupTurns = <Message extends { id: string; role: string }>(
  messages: readonly Message[],
  // The role that starts a new turn — opaque, so consumers with a different
  // role set can group correctly.
  turnStartRole = "user",
): Turn<Message>[] => {
  const turns: Turn<Message>[] = [];
  for (const message of messages) {
    const currentTurn = turns.at(-1);
    if (message.role === turnStartRole || !currentTurn) {
      turns.push({ key: message.id, messages: [message] });
    } else {
      currentTurn.messages.push(message);
    }
  }
  return turns;
};

// ---------------------------------------------------------------------------
// Per-message derivation helpers
//
// These extract structured info from segments/parts so message renderers can
// stay declarative instead of doing inline filter/map chains.
// ---------------------------------------------------------------------------

/** Aggregated text content from all text segments in a message. */
export type TextInfo = {
  parts: TextPart[];
  /** Concatenated text content of all text parts. */
  text: string;
};

/** Extracts all text parts from a message and concatenates their content. */
export const getTextInfo = (segments: readonly MessageSegment[]): TextInfo => {
  const parts = segments
    .filter((s): s is MessageSegment & { type: "text" } => s.type === "text")
    .flatMap((s) => s.parts);
  const text = parts.map((p) => p.text).join("");
  return { parts, text };
};

/** Extracts all file attachment parts from segments. */
export const getFileParts = (segments: readonly MessageSegment[]): FilePart[] =>
  segments
    .filter((s): s is MessageSegment & { type: "file" } => s.type === "file")
    .flatMap((s) => s.parts);

// Chain/reasoning/source extraction (and ask-user extraction) is the consuming
// app's concern — grouping conventions, header formats, and dedup rules are
// product policy. This package ships only the generic segmentation above.
