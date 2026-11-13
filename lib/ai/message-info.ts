// App-owned message-info extractors: how parts split into segments, how
// messages group into turns, and how reasoning, tool chains, and sources are
// grouped and labelled for rendering. These encode this app's conventions
// (bold `**Header**` reasoning sections, dedup-by-domain sources, the
// chain-of-thought grouping) over the package's generic part contracts.

import {
  type ChatMessage,
  type FilePart,
  isFilePart,
  isReasoningPart,
  isSourceUrlPart,
  isTextPart,
  isToolPart,
  type ReasoningPart,
  type TextPart,
  type ToolPart,
  type UnknownPart,
} from "@intentface/ui/types";

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

// ---------------------------------------------------------------------------
// Reasoning sections — split by standalone bold `**Header**` lines
// ---------------------------------------------------------------------------

/** A section of reasoning text split by a bold `**Header**` line. */
export type ReasoningSection = { header: string | null; body: string };

/**
 * Splits reasoning text into sections by standalone bold `**Header**` lines.
 * Each header and its following body become a separate section.
 */
export const splitReasoningByHeaders = (texts: readonly string[]): ReasoningSection[] => {
  const combined = texts.join("\n\n");
  const parts = combined.split(/(?=^\*\*[^*]+\*\*$)/m);

  const sections: ReasoningSection[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^\*\*([^*]+)\*\*\s*/);
    const header = headerMatch?.[1];
    if (headerMatch && header) {
      sections.push({
        header: header.trim(),
        body: trimmed.slice(headerMatch[0].length).trim(),
      });
    } else {
      sections.push({ header: null, body: trimmed });
    }
  }
  return sections;
};

// ---------------------------------------------------------------------------
// Chain of thought — reasoning + tool segments as one collapsible unit
// ---------------------------------------------------------------------------

/** Info about the reasoning + tool "chain of thought" portion of a message. */
export type ChainInfo = {
  /** Reasoning and tool segments in chronological order. */
  segments: MessageSegment[];
  hasTools: boolean;
  /** True when reasoning is present but no tool calls — renders standalone. */
  onlyReasoning: boolean;
};

/**
 * Filters segments to the steps subset (reasoning + tools) and
 * classifies whether tools are present.
 */
export const getChainInfo = (segments: readonly MessageSegment[]): ChainInfo => {
  const chainSegments = segments.filter((s) => s.type === "reasoning" || s.type === "tool");
  const hasTools = chainSegments.some((s) => s.type === "tool");
  const hasReasoning = chainSegments.some((s) => s.type === "reasoning");
  return {
    segments: chainSegments,
    hasTools,
    onlyReasoning: hasReasoning && !hasTools,
  };
};

// ---------------------------------------------------------------------------
// Standalone reasoning info
// ---------------------------------------------------------------------------

/** Standalone reasoning info (used when no tools are present). */
export type ReasoningInfo = {
  parts: ReasoningPart[];
  texts: string[];
  /** Section headers extracted from reasoning text (e.g. **Analyzing data**). */
  headers: string[] | undefined;
  isStreaming: boolean;
};

/**
 * Extracts reasoning parts, their text content, section headers for the
 * collapsible trigger, and whether reasoning is actively streaming.
 */
export const getReasoningInfo = (
  segments: readonly MessageSegment[],
  isMessageStreaming: boolean,
): ReasoningInfo => {
  const parts = segments
    .filter((s): s is MessageSegment & { type: "reasoning" } => s.type === "reasoning")
    .flatMap((s) => s.parts);
  const texts = parts.map((p) => p.text);
  const isStreaming = isMessageStreaming && segments.at(-1)?.type === "reasoning";
  const sectionHeaders = splitReasoningByHeaders(texts)
    .map((section) => section.header)
    .filter((header): header is string => header !== null);
  const headers = sectionHeaders.length > 0 ? sectionHeaders : undefined;
  return { parts, texts, headers, isStreaming };
};

// ---------------------------------------------------------------------------
// Source URLs — deduplicated by display domain
// ---------------------------------------------------------------------------

/** A deduplicated source extracted from `source-url` parts. */
export type SourceInfo = {
  url: string;
  domain: string;
};

/** Aggregated source-url info for a message. */
export type SourcesInfo = {
  sources: SourceInfo[];
  hasSources: boolean;
};

/**
 * Extracts `source-url` parts, deduplicates by hostname (stripping `www.`),
 * and returns an array of unique sources with their display domain.
 */
export const getSourcesInfo = (parts: readonly UnknownPart[]): SourcesInfo => {
  const seen = new Set<string>();
  const sources: SourceInfo[] = [];

  for (const part of parts) {
    if (!isSourceUrlPart(part)) continue;
    try {
      const domain = new URL(part.url).hostname.replace(/^www\./, "");
      if (seen.has(domain)) continue;
      seen.add(domain);
      sources.push({ url: part.url, domain });
    } catch {
      // skip malformed URLs
    }
  }

  return { sources, hasSources: sources.length > 0 };
};
