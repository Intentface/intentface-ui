"use client";

import {
  Composer,
  type ComposerAnswer,
  type ComposerQuestion,
  type ComposerQuestionOption,
  type ComposerSubmitData,
  useComposer,
} from "@intentface/ui/composer";
import { type ComponentProps, useState } from "react";

// A tool approval is just a question: the id is the tool call id, the option
// values are your decision vocabulary, and the answer routes back to the tool
// in onSubmit. The package never learns the word "approval" — and a single
// question simply doesn't mount the step-navigation parts.
const COMMAND = "pnpm test";
const TOOL_CALL_ID = "call_run_tests";

// Richer consumer options satisfy the contract structurally — `command` is
// this demo's own field, rendered as inline code below.
const OPTIONS = [
  { value: "yes", label: "Yes" },
  {
    value: "always",
    label: "Yes, and don't ask again for commands that start with",
    command: COMMAND,
  },
  { value: "no", label: "No" },
] satisfies readonly (ComposerQuestionOption & { command?: string })[];

const QUESTIONS: ComposerQuestion[] = [
  {
    id: TOOL_CALL_ID,
    label: `Do you want to allow me to run ${COMMAND} for this workspace?`,
    options: OPTIONS,
  },
];

const DECISION_COPY: Record<string, string> = {
  yes: "approved once",
  always: `approved for commands starting with "${COMMAND}"`,
  no: "denied",
};

export const ApprovalFlow = () => {
  const [entry, setEntry] = useState<ComposerAnswer | null>(null);

  const handleSubmit = (data: ComposerSubmitData) => {
    if (data.kind !== "answers") return;
    // Route by the id we minted — this is where a real app resolves the call
    // (e.g. addToolOutput / executing or rejecting the tool).
    const resolved = data.answers.find((answer) => answer.id === TOOL_CALL_ID);
    if (resolved) setEntry(resolved);
  };

  const decision = entry?.selected[0];
  const resolvedCopy = decision
    ? (DECISION_COPY[decision] ?? decision)
    : entry?.text
      ? `answered: "${entry.text}"`
      : "skipped";

  return (
    // Reserve height and bottom-anchor so the panel opening never shifts the page.
    <div className="flex min-h-100 w-full max-w-xl flex-col items-center justify-end gap-3">
      <Composer.Root
        questions={entry ? undefined : QUESTIONS}
        onSubmit={handleSubmit}
        className="flex w-full flex-col"
      >
        <Composer.Panel
          anchor={false}
          className="mb-2 overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white dark:border-[#262626] dark:bg-[#181818]"
        >
          {!entry && <Prompt />}
        </Composer.Panel>
        <Composer.Container className="cursor-text rounded-2xl border border-[#f0f0f0] bg-white shadow-xs transition-colors focus-within:border-[#ececec] dark:border-[#262626] dark:bg-[#181818] dark:focus-within:border-[#2d2d2d]">
          <Composer.Textarea className="max-h-32 min-h-8 overflow-y-auto px-4 pt-3 text-sm **:data-composer-editor:w-full **:data-composer-editor:max-w-none **:data-composer-editor:leading-[1.7] [&_[data-composer-editor]:focus]:outline-none">
            <Composer.Placeholder
              placeholder={entry ? `${resolvedCopy} — reset to try again` : "Or reply directly…"}
              className="leading-[1.7] text-[#949494] dark:text-[#6f6f6f]"
            />
          </Composer.Textarea>
          <Composer.Actions className="flex items-center justify-end gap-2 p-2">
            {entry ? (
              <Composer.Submit className="flex size-8 items-center justify-center rounded-full bg-[#1a1a1a] text-white transition-opacity disabled:opacity-40 dark:bg-[#fcfcfc] dark:text-[#111111]">
                <SendIcon />
              </Composer.Submit>
            ) : (
              <Controls />
            )}
          </Composer.Actions>
        </Composer.Container>
      </Composer.Root>
      {entry && (
        <button
          type="button"
          onClick={() => setEntry(null)}
          className="cursor-pointer rounded-full border border-[#f0f0f0] bg-white px-4 py-1.5 text-sm font-medium text-[#686868] transition-colors hover:bg-[#fafafa] dark:border-[#262626] dark:bg-[#181818] dark:text-[#9b9b9b] dark:hover:bg-[#232323]"
        >
          Reset approval
        </button>
      )}
    </div>
  );
};

