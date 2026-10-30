"use client";

import { Composer, useComposer } from "@intentface/ui/composer";

// The parts are structural; the current question and selections come from the
// composer's questions slice.
export const Prompt = () => {
  const questions = useComposer((composer) => composer.questions);
  const question = questions.items?.[questions.step];

  if (!question) return null;

  const draft = questions.drafts.get(questions.step);
  const total = questions.items?.length ?? 0;

  return (
    <Composer.Question className="flex flex-col gap-0.5 p-1">
      <Composer.QuestionHeader className="flex h-[34px] items-center gap-2 pr-1 pl-2.5">
        <Composer.QuestionLabel className="font-medium text-[13px] text-zinc-900 dark:text-zinc-100">
          {question.label}
        </Composer.QuestionLabel>
        {!questions.isSingle && total > 1 && (
          <Composer.QuestionNavigation className="ml-auto flex items-center gap-0.5 text-zinc-400 dark:text-zinc-500">
            <Composer.QuestionPrevious
              onClick={questions.goBack}
              disabled={questions.step === 0}
              aria-label="Previous question"
              className={STEP_BUTTON_CLASS}
            >
              ‹
            </Composer.QuestionPrevious>
            <Composer.QuestionStepLabel className="text-xs tabular-nums">
              {({ current, total: count }) => `${current} of ${count}`}
            </Composer.QuestionStepLabel>
            <Composer.QuestionNext
              onClick={questions.goNext}
              disabled={questions.step === total - 1}
              aria-label="Next question"
              className={STEP_BUTTON_CLASS}
            >
              ›
            </Composer.QuestionNext>
          </Composer.QuestionNavigation>
        )}
      </Composer.QuestionHeader>
      {question.options && (
        <Composer.QuestionOptions
          ref={questions.optionsRef}
          multiSelect={Boolean(question.multiSelect)}
          groupName={`question-${questions.step}`}
          className="flex flex-col"
        >
          {question.options.map((option) => {
            // Options are identified by their value, falling back to the label.
            const optionValue = option.value ?? option.label;
            const selected = Boolean(draft?.selected.has(optionValue));
            return (
              <Composer.QuestionOption
                key={optionValue}
                value={optionValue}
                selected={selected}
                onSelect={() => questions.toggleOption(optionValue)}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors data-highlighted:bg-zinc-950/5 dark:data-highlighted:bg-white/8"
              >
                {/* Decorative: the Option itself carries the radio/checkbox role. */}
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[10px] ${
                    selected
                      ? "bg-[#0169cc] bg-linear-to-b from-[oklch(57.2%_0.166_253.2)] to-[oklch(52.9%_0.173_255)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_0_0_1px_oklch(46.5%_0.146_254.8),0_1px_2px_rgb(1_105_204/0.35)]"
                      : "bg-white bg-linear-to-b from-white to-[#fdfdfd] shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgb(0_0_0/0.075),0_1px_2px_rgb(0_0_0/0.07),0_2px_6px_-2px_rgb(0_0_0/0.05)] dark:bg-[#2d2d30] dark:from-[#313134] dark:to-[#2a2a2d] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.05),0_0_0_1px_rgb(0_0_0/0.16),0_1px_2px_rgb(0_0_0/0.1)]"
                  }`}
                >
                  {selected ? "✓" : ""}
                </span>
                <Composer.QuestionOptionContent className="flex flex-col gap-0.5">
                  <Composer.QuestionOptionLabel className="font-medium text-[13px] text-zinc-900 leading-5 dark:text-zinc-100">
                    {option.label}
                  </Composer.QuestionOptionLabel>
                  {option.description && (
                    <Composer.QuestionOptionDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                      {option.description}
                    </Composer.QuestionOptionDescription>
                  )}
                </Composer.QuestionOptionContent>
              </Composer.QuestionOption>
            );
          })}
        </Composer.QuestionOptions>
      )}
    </Composer.Question>
  );
};

// Dismiss is a plain button you wire up; Continue continues the step itself.
export const Controls = () => {
  const questions = useComposer((composer) => composer.questions);

  return (
    <>
      <Composer.QuestionDismiss
        onClick={questions.dismissStep}
        className="h-7 cursor-pointer rounded-full px-3 font-medium text-[13px] text-zinc-500 transition-colors hover:bg-zinc-950/5 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 dark:text-zinc-400 dark:hover:bg-white/8 dark:hover:text-zinc-100"
      >
        Skip
      </Composer.QuestionDismiss>
      <Composer.QuestionContinue className="h-7 cursor-pointer rounded-full bg-[#0169cc] bg-linear-to-b from-[oklch(57.2%_0.166_253.2)] to-[oklch(52.9%_0.173_255)] shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_0_0_1px_oklch(46.5%_0.146_254.8),0_1px_2px_rgb(1_105_204/0.35)] px-3 font-medium text-[13px] text-white transition-opacity focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40">
        {questions.isLastStep ? "Done" : "Continue"}
      </Composer.QuestionContinue>
    </>
  );
};

const STEP_BUTTON_CLASS =
  "flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-zinc-950/5 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-[#0169cc]/60 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-white/8 dark:hover:text-zinc-100";
