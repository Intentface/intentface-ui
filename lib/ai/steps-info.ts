// Tool-part → timeline-step derivation. This is the app's contract with its
// own backend tools (the webSearch findings shape, the askUser output JSON),
// so it lives in the app, not the generic Steps primitive.

import { isToolPart, type ToolPart, type UnknownPart } from "@intentface/ui/types";
import type { ToolLabels } from "@/lib/ai/tool-labels";
import type { Question, QuestionsInput, StepStatus } from "@/lib/ai/types";

// ---------------------------------------------------------------------------
// Question extraction — this app's askUser tool: its part type name, input
// schema, and output JSON format. Moved here from the package, which now ships
// only the generic ToolPart contract.
// ---------------------------------------------------------------------------

/** A single answered question exchange with parsed questions and answers. */
export type AnsweredQuestions = {
  toolCallId: string;
  questions: Question[];
  answers: Record<string, string>;
};

/** Question tool call info for a message. */
export type QuestionsInfo = {
  /** True when at least one askUser tool call is waiting for user input. */
  isAwaitingInput: boolean;
  /** Answered question exchanges with parsed Q&A pairs. */
  answered: AnsweredQuestions[];
};

/**
 * Extracts askUser tool parts and returns structured info: whether any are
 * awaiting input, and parsed Q&A pairs for answered ones.
 */
export const getQuestionsInfo = (allParts: readonly UnknownPart[]): QuestionsInfo => {
  const parts = allParts.filter(
    (p): p is ToolPart =>
      isToolPart(p) &&
      p.type === "tool-askUser" &&
      (p.state === "input-available" || p.state === "output-available"),
  );

  const answered: AnsweredQuestions[] = parts
    .filter((p) => p.state === "output-available")
    .map((p) => {
      const input = p.input as QuestionsInput | undefined;
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
  /** Present only when the tool failed (state "output-error"). */
  errorText: string | null;
  sources: { url: string; title: string; domain: string }[];
};

export const getToolCallInfo = (part: ToolPart, labels: ToolLabels = {}): ToolCallInfo => {
  const input = (part.input as Record<string, unknown>) ?? {};
  const isActive = part.state === "input-streaming" || part.state === "input-available";
  const isComplete = part.state === "output-available";
  const isError = part.state === "output-error";
  const name = part.type.replace("tool-", "");

  const labelConfig = labels[name];
  const label = labelConfig
    ? isActive
      ? labelConfig.active(input)
      : labelConfig.complete(input)
    : isActive
      ? `Running ${name}`
      : `Ran ${name}`;

  const status: StepStatus = isError
    ? "error"
    : isActive
      ? "active"
      : isComplete
        ? "complete"
        : "pending";

  const errorText = isError ? (part.errorText ?? "Tool call failed") : null;

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

export type QuestionsStepInfo = {
  label: string;
  status: StepStatus;
  questions: Question[];
  answers: Record<string, string>;
  isComplete: boolean;
};

export const getQuestionsStepInfo = (part: ToolPart): QuestionsStepInfo => {
  const isComplete = part.state === "output-available";
  const input = part.input as QuestionsInput | undefined;
  const questions: Question[] = input?.questions ?? [];

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
