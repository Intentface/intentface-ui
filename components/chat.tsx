"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import {
  getFileParts,
  getSegmentedParts,
  getTextInfo,
  groupTurns,
  type MessageSegment,
} from "@intentface/ui/message-utils";
import type { ToolPart } from "@intentface/ui/types";
import {
  Brain,
  Check,
  ChevronDown,
  Circle,
  CircleQuestion,
  Quote,
  RefreshCw,
  TriangleAlert,
  X,
} from "@keyline-icons/react";
// Keyline has no sandbox icon, so this one stays on Tabler.
import { IconSandbox } from "@tabler/icons-react";
import type { ChatStatus } from "ai";
import { AnimatePresence, stagger } from "motion/react";
import * as m from "motion/react-m";
import { useRouter } from "next/navigation";
import {
  Children,
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type CommandItemData,
  Composer,
  type ComposerCommandsMap,
  type ComposerQuestion,
  type ComposerSubmitData,
} from "@/components/ai/composer";
import { GeneratedUi } from "@/components/ai/generated-ui";
import { Message } from "@/components/ai/message";
import { Reasoning } from "@/components/ai/reasoning";
import { Steps } from "@/components/ai/steps";
import { Thread } from "@/components/ai/thread";
import { ActiveTools, ToolsMenu } from "@/components/composer-tools";
import { Header } from "@/components/header";
import { ModelSelector } from "@/components/model-selector";
import { PlaygroundSettings } from "@/components/playground-settings";
import { Markdown } from "@/components/ui/markdown";
import { useChatInstance } from "@/hooks/use-chat-instance";
import { useThrottledText } from "@/hooks/use-throttled-text";
import { prepareAttachmentsForSend } from "@/lib/ai/attachments";
import {
  getChainInfo,
  getReasoningInfo,
  getSourcesInfo,
  splitReasoningByHeaders,
} from "@/lib/ai/message-info";
import { getQuestionsInfo, getQuestionsStepInfo, getToolCallInfo } from "@/lib/ai/steps-info";
import { DEFAULT_TOOL_LABELS } from "@/lib/ai/tool-labels";
import type { AppPart, AppUIMessage, Question, StepStatus } from "@/lib/ai/types";
import { applyStopToMessages } from "@/lib/chat-instance";
import { fetchPlaygroundIssues, GroupedIssueCommands } from "@/lib/playground-demo";
import { useChatStore } from "@/lib/store/chat";
import { useModelStore } from "@/lib/store/model";
import { usePlaygroundStore } from "@/lib/store/playground";
import { useSettingsStore } from "@/lib/store/settings";
import { cn } from "@/lib/utils";
import { LogoTile } from "./icons/logo-tile";
import { TextShimmer } from "./ui/text-shimmer";

type ChatSelection = {
  id: string;
  text: string;
};

// Split contexts: the session value changes rarely (selection edits, the
// isEmpty flip) while the messages value changes on every stream chunk.
// Keeping them apart means the composer and layout chrome never re-render per
// token — only ChatMessages and the thin composer bridge subscribe to the
// volatile side.
type ChatSessionValue = {
  chatId: string;
  /** True until the first message exists — flips once per chat. */
  isEmpty: boolean;
  sendMessage: UseChatHelpers<AppUIMessage>["sendMessage"];
  regenerate: UseChatHelpers<AppUIMessage>["regenerate"];
  stop: UseChatHelpers<AppUIMessage>["stop"];
  setMessages: UseChatHelpers<AppUIMessage>["setMessages"];
  addToolOutput: UseChatHelpers<AppUIMessage>["addToolOutput"];
  /** Last request failure, if any — the composer surfaces the missing-key case. */
  error: UseChatHelpers<AppUIMessage>["error"];
  selections: ChatSelection[];
  addSelection: (text: string) => void;
  clearSelections: () => void;
};

type ChatMessagesValue = {
  messages: AppUIMessage[];
  status: ChatStatus;
};

const ChatSessionContext = createContext<ChatSessionValue | null>(null);
const ChatMessagesContext = createContext<ChatMessagesValue | null>(null);

export const useChatSession = (): ChatSessionValue => {
  const ctx = use(ChatSessionContext);
  if (!ctx) {
    throw new Error("useChatSession must be used within a <Chat> provider");
  }
  return ctx;
};

export const useChatMessages = (): ChatMessagesValue => {
  const ctx = use(ChatMessagesContext);
  if (!ctx) {
    throw new Error("useChatMessages must be used within a <Chat> provider");
  }
  return ctx;
};

// ---------------------------------------------------------------------------
// InterleavedSteps — renders reasoning + tools chronologically
// ---------------------------------------------------------------------------

type IconComponent = React.ComponentType<{ className?: string }>;

const statusIcons: Record<StepStatus, IconComponent> = {
  complete: Check,
  active: Circle,
  pending: Circle,
  error: TriangleAlert,
};

