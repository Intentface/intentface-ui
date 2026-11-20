import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "@intentface/ui/types";
import { getSegmentedParts, groupTurns, type Turn } from "@/lib/ai/message-info";
import { getToolCallInfo } from "@/lib/ai/steps-info";
import type { AnyPart, ToolPart } from "@/lib/ai/types";

describe("getSegmentedParts", () => {
  test("groups adjacent same-typed parts and keeps chronology", () => {
    const parts: AnyPart[] = [
      { type: "reasoning", text: "thinking" },
      { type: "reasoning", text: "more" },
      { type: "tool-webSearch", toolCallId: "1", state: "output-available", input: {}, output: [] },
      { type: "text", text: "answer" },
      { type: "step-start" },
    ];
    const segments = getSegmentedParts(parts);

    expect(segments.map((s) => s.type)).toEqual(["reasoning", "tool", "text"]);
    expect(segments[0]?.parts).toHaveLength(2);
  });

  test("keeps a dynamic tool part in place between two texts", () => {
    const dynamicTool: ToolPart = {
      type: "dynamic-tool",
      toolName: "mcpLookup",
      toolCallId: "1",
      state: "output-available",
      input: {},
      output: {},
    };
    const segments = getSegmentedParts([
      { type: "text", text: "before" },
      dynamicTool,
      { type: "text", text: "after" },
    ]);

    expect(segments.map((s) => s.type)).toEqual(["text", "tool", "text"]);
    expect(segments[1]?.parts).toEqual([dynamicTool]);
  });

  test("groups a dynamic tool with the static tool next to it", () => {
    const segments = getSegmentedParts([
      { type: "tool-webSearch", toolCallId: "1", state: "input-available", input: {} },
      {
        type: "dynamic-tool",
        toolName: "mcpLookup",
        toolCallId: "2",
        state: "input-available",
        input: {},
      },
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.parts).toHaveLength(2);
  });
});

describe("getToolCallInfo", () => {
  const call = { type: "tool-deploy", toolCallId: "1", input: {} } as const;

  test("a tool waiting for approval is pending, not complete", () => {
    const info = getToolCallInfo({
      ...call,
      state: "approval-requested",
      approval: { id: "a1" },
    });

    expect(info).toMatchObject({ status: "pending", label: "Running deploy", errorText: null });
  });

  test("an approved tool that hasn't run yet is active", () => {
    const info = getToolCallInfo({
      ...call,
      state: "approval-responded",
      approval: { id: "a1", approved: true },
    });

    expect(info.status).toBe("active");
  });

  test("a denied tool is an error that shows the reason", () => {
    const denied = { ...call, state: "output-denied" } as const;

    expect(
      getToolCallInfo({ ...denied, approval: { id: "a1", approved: false, reason: "Not now" } }),
    ).toMatchObject({ status: "error", label: "Running deploy", errorText: "Not now" });
    expect(getToolCallInfo({ ...denied, approval: { id: "a1", approved: false } }).errorText).toBe(
      "Tool call denied",
    );
  });

  test("the four older states keep their status", () => {
    const statusOf = (part: ToolPart) => getToolCallInfo(part).status;

    expect(statusOf({ ...call, state: "input-streaming" })).toBe("active");
    expect(statusOf({ ...call, state: "input-available" })).toBe("active");
    expect(statusOf({ ...call, state: "output-available", output: {} })).toBe("complete");
    expect(statusOf({ ...call, state: "output-error", errorText: "boom" })).toBe("error");
  });

  test("a dynamic tool is labelled by its tool name", () => {
    const info = getToolCallInfo(
      {
        type: "dynamic-tool",
        toolName: "mcpLookup",
        toolCallId: "1",
        state: "output-available",
        input: { query: "docs" },
        output: { summary: "Found 2 pages" },
      },
      { mcpLookup: { active: () => "Looking up", complete: (i) => `Looked up ${i.query}` } },
    );

    expect(info).toMatchObject({
      status: "complete",
      label: "Looked up docs",
      summary: "Found 2 pages",
    });
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