// Single question: no Navigation, no StepLabel — the label, the command being
// approved (free-form children inside Composer.Question), and numbered options.
const Prompt = () => {
  const questions = useComposer((composer) => composer.questions);
  const question = questions.items?.[questions.step];

  if (!question) return null;

  const draft = questions.drafts.get(questions.step);

  return (
    <Composer.Question className="flex flex-col gap-1 p-2">
      <Composer.QuestionHeader className="flex h-7 items-center gap-2 px-2">
        <Composer.QuestionLabel className="text-sm font-medium">
          Do you want to allow me to run{" "}
          <code className="rounded bg-[#f4f4f4] px-1 py-0.5 text-xs dark:bg-[#111111]">
            {COMMAND}
          </code>{" "}
          for this workspace?
        </Composer.QuestionLabel>
      </Composer.QuestionHeader>
      <div className="rounded-lg bg-[#f4f4f4] px-3 py-2.5 font-mono text-sm text-[#686868] dark:bg-[#111111] dark:text-[#9b9b9b]">
        {COMMAND}
      </div>
      <Composer.QuestionOptions
        ref={questions.optionsRef}
        multiSelect={false}
        groupName="approval"
        className="flex flex-col"
      >
        {OPTIONS.map((option, index) => {
          const optionValue = option.value ?? option.label;
          const selected = Boolean(draft?.selected.has(optionValue));
          return (
            <Composer.QuestionOption
              key={optionValue}
              value={optionValue}
              selected={selected}
              onSelect={() => questions.toggleOption(optionValue)}
              className="group flex cursor-pointer items-start gap-2 rounded-[10px] p-2 outline-none transition-colors data-highlighted:bg-[#f4f4f4] dark:data-highlighted:bg-[#232323]"
            >
              <span
                aria-hidden="true"
                className={`mt-px flex size-4 shrink-0 items-center justify-center rounded border text-[10px] tabular-nums ${
                  selected
                    ? "border-[#1a1a1a] bg-[#1a1a1a] text-white dark:border-[#fcfcfc] dark:bg-[#fcfcfc] dark:text-[#111111]"
                    : "border-[#ececec] text-[#949494] dark:border-[#2d2d2d] dark:text-[#6f6f6f]"
                }`}
              >
                {index + 1}
              </span>
              <Composer.QuestionOptionContent className="flex flex-col gap-0.5">
                <Composer.QuestionOptionLabel className="text-sm leading-snug">
                  {option.label}
                  {"command" in option && (
                    <>
                      {" "}
                      <code className="rounded bg-[#e8e8e8] px-1 py-0.5 font-mono text-xs text-[#686868] dark:bg-[#111111] dark:text-[#9b9b9b]">
                        {option.command}
                      </code>
                    </>
                  )}
                </Composer.QuestionOptionLabel>
              </Composer.QuestionOptionContent>
              {/* Enter selects the highlighted row — surface that on it. */}
              <span
                aria-hidden="true"
                className="ml-auto self-center text-xs text-[#949494] opacity-0 transition-opacity group-data-highlighted:opacity-100 dark:text-[#6f6f6f]"
              >
                ↵
              </span>
            </Composer.QuestionOption>
          );
        })}
      </Composer.QuestionOptions>
    </Composer.Question>
  );
};

const SendIcon = (props: ComponentProps<"svg">) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M8 13V3m0 0L3.5 7.5M8 3l4.5 4.5" />
  </svg>
);

const Controls = () => {
  const questions = useComposer((composer) => composer.questions);

  return (
    <>
      <Composer.QuestionDismiss
        onClick={questions.dismissStep}
        className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-[#949494] transition-colors hover:bg-[#f4f4f4] hover:text-[#1a1a1a] dark:text-[#6f6f6f] dark:hover:bg-[#232323] dark:hover:text-[#fcfcfc]"
      >
        Skip
      </Composer.QuestionDismiss>
      <Composer.QuestionContinue className="cursor-pointer rounded-full bg-[#1a1a1a] px-3.5 py-1.5 text-sm font-medium text-white dark:bg-[#fcfcfc] dark:text-[#111111]">
        Submit
      </Composer.QuestionContinue>
    </>
  );
};