// A timeline row: static when it has no detail, collapsible (icon morphs to a
// chevron) when it does. App-owned — composed over the Steps primitive.
const TimelineStep = ({
  label,
  status = "complete",
  icon,
  children,
}: {
  label: string;
  status?: StepStatus;
  icon?: IconComponent;
  children?: React.ReactNode;
}) => {
  const Icon = icon ?? statusIcons[status];
  const hasDetail = Children.toArray(children).length > 0;

  const iconClasses = cn(
    status === "complete" && "text-ink-secondary",
    status === "active" && "text-ink-primary",
    status === "pending" && "text-ink-tertiary",
    status === "error" && "text-red-500",
  );
  const labelClasses = cn(
    "text-sm text-left",
    status === "active" && "text-ink-primary font-medium",
    status === "complete" && "text-ink-secondary",
    status === "pending" && "text-ink-tertiary",
    status === "error" && "text-red-500",
  );

  if (!hasDetail) {
    return (
      <Steps.Item status={status}>
        <div className="flex items-center gap-2 py-0.5">
          <span className={cn("flex size-4 shrink-0 items-center justify-center", iconClasses)}>
            <Icon className={cn("size-3.5", status === "active" && "animate-pulse")} />
          </span>
          <span className={labelClasses}>{label}</span>
        </div>
      </Steps.Item>
    );
  }

  return (
    <Steps.Item status={status}>
      <Steps.Trigger>
        <span
          className={cn("relative flex size-4 shrink-0 items-center justify-center", iconClasses)}
        >
          <span className="transition-opacity group-hover/steps-trigger:opacity-0 group-data-open/steps-trigger:opacity-0">
            <Icon className={cn("size-3.5", status === "active" && "animate-pulse")} />
          </span>
          <ChevronDown className="absolute size-4 opacity-0 transition-[opacity,rotate] group-hover/steps-trigger:opacity-100 group-data-open/steps-trigger:rotate-180 group-data-open/steps-trigger:opacity-100" />
        </span>
        <span className={labelClasses}>{label}</span>
      </Steps.Trigger>
      <Steps.Panel>{children}</Steps.Panel>
    </Steps.Item>
  );
};

const TimelineToolCall = ({ part }: { part: ToolPart }) => {
  const { label, status, summary, errorText, sources } = getToolCallInfo(part, DEFAULT_TOOL_LABELS);

  return (
    <TimelineStep label={label} status={status}>
      {errorText && <span className="text-xs text-red-500">{errorText}</span>}
      {summary && <span className="text-xs text-ink-secondary">{summary}</span>}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((source, index) => (
            <span
              key={index}
              className="inline-flex h-6 items-center rounded-full bg-raised px-2 font-medium text-ink-secondary text-xs shadow-raised"
            >
              {source.domain}
            </span>
          ))}
        </div>
      )}
    </TimelineStep>
  );
};

const TimelineQuestions = ({ part }: { part: ToolPart }) => {
  const { label, status, questions, answers, isComplete } = getQuestionsStepInfo(part);

  return (
    <TimelineStep label={label} status={status} icon={CircleQuestion}>
      <div className="flex flex-col gap-1.5">
        {questions.map((q) => (
          <div key={q.question} className="flex flex-col gap-0.5">
            <span className="text-xs font-medium leading-tight text-ink-primary">{q.question}</span>
            {isComplete && (
              <span className="text-xs leading-tight text-ink-secondary">
                {answers[q.question] ?? "—"}
              </span>
            )}
          </div>
        ))}
      </div>
    </TimelineStep>
  );
};

