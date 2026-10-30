import { describe, expect, test } from "bun:test";
import { getSegmentedParts, groupTurns, type Turn } from "../src/message-utils";
import type { ChatMessage, MessagePart } from "../src/types";

describe("getSegmentedParts", () => {
  test("groups adjacent same-typed parts and keeps chronology", () => {
    const parts: MessagePart[] = [
      { type: "reasoning", text: "thinking" },
      { type: "reasoning", text: "more" },
      { type: "tool-webSearch", toolCallId: "1", state: "output-available" },
      { type: "text", text: "answer" },
      { type: "step-start" },
    ];
    const segments = getSegmentedParts(parts);

    expect(segments.map((s) => s.type)).toEqual(["reasoning", "tool", "text"]);
    expect(segments[0]?.parts).toHaveLength(2);
  });

  test("ignores parts without state/toolCallId even when tool-prefixed", () => {
    const segments = getSegmentedParts([{ type: "tool-broken" }]);
    expect(segments).toHaveLength(0);
  });
});

describe("groupTurns", () => {
  const message = (id: string, role: ChatMessage["role"]): ChatMessage => ({
    id,
    role,
    parts: [],
  });

  test("starts a turn per user message, attaches assistant replies", () => {
    const turns = groupTurns([
      message("u1", "user"),
      message("a1", "assistant"),
      message("u2", "user"),
      message("a2", "assistant"),
      message("a3", "assistant"),
    ]);

    expect(turns.map((t) => t.key)).toEqual(["u1", "u2"]);
    expect(turns[1]?.messages.map((m) => m.id)).toEqual(["u2", "a2", "a3"]);
  });

  test("groups any records that carry an id and a role", () => {
    const records = [
      { id: "q1", role: "human", body: "hi" },
      { id: "r1", role: "bot", body: "hello" },
      { id: "q2", role: "human", body: "again" },
    ];
    const turns = groupTurns(records, "human");

    expect(turns.map((t) => t.key)).toEqual(["q1", "q2"]);
    // The element type flows through, so a consumer reads its own fields back.
    expect(turns[0]?.messages.map((m) => m.body)).toEqual(["hi", "hello"]);
    const accepted: Turn<(typeof records)[number]> | undefined = turns[0];
    expect(accepted?.key).toBe("q1");
  });

  test("a leading assistant message still gets a turn", () => {
    const turns = groupTurns([message("a1", "assistant")]);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.key).toBe("a1");
  });
});

// getAskUserInfo, getSourcesInfo, splitReasoningByHeaders, getChainInfo, and
// getReasoningInfo moved to the app (lib/ai/steps-info.ts, lib/ai/message-info.ts)
// — tool contracts, header conventions, and dedup rules are the consumer's.
