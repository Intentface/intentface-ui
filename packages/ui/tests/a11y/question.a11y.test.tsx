import { describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "../../src/composer";
import { useComposer } from "../../src/composer/store";
import type { ComposerQuestion, ComposerSubmitData } from "../../src/composer/types";
import { expectNoAxeViolations } from "./axe";

// Phase 1 interaction tests: real focus in the options group (roving
// tabindex), radio/checkbox semantics with aria-checked, the labelled group,
// and the whole flow answerable by keyboard alone — the behaviors that
// replaced the blur-to-body + document-listener model.

const SINGLE: ComposerQuestion[] = [
  {
    id: "database",
    label: "Which database should we use?",
    options: [{ label: "PostgreSQL" }, { label: "MongoDB" }, { label: "SQLite" }],
  },
];

const MULTI: ComposerQuestion[] = [
  {
    id: "features",
    label: "Which features should we enable?",
    multiSelect: true,
    options: [{ label: "Dark mode" }, { label: "Analytics" }],
  },
];

// Minimal headless consumer, mirroring the styled layer's wiring.
const AskHarness = () => {
  const questions = useComposer((composer) => composer.questions);
  const question = questions.items?.[questions.step];
  if (!question) return null;
  const draft = questions.drafts.get(questions.step);
  const selected = draft?.selected ?? new Set<string>();

  return (
    <Composer.Question>
      <Composer.QuestionHeader>
        <Composer.QuestionLabel>{question.label}</Composer.QuestionLabel>
      </Composer.QuestionHeader>
      <Composer.QuestionOptions ref={questions.optionsRef} multiSelect={!!question.multiSelect}>
        {question.options.map((option) => (
          <Composer.QuestionOption
            key={option.label}
            value={option.label}
            selected={selected.has(option.label)}
            onSelect={() => questions.toggleOption(option.label)}
          >
            <Composer.QuestionOptionLabel>{option.label}</Composer.QuestionOptionLabel>
          </Composer.QuestionOption>
        ))}
      </Composer.QuestionOptions>
    </Composer.Question>
  );
};

// activateQuestions defers focus/listener attachment one frame past the commit
// that mounts the options.
const flushFrames = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
};

describe("ask a11y", () => {
  test("focus lands in a labelled radiogroup, arrows rove, and the question is answerable by keyboard alone", async () => {
    const submitted: ComposerSubmitData[] = [];
    const { container, unmount } = render(
      <Composer.Root
        questions={SINGLE}
        onSubmit={(data) => {
          submitted.push(data);
        }}
      >
        <AskHarness />
      </Composer.Root>,
    );
    await flushFrames();

    // The group is labelled by the question; the options are real radios.
    const group = screen.getByRole("radiogroup", { name: "Which database should we use?" });
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(3);

    // Entry focus: the highlighted (first) option holds the roving tab stop.
    expect(document.activeElement).toBe(radios[0] ?? null);
    expect(radios[0]?.getAttribute("tabindex")).toBe("0");
    expect(radios[1]?.getAttribute("tabindex")).toBe("-1");

    // Arrow moves highlight AND focus together.
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(document.activeElement).toBe(radios[1] ?? null);
    expect(radios[1]?.getAttribute("tabindex")).toBe("0");
    expect(radios[0]?.getAttribute("tabindex")).toBe("-1");

    await expectNoAxeViolations(container);

    // Enter on a single-select selects AND advances — with one question, the
    // entries submit. The full flow just happened without a mouse.
    fireEvent.keyDown(group, { key: "Enter" });
    expect(submitted).toEqual([
      {
        kind: "answers",
        answers: [{ id: "database", selected: ["MongoDB"] }],
      },
    ]);

    unmount();
    cleanup();
  });

  test("multi-select checkboxes toggle aria-checked in place with Enter and Space", async () => {
    const { container, unmount } = render(
      <Composer.Root questions={MULTI} onSubmit={() => {}}>
        <AskHarness />
      </Composer.Root>,
    );
    await flushFrames();

    const group = screen.getByRole("group", { name: "Which features should we enable?" });
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(2);
    expect(document.activeElement).toBe(checkboxes[0] ?? null);

    fireEvent.keyDown(group, { key: "Enter" });
    expect(checkboxes[0]?.getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(group, { key: "ArrowDown" });
    fireEvent.keyDown(group, { key: " " });
    expect(checkboxes[1]?.getAttribute("aria-checked")).toBe("true");

    // Space again toggles off (checkbox semantics).
    fireEvent.keyDown(group, { key: " " });
    expect(checkboxes[1]?.getAttribute("aria-checked")).toBe("false");

    await expectNoAxeViolations(container);

    unmount();
    cleanup();
  });

  test("arrows still navigate after a chrome click drops focus to body", async () => {
    const { unmount } = render(
      <Composer.Root questions={SINGLE} onSubmit={() => {}}>
        <AskHarness />
      </Composer.Root>,
    );
    await flushFrames();

    const radios = screen.getAllByRole("radio");

    // A click on non-interactive panel chrome dumps focus to <body>. The
    // document-level listener (containment-scoped) must still hear arrows.
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(document.activeElement).toBe(radios[1] ?? null);

    unmount();
    cleanup();
  });

  test("navigating past the list boundary keeps focus instead of dropping to body", async () => {
    const { unmount } = render(
      <Composer.Root questions={SINGLE} onSubmit={() => {}}>
        <AskHarness />
      </Composer.Root>,
    );
    await flushFrames();

    const group = screen.getByRole("radiogroup", { name: "Which database should we use?" });
    fireEvent.keyDown(group, { key: "ArrowUp" });
    // Boundary: navigate() returns null and no focus change is forced —
    // focus must never land on <body>.
    expect(document.activeElement).not.toBe(document.body);

    unmount();
    cleanup();
  });
});