const InterleavedSteps = ({
  segments,
  isStreaming,
  awaitingInput = false,
}: {
  segments: MessageSegment[];
  isStreaming: boolean;
  // Open questions mean the turn is paused, not finished — keep the block
  // in its active state (cycling header, open) rather than the "done" summary.
  awaitingInput?: boolean;
}) => {
  const isActive = isStreaming || awaitingInput;
  const { toolCount, questionCount } = segments.reduce(
    (acc, s) => {
      if (s.type !== "tool") return acc;
      for (const p of s.parts) {
        if (p.type === "tool-askUser") {
          const input = p.input as { questions?: unknown[] } | undefined;
          acc.questionCount += input?.questions?.length ?? 0;
        } else {
          acc.toolCount++;
        }
      }
      return acc;
    },
    { toolCount: 0, questionCount: 0 },
  );

  // Track duration like Reasoning does
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isStreaming) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
    } else if (startTimeRef.current !== null) {
      setDuration(Math.ceil((Date.now() - startTimeRef.current) / 1000));
      startTimeRef.current = null;
    }
  }, [isStreaming]);

  const suffixes: string[] = [];
  if (toolCount > 0) suffixes.push(`used ${toolCount} tool${toolCount !== 1 ? "s" : ""}`);
  if (questionCount > 0)
    suffixes.push(`asked ${questionCount} question${questionCount !== 1 ? "s" : ""}`);
  const suffix = suffixes.length > 0 ? `, ${suffixes.join(", ")}` : "";

  // While streaming the header cycles to the running tool's label — falling back to the
  // last tool between rounds so it never drops back to "Thinking" once tools start —
  // throttled so fast tools don't flicker. The header narrates what's happening *now*,
  // so even the between-rounds fallback (a completed tool) keeps its present-tense form
  // ("Searching the web"), never the row's past-tense label ("Ran webSearch").
  const toolParts = segments.flatMap((s) => (s.type === "tool" ? s.parts : []));
  const runningTool = toolParts.find(
    (p) => p.state === "input-streaming" || p.state === "input-available",
  );
  const activeTool = runningTool ?? toolParts.at(-1);
  const askingCount =
    activeTool?.type === "tool-askUser"
      ? (((activeTool.input as { questions?: unknown[] } | undefined)?.questions ?? []).length ?? 0)
      : 0;
  const activeToolName = activeTool?.type.replace("tool-", "") ?? "";
  const activeToolConfig = DEFAULT_TOOL_LABELS[activeToolName];
  const streamingLabel = !activeTool
    ? "Thinking..."
    : activeTool.type === "tool-askUser"
      ? `Asking ${askingCount === 1 ? "question" : "questions"}`
      : (activeToolConfig?.active((activeTool.input as Record<string, unknown>) ?? {}) ??
        `Running ${activeToolName}`);
  // Hold each label past the roll animation (300ms) so a fast tool sequence reads as a
  // calm loop instead of overlapping mid-roll swaps.
  const shownLabel = useThrottledText(streamingLabel, 800);

  // Open while active, auto-collapse when done — but a user toggle wins from then on.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? isActive;

  const doneLabel = `Thought for ${
    duration === undefined
      ? "a few seconds"
      : `${duration} ${duration === 1 ? "second" : "seconds"}`
  }${suffix}`;
  const displayLabel = isActive ? shownLabel : doneLabel;

  // One rolling label for both states — the box never changes when the stream ends, so
  // there's no layout shift: the last active label just rolls out and the summary rolls in
  // (roll matches the composer placeholder / TextLoop; shimmer only while active).
  const header = (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span
        key={displayLabel}
        initial={{ opacity: 0, y: "100%", filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: "-100%", filter: "blur(4px)" }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="block"
      >
        {isActive ? <TextShimmer>{displayLabel}</TextShimmer> : displayLabel}
      </m.span>
    </AnimatePresence>
  );

  // Text-only turn (no reasoning/tools) — keep the status header, but there's nothing
  // to expand, so render it as a static line (no chevron, no disclosure).
  if (segments.length === 0) {
    return (
      <div className="flex w-full items-center py-1 text-ink-secondary text-sm">
        <span className="overflow-hidden text-left">{header}</span>
      </div>
    );
  }

  return (
    <Steps>
      <Steps.Item open={open} onOpenChange={setUserOpen}>
        <Steps.Trigger>
          <span className="overflow-hidden text-left">{header}</span>
          <ChevronDown className="size-4 shrink-0 transition-transform group-data-open/steps-trigger:rotate-180" />
        </Steps.Trigger>
        <Steps.Panel>
          {segments.map((seg, i) => {
            if (seg.type === "reasoning") {
              const text = seg.parts.map((p) => p.text).join("");
              const lastPart = seg.parts.at(-1);
              const streaming = isActive && lastPart === segments.at(-1);

              const sections = splitReasoningByHeaders([text]);

              return sections.map((section, j) => (
                <TimelineStep
                  key={`r-${i}-${j}`}
                  label={section.header ?? "Thinking"}
                  status={streaming && j === sections.length - 1 ? "active" : "complete"}
                  icon={Brain}
                >
                  {section.body && (
                    <Markdown className="text-sm leading-tight text-ink-secondary [&_p]:mb-0">
                      {section.body}
                    </Markdown>
                  )}
                </TimelineStep>
              ));
            }
            if (seg.type === "tool") {
              return seg.parts.map((part, j) =>
                part.type === "tool-askUser" ? (
                  <TimelineQuestions key={`a-${i}-${j}`} part={part} />
                ) : (
                  <TimelineToolCall key={`t-${i}-${j}`} part={part} />
                ),
              );
            }
            return null;
          })}
        </Steps.Panel>
      </Steps.Item>
    </Steps>
  );
};

type ChatMessageItemProps = {
  message: AppUIMessage;
  isLast: boolean;
  /** This message is the one currently streaming. */
  isStreaming: boolean;
  isError: boolean;
  skipAnimation: boolean;
};

