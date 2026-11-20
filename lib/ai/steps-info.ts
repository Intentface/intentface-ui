// Tool-part → timeline-step derivation. This is the app's contract with its
// own backend tools (the webSearch findings shape, the askUser output JSON),
// so it lives in the app, not the generic Steps primitive.

import { getToolName, isToolUIPart } from "ai";
import type { ToolLabels } from "@/lib/ai/tool-labels";
import type { AnyPart, AskUserInput, AskUserQuestion, StepStatus, ToolPart } from "@/lib/ai/types";

// ---------------------------------------------------------------------------
// Ask-user extraction — this app's askUser tool: its part type name, input
// schema, and output JSON format.
// ---------------------------------------------------------------------------

/** A single answered ask-user exchange with parsed questions and answers. */
export type AskUserAnswered = {
  toolCallId: string;
  questions: AskUserQuestion[];
  answers: Record<string, string>;
};

/** Ask-user tool call info for a message. */
export type AskUserInfo = {
  /** True when at least one ask-user tool is waiting for user input. */
  isAwaitingInput: boolean;
  /** Answered ask-user exchanges with parsed Q&A pairs. */
  answered: AskUserAnswered[];
};

/**
 * Extracts askUser tool parts and returns structured info: whether any are
 * awaiting input, and parsed Q&A pairs for answered ones.
 */
export const getAskUserInfo = (allParts: readonly AnyPart[]): AskUserInfo => {
  const parts = allParts.filter(
    (p): p is ToolPart =>
      isToolUIPart(p) &&
      p.type === "tool-askUser" &&
      (p.state === "input-available" || p.state === "output-available"),
  );

  const answered: AskUserAnswered[] = parts
    .filter((p) => p.state === "output-available")
    .map((p) => {
      const input = p.input as AskUserInput | undefined;
      let answers: Record<string, string> = {};
      try {
        answers = JSON.parse(p.output as string) as Record<string, string>;
      } catch (error) {
        console.error("Failed to parse askUser output", {
          output: p.output,
          error,
        });
      }
      return {
        toolCallId: p.toolCallId,
        questions: input?.questions ?? [],
        answers,
      };
    });

  return {
    isAwaitingInput: parts.some((p) => p.state === "input-available"),
    answered,
  };
};

type WebSearchFinding = {
  claim: string;
  sources: { url: string; title: string }[];
};

export type ToolCallInfo = {
  label: string;
  status: StepStatus;
  summary: string | null;
  /** Present only when the tool failed or was denied. */
  errorText: string | null;
  sources: { url: string; title: string; domain: string }[];
};

// Every tool state has a status here, so a state the AI SDK adds fails the
// typecheck instead of reaching `Steps.Item` as `undefined`, which shows as
// complete. A tool waiting for approval hasn't started, and a denied one never ran.
const TOOL_STEP_STATUS = {
  "input-streaming": "active",
  "input-available": "active",
  "approval-requested": "pending",
  "approval-responded": "active",
  "output-available": "complete",
  "output-error": "error",
  "output-denied": "error",
} satisfies Record<ToolPart["state"], StepStatus>;

export const getToolCallInfo = (part: ToolPart, labels: ToolLabels = {}): ToolCallInfo => {
  const input = (part.input as Record<string, unknown>) ?? {};
  const isComplete = part.state === "output-available";
  // Only a tool that ran gets the past-tense label.
  const hasRun = isComplete || part.state === "output-error";
  const name = getToolName(part);

  const labelConfig = labels[name];
  const label = labelConfig
    ? hasRun
      ? labelConfig.complete(input)
      : labelConfig.active(input)
    : hasRun
      ? `Ran ${name}`
      : `Running ${name}`;

  const status: StepStatus = TOOL_STEP_STATUS[part.state];

  const errorText =
    part.state === "output-error"
      ? (part.errorText ?? "Tool call failed")
      : part.state === "output-denied"
        ? (part.approval.reason ?? "Tool call denied")
        : null;

  // Extract summary from tool output
  const output = isComplete ? (part.output as Record<string, unknown>) : null;
  const summary = typeof output?.summary === "string" ? output.summary : null;

  // Flatten sources from web search findings
  const rawOutput = isComplete && part.type === "tool-webSearch" ? part.output : null;
  const findings = Array.isArray(rawOutput) ? (rawOutput as WebSearchFinding[]) : [];
  const sources = findings
    .flatMap((f) => f.sources)
    .map((s) => {
      try {
        return { ...s, domain: new URL(s.url).hostname.replace(/^www\./, "") };
      } catch {
        return { ...s, domain: s.title };
      }
    });

  return { label, status, summary, errorText, sources };
};

export type AskUserStepInfo = {
  label: string;
  status: StepStatus;
  questions: AskUserQuestion[];
  answers: Record<string, string>;
  isComplete: boolean;
};

export const getAskUserStepInfo = (part: ToolPart): AskUserStepInfo => {
  const isComplete = part.state === "output-available";
  const input = part.input as AskUserInput | undefined;
  const questions: AskUserQuestion[] = input?.questions ?? [];

  let answers: Record<string, string> = {};
  if (isComplete) {
    try {
      answers = JSON.parse(part.output as string) as Record<string, string>;
    } catch (error) {
      console.error("Failed to parse askUser output", { output: part.output, error });
    }
  }

  const count = questions.length;
  const noun = count === 1 ? "question" : "questions";
  // Awaiting the user's answer vs already answered — don't claim "Answered" while the
  // prompt is still open.
  const label = isComplete ? `Answered ${count} ${noun}` : `Asked ${count} ${noun}`;

  return { label, status: isComplete ? "complete" : "active", questions, answers, isComplete };
};