// Memoized row boundary: finished messages keep their object identity across
// stream chunks, so every row except the streaming one bails here and the
// segmentation below runs once per chunk, not once per message. Do not spread
// the message object at the call site — a fresh object defeats the memo.
const ChatMessageItem = memo(
  ({ message, isLast, isStreaming, isError, skipAnimation }: ChatMessageItemProps) => {
    const { regenerate, addSelection } = useChatSession();
    const showSources = useSettingsStore((state) => state.showSources);
    const showActions = useSettingsStore((state) => state.showActions);
    const { parts } = message;
    const isAssistant = message.role === "assistant";
    const isUser = message.role === "user";

    const segments = getSegmentedParts(parts);
    const textInfo = getTextInfo(segments);
    const fileParts = getFileParts(segments);
    const chain = getChainInfo(segments);
    const reasoning = chain.onlyReasoning ? getReasoningInfo(segments, isStreaming) : null;
    const questionsInfo = getQuestionsInfo(parts);
    const sourcesInfo = isAssistant ? getSourcesInfo(parts) : null;

    // Every assistant turn keeps a status block, so it never appears-then-vanishes. A
    // finished reasoning-only turn uses the dedicated Reasoning disclosure; every other
    // assistant turn — streaming, tools, questions, or a plain text reply — uses
    // InterleavedSteps, which shows a "Thought for Xs" header even with an empty timeline.
    const isReasoningOnlyDone =
      isAssistant && !isStreaming && !chain.hasTools && !!reasoning && reasoning.parts.length > 0;

    const shouldShowReasoning = isReasoningOnlyDone;
    const shouldShowInterleavedReasoning = isAssistant && !isReasoningOnlyDone;

    return (
      <Message
        role={message.role}
        isError={isError}
        isLast={isLast}
        {...(skipAnimation && { initial: false })}
      >
        {/* File attachments */}
        {isUser && fileParts.length > 0 && (
          <Message.Attachments>
            {fileParts.map((part, i) => (
              <Message.Attachment key={i} attachment={part} />
            ))}
          </Message.Attachments>
        )}

        {/* Standalone reasoning (no tools) — suppress when panel handles it */}
        {shouldShowReasoning && (
          <Reasoning isStreaming={reasoning.isStreaming}>
            <Reasoning.Trigger label={reasoning.headers} />
            <Reasoning.Content>{reasoning.texts}</Reasoning.Content>
          </Reasoning>
        )}

        {/* Interleaved reasoning + tool chain — suppress when panel handles it */}
        {shouldShowInterleavedReasoning && (
          <InterleavedSteps
            segments={chain.segments}
            isStreaming={isStreaming}
            awaitingInput={questionsInfo.isAwaitingInput}
          />
        )}

        {/* Message content */}
        <Message.Content>
          {parts.map((part, index) => {
            switch (part.type) {
              case "text": {
                // Hide intermediate text between tool calls — only
                // show text that appears after the last tool/reasoning part.
                if (chain.hasTools) {
                  const lastChainIdx = parts.findLastIndex(
                    (p) =>
                      p.type === "reasoning" ||
                      (p.type.startsWith("tool-") && p.type !== "tool-askUser"),
                  );
                  if (index <= lastChainIdx) return null;
                }
                if (isUser) {
                  return <Message.Text key={index}>{part.text}</Message.Text>;
                }
                return <Message.Markdown key={index}>{part.text}</Message.Markdown>;
              }
              case "tool-renderUi":
                return <GeneratedUi key={part.toolCallId} part={part} />;
              default:
                return null;
            }
          })}
        </Message.Content>

        {/* Selection → context affordance (assistant text only) */}
        {isAssistant && <Message.Selection onAdd={addSelection} />}

        {/* Source URL pills */}
        {showSources && sourcesInfo?.hasSources && (
          <Message.Sources>
            {sourcesInfo.sources.map((source) => (
              <Message.Source key={source.domain} url={source.url} domain={source.domain} />
            ))}
          </Message.Sources>
        )}

        {/* Stopped marker — assistant turn the user aborted mid-stream */}
        {isAssistant && message.metadata?.stopped && <Message.Stopped />}

        {/* Actions — hide while waiting for tool input */}
        {showActions && !questionsInfo.isAwaitingInput && (
          <Message.Actions>
            {isAssistant && (
              <Message.Action
                onClick={() => regenerate({ messageId: message.id })}
                tooltip="Regenerate"
              >
                <RefreshCw />
              </Message.Action>
            )}
            <Message.Copy value={textInfo.text} />
          </Message.Actions>
        )}
      </Message>
    );
  },
);

ChatMessageItem.displayName = "ChatMessageItem";

// The transport surfaces the failed response's body as the error message, so a
// JSON error payload arrives here as a string. Prefer its `message` field so the
// reader gets the sentence the route wrote, not the envelope around it.
const readableError = (error: Error | undefined) => {
  if (!error) return "Something went wrong.";
  // The one failure with a known cause and a known fix, matched on the sentinel
  // so the copy holds however the transport wraps the body.
  if (error.message.includes("missing-api-key")) {
    return "Add your OpenAI API key in playground settings, top right, to start chatting.";
  }
  try {
    const parsed = JSON.parse(error.message);
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // Not JSON — the raw message is the best we have.
  }
  return error.message || "Something went wrong.";
};

const ChatMessages = () => {
  const { messages, status } = useChatMessages();
  const { error, regenerate } = useChatSession();
  const stickyMessages = useSettingsStore((s) => s.stickyMessages);
  const isError = status === "error";
  const isStreaming = status === "streaming";

  // Track messages present at mount — skip entrance animation for these. Lazy:
  // this component renders per stream chunk, and the set is only built once.
  const [initialMessageIds] = useState(() => new Set(messages.map((message) => message.id)));

  const turns = groupTurns(messages);
  const lastMessageId = messages.at(-1)?.id;

  return (
    <>
      {turns.map((turn, turnIndex) => (
        <Message.Turn key={turn.key} sticky={stickyMessages}>
          {turn.messages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              isLast={message.id === lastMessageId}
              isStreaming={message.id === lastMessageId && isStreaming}
              isError={isError}
              skipAnimation={initialMessageIds.has(message.id)}
            />
          ))}
          {turnIndex === turns.length - 1 && isError && (
            <Message.Error>
              {readableError(error)}{" "}
              <button
                type="button"
                onClick={() => regenerate()}
                className="underline underline-offset-2 hover:no-underline"
              >
                Try again
              </button>
            </Message.Error>
          )}
        </Message.Turn>
      ))}
      {/* Loading indicator — suppress when panel handles it */}
      {/* {isLoading && panelState.type !== "loading" && (
        <Reasoning isStreaming>
          <Reasoning.Trigger />
        </Reasoning>
      )} */}
    </>
  );
};

const MENTION_ITEMS: CommandItemData[] = [
  {
    value: "quarterly-report",
    label: "Q4 Quarterly Report",
    icon: "fileChart",
  },
  {
    value: "meeting-notes",
    label: "Meeting Notes - March 2026",
    icon: "fileText",
  },
  {
    value: "product-roadmap",
    label: "Product Roadmap",
    icon: "map",
  },
  {
    value: "brand-guidelines",
    label: "Brand Guidelines",
    icon: "fileText",
  },
  {
    value: "api-documentation",
    label: "API Documentation",
    icon: "code",
  },
  {
    value: "screenshot-dashboard",
    label: "Screenshot - Dashboard",
    icon: "imageAlt",
  },
  {
    value: "wireframe-checkout",
    label: "Wireframe - Checkout Flow",
    icon: "imageAlt",
  },
];

// This app's composer panel-state union: idle, or the questions arm for its
// askUser tool. (Tool/step status moved to the assistant message.)
type QuestionsPanelState = {
  type: "questions";
  toolCallId: string;
  questions: Question[];
};

type AppComposerPanelState = { type: "idle" } | QuestionsPanelState;

// Stable idle reference so ChatInputInner's memo bails when nothing transitioned.
const IDLE_PANEL_STATE: AppComposerPanelState = { type: "idle" };

// App overlay: routes the composer panel to the questions while this app's askUser
// tool awaits input. Detection runs on ready AND streaming — the chat goes
// "ready" while the tool waits. Referentially stable so the memoized inner
// composer bails per stream chunk.
const useQuestionsPanelState = (
  messages: readonly AppUIMessage[],
  status: ChatStatus,
): QuestionsPanelState | null => {
  const lastAssistant =
    status === "ready" || status === "streaming"
      ? messages.findLast((message) => message.role === "assistant")
      : undefined;
  const part = lastAssistant?.parts.find(
    (p): p is Extract<AppPart<"tool-askUser">, { state: "input-available" }> =>
      p.type === "tool-askUser" && p.state === "input-available",
  );

  const next = part
    ? {
        type: "questions" as const,
        toolCallId: part.toolCallId,
        questions: part.input.questions,
      }
    : null;

  // Keep the first object seen for a tool call, so the result stays
  // referentially stable while it waits. State adjusted during render rather
  // than a ref written in it: it changes only when the tool call does.
  const [current, setCurrent] = useState(next);
  if (current?.toolCallId !== next?.toolCallId) {
    setCurrent(next);
    return next;
  }
  return current;
};

// Thin bridge — the only composer piece that re-renders per stream chunk. It derives
// the questions panel state (referentially stable while nothing transitioned) so the
// memoized inner composer bails unless the panel actually changed. Idle otherwise —
// tool/step status now renders in the assistant message.
const ChatInput = () => {
  const { messages, status } = useChatMessages();
  const questionsPanelState = useQuestionsPanelState(messages, status);
  return <ChatInputInner panelState={questionsPanelState ?? IDLE_PANEL_STATE} status={status} />;
};

type ChatInputInnerProps = {
  panelState: AppComposerPanelState;
  status: ChatStatus;
};

const ChatInputInner = memo(({ panelState, status }: ChatInputInnerProps) => {
  const {
    chatId,
    isEmpty,
    sendMessage,
    stop,
    setMessages,
    addToolOutput,
    selections,
    clearSelections,
  } = useChatSession();
  const router = useRouter();
  const isGenerating = status === "submitted" || status === "streaming";

  // Mark the in-flight turn stopped (or drop it if empty) in-memory for an
  // instant marker, then abort. onFinish re-applies the same transform when it
  // persists, so the saved copy matches regardless of ordering.
  const handleStop = useCallback(() => {
    setMessages((previous) => applyStopToMessages(previous));
    stop();
  }, [setMessages, stop]);
  const createChat = useChatStore((state) => state.createChat);
  const { model, setModel } = useModelStore();
  const [isSending, setIsSending] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const isNewChat = isEmpty;

  // Playground knobs: which command prefixes mount, ghost suggestions, the
  // command surface, the submit chord (persisted config) — plus the ephemeral
  // demo state (injected demo questions, the workspace-files context strip).
  const commandToggles = useSettingsStore((state) => state.commands);
  const suggestions = useSettingsStore((state) => state.suggestions);
  const commandSurface = useSettingsStore((state) => state.commandSurface);
  const submitOn = useSettingsStore((state) => state.submitOn);
  const loopingPlaceholder = useSettingsStore((state) => state.loopingPlaceholder);
  const demoQuestions = usePlaygroundStore((state) => state.demoQuestions);
  const setDemoQuestions = usePlaygroundStore((state) => state.setDemoQuestions);
  const showContextStrip = usePlaygroundStore((state) => state.showContextStrip);

  // Tool toggles (web search, thinking) are app state, not the composer's —
  // we own them here and feed them into the request body at submit time.
  const [toolValues, setToolValues] = useState<Record<string, boolean>>({});
  const setTool = useCallback((name: string, value: boolean) => {
    setToolValues((previous) => ({ ...previous, [name]: value }));
  }, []);

  const commandItems = useMemo<CommandItemData[]>(
    () => [
      {
        value: "webSearch",
        label: "Search the web",
        description: "Enable web search for this message",
        icon: "globe",
        keywords: "search web",
        onSelect: () => setTool("webSearch", true),
      },
      {
        value: "codeExecution",
        label: "Code Execution",
        description: "Run code snippets",
        icon: "code",
        keywords: "code run execute",
      },
      {
        value: "thinking",
        label: "Think deeply",
        description: "Enable extended thinking",
        icon: "brain",
        keywords: "think reasoning",
        onSelect: () => setTool("thinking", true),
      },
      {
        value: "summarize",
        label: "Summarize",
        description: "Summarize the conversation",
        icon: "bubbleWideSparkle",
        keywords: "summarize summary",
      },
    ],
    [setTool],
  );

  // The composer mounts only the prefixes the Composer card enables; the
  // ghost-suggestion flag rides along per config.
  const composerCommands = useMemo<ComposerCommandsMap>(() => {
    const map: ComposerCommandsMap = {};
    if (commandToggles.mentions) {
      map["@"] = {
        kind: "insert",
        trigger: "word-boundary",
        items: MENTION_ITEMS,
        suggestion: suggestions,
      };
    }
    if (commandToggles.slash) {
      map["/"] = {
        kind: "execute",
        trigger: "doc-start",
        items: commandItems,
        suggestion: suggestions,
      };
    }
    if (commandToggles.issues) {
      map["#"] = {
        kind: "insert",
        trigger: "word-boundary",
        items: fetchPlaygroundIssues,
        suggestion: suggestions,
      };
    }
    return map;
  }, [commandToggles, suggestions, commandItems]);

  const hasQuestions = panelState.type === "questions" || demoQuestions != null;
  const toolQuestions = panelState.type === "questions" ? panelState.questions : null;

  // Boundary map: tool questions carry no identity, so positional ids are
  // minted here. Memoized on the merged feed — setQuestions resets the machine
  // on any array identity change, so a fresh .map() per render would wipe
  // in-progress drafts.
  const activeQuestions = demoQuestions ?? toolQuestions;
  const composerQuestions = useMemo(
    () =>
      activeQuestions?.map(
        (question, index): ComposerQuestion => ({
          id: `q-${index}`,
          label: question.question,
          options: question.options,
          multiSelect: question.multiSelect,
        }),
      ),
    [activeQuestions],
  );

  const handleSubmit = useCallback(
    async (data: ComposerSubmitData) => {
      if (data.kind === "answers") {
        // Demo questions from the playground card: the flow completing IS the
        // demo — discard the entries and clear the injection.
        if (demoQuestions) {
          setDemoQuestions(null);
          return;
        }
        if (panelState.type !== "questions") return;
        // Project the flat entries back into the question→answer map the tool
        // output is read as (getQuestionsInfo / getQuestionsStepInfo). Ids resolve
        // through the minted questions; skipped entries stay absent.
        const answers: Record<string, string> = {};
        for (const entry of data.answers) {
          if (entry.selected.length === 0 && entry.text === undefined) continue;
          const label = composerQuestions?.find((question) => question.id === entry.id)?.label;
          if (!label) continue;
          answers[label] = [...entry.selected, entry.text].filter(Boolean).join(", ");
        }
        addToolOutput({
          tool: "askUser",
          toolCallId: panelState.toolCallId,
          output: JSON.stringify(answers),
        });
        return;
      }

      setIsSending(true);
      try {
        setHasSubmitted(true);

        if (isNewChat) {
          const title = data.text.slice(0, 50) || "New Chat";
          createChat(chatId, title);
          router.replace(`/chat/${chatId}`);
        }

        // Fold thread selections in as blockquote context above the question.
        const quoted = selections
          .map((selection) =>
            selection.text
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n"),
          )
          .join("\n\n");
        // Attachments-only submits arrive with empty text — this app's copy.
        const messageText = data.text || "Sent with attachments";
        const text = quoted ? `${quoted}\n\n${messageText}` : messageText;

        // The composer submits generic attachment items; adapt them to AI SDK
        // file parts (inlining blob URLs) at this app boundary.
        const fileParts = await prepareAttachmentsForSend(data.files);

        await sendMessage(
          {
            parts: [...fileParts, { type: "text", text }],
          },
          {
            body: {
              webSearch: toolValues.webSearch ?? false,
              thinking: toolValues.thinking ?? false,
            },
          },
        );
        clearSelections();
      } finally {
        setIsSending(false);
      }
    },
    [
      chatId,
      createChat,
      isNewChat,
      router,
      sendMessage,
      addToolOutput,
      panelState,
      composerQuestions,
      toolValues,
      selections,
      clearSelections,
      demoQuestions,
      setDemoQuestions,
    ],
  );

  return (
    <Composer
      onSubmit={handleSubmit}
      isSubmitting={isSending}
      commands={composerCommands}
      questions={composerQuestions}
    >
      <Composer.Panel>
        {(composer) => {
          // One at a time, by priority: an active command list wins, else the
          // composer's own question flow. (Tool/step status now lives in the
          // assistant message, not the composer.) With the popover surface
          // selected, the command list lifts out of the panel — questions
          // always stay in-flow.
          if (composer.commands.active && commandSurface === "panel") {
            return (
              <>
                <Composer.Commands prefix="@" />
                <Composer.Commands prefix="/" />
                <GroupedIssueCommands />
              </>
            );
          }
          if (composer.questions.active) return <Composer.Question />;
          return null;
        }}
      </Composer.Panel>
      {commandSurface === "popover" && (
        <Composer.Popover>
          {(composer) =>
            composer.commands.active ? (
              <>
                <Composer.Commands prefix="@" />
                <Composer.Commands prefix="/" />
                <GroupedIssueCommands />
              </>
            ) : null
          }
        </Composer.Popover>
      )}

      <Composer.ContextWindow>
        {showContextStrip && (
          <span data-slot="context-playground" className="inline-flex items-center gap-1.5">
            <IconSandbox className="size-[13px] text-ink-secondary" aria-hidden />
            Playground
          </span>
        )}
        {selections.length > 0 && (
          <div data-slot="chat-selections" className="flex items-center gap-1.5">
            <Quote className="size-[13px] text-ink-secondary" />
            <span>
              {selections.length} selection{selections.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              aria-label="Clear selections"
              className="cursor-pointer rounded-full p-0.5 text-ink-secondary hover:bg-ink-primary/6 hover:text-ink-primary"
              onClick={clearSelections}
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </Composer.ContextWindow>
      <Composer.Container>
        <Composer.Attachments />
        <Composer.Textarea autoFocus submitOn={submitOn}>
          <Composer.Placeholder
            placeholder={
              hasQuestions
                ? "Or type your own answer..."
                : !hasSubmitted
                  ? loopingPlaceholder
                    ? [
                        "Ask me anything...",
                        "Recall past conversations...",
                        "Search the web...",
                        "Generate a report...",
                        "Explain a concept...",
                        "Help with a project...",
                        "Give a tutorial...",
                        "Provide a recommendation...",
                        "Translate text...",
                        "Summarize a document...",
                        "Write a story...",
                        "Create a presentation...",
                      ]
                    : "Ask me anything..."
                  : "Ask a follow-up question..."
            }
          />
        </Composer.Textarea>
        {hasQuestions ? (
          <Composer.Actions className="flex items-center justify-end gap-2">
            <Composer.QuestionDismiss />
            <Composer.QuestionContinue />
          </Composer.Actions>
        ) : (
          <Composer.Actions className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <ToolsMenu tools={toolValues} onToolsChange={setToolValues} />
              <ModelSelector value={model} onValueChange={setModel} />
              <ActiveTools tools={toolValues} onToolsChange={setToolValues} />
            </div>
            <Composer.Submit isGenerating={isGenerating} onStop={handleStop} />
          </Composer.Actions>
        )}
      </Composer.Container>
    </Composer>
  );
});

ChatInputInner.displayName = "ChatInputInner";

const ChatPlaceholder = () => {
  const variants = {
    hidden: { opacity: 0, y: 8, filter: "blur(4px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)" },
  };

  return (
    <AnimatePresence>
      <m.div
        variants={variants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{
          duration: 0.5,
          ease: "easeOut",
          delayChildren: stagger(0.1, { from: "first", startDelay: 0.15 }),
        }}
        className="flex flex-col items-center justify-center gap-4"
      >
        <m.div variants={variants}>
          <LogoTile size="lg" />
        </m.div>
        <div className="flex flex-col items-center justify-center">
          <m.span
            variants={variants}
            className="font-semibold text-[20px] text-ink-primary leading-7 tracking-[-0.01em]"
          >
            Playground
          </m.span>
          <m.span variants={variants} className="text-ink-secondary text-md">
            Start a conversation
          </m.span>
        </div>
      </m.div>
    </AnimatePresence>
  );
};

// memo: ChatRoot re-renders on every stream chunk and re-creates this element;
// with no props the memo always bails, so the Thread chrome (header, overlays,
// composer dock) renders only when the session context actually changes.
const ChatDefaultLayout = memo(() => {
  const { isEmpty } = useChatSession();
  const scrollMode = useSettingsStore((s) => s.scrollMode);
  const showScrollButton = useSettingsStore((s) => s.showScrollButton);
  const showOverlays = useSettingsStore((s) => s.showOverlays);

  return (
    <>
      {/* Auto-scroll behavior is driven by the user's setting: "bottom" lands the
          newest turn at the bottom and follows, "jump" lands it at the top without
          following, "follow" lands at the top and follows, "off" disables it. */}
      {/* A row, so the settings card pushes the thread over instead of covering it. */}
      <div className="relative flex h-full min-h-0 w-full">
        <Thread autoScroll={scrollMode} className="min-w-0 flex-1">
          <Header />
          {showOverlays && <Thread.Overlay direction="top" />}
          <Thread.Viewport>
            {isEmpty ? (
              <Thread.Placeholder>
                <ChatPlaceholder />
              </Thread.Placeholder>
            ) : (
              <ChatMessages />
            )}
          </Thread.Viewport>
          <Thread.Composer>
            {showScrollButton && <Thread.ScrollButton />}
            <ChatInput />
          </Thread.Composer>
          {showOverlays && <Thread.Overlay direction="bottom" />}
        </Thread>
        {/* Rendered last so the settings come after the composer in tab order;
            the gear is positioned in the top-right regardless. */}
        <PlaygroundSettings />
      </div>
    </>
  );
});

ChatDefaultLayout.displayName = "ChatDefaultLayout";

type ChatProps = {
  chatId: string;
  children?: React.ReactNode;
};

const ChatRoot = ({ chatId, children }: ChatProps) => {
  const { messages, status, sendMessage, regenerate, stop, setMessages, addToolOutput, error } =
    useChatInstance(chatId);

  // Thread selections (Message.Selection) — chat-level state: written
  // from the messages, read by the composer input at submit time.
  const [selections, setSelections] = useState<ChatSelection[]>([]);
  const addSelection = useCallback((text: string) => {
    setSelections((previous) => [...previous, { id: crypto.randomUUID(), text }]);
  }, []);
  const clearSelections = useCallback(() => {
    setSelections([]);
  }, []);

  const isEmpty = messages.length === 0;

  // Memoized so its identity survives the per-chunk ChatRoot re-render —
  // stream chunks change `messages`, not any of these deps.
  const session = useMemo<ChatSessionValue>(
    () => ({
      chatId,
      isEmpty,
      sendMessage,
      regenerate,
      stop,
      setMessages,
      addToolOutput,
      error,
      selections,
      addSelection,
      clearSelections,
    }),
    [
      chatId,
      isEmpty,
      sendMessage,
      regenerate,
      stop,
      setMessages,
      addToolOutput,
      error,
      selections,
      addSelection,
      clearSelections,
    ],
  );

  const messagesValue = useMemo<ChatMessagesValue>(
    () => ({ messages, status }),
    [messages, status],
  );

  return (
    <ChatSessionContext value={session}>
      <ChatMessagesContext value={messagesValue}>
        {children ?? <ChatDefaultLayout />}
      </ChatMessagesContext>
    </ChatSessionContext>
  );
};

export const Chat = Object.assign(ChatRoot, {
  Messages: ChatMessages,
  Input: ChatInput,
});
