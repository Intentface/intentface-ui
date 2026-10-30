import { describe, expect, test } from "bun:test";
import { interpretEditorKey, interpretQuestionKey } from "../src/composer/keyboard";

const baseContext = {
  isCommandListOpen: false,
  hasActiveQuestions: false,
  hasStepAnswer: false,
  isEditorEmpty: false,
  hasAttachments: false,
};

describe("interpretEditorKey", () => {
  test("command list captures navigation and selection", () => {
    const ctx = { ...baseContext, isCommandListOpen: true };
    expect(interpretEditorKey({ key: "Tab", shiftKey: false }, ctx)).toEqual({
      type: "command-select",
    });
    expect(interpretEditorKey({ key: "ArrowDown", shiftKey: false }, ctx)).toEqual({
      type: "command-navigate",
      direction: 1,
    });
    expect(interpretEditorKey({ key: "Escape", shiftKey: false }, ctx)).toEqual({
      type: "command-close",
    });
    expect(interpretEditorKey({ key: "Enter", shiftKey: false }, ctx)).toEqual({
      type: "command-select",
    });
  });

  test("question arrows take over when active", () => {
    const ctx = { ...baseContext, hasActiveQuestions: true };
    expect(interpretEditorKey({ key: "ArrowUp", shiftKey: false }, ctx)).toEqual({
      type: "question-arrow",
      direction: -1,
    });
  });

  test("backspace on empty editor with attachments removes the last one", () => {
    const ctx = { ...baseContext, isEditorEmpty: true, hasAttachments: true };
    expect(interpretEditorKey({ key: "Backspace", shiftKey: false }, ctx)).toEqual({
      type: "remove-last-attachment",
    });
  });

  test("enter submits, shift+enter soft-breaks", () => {
    expect(interpretEditorKey({ key: "Enter", shiftKey: false }, baseContext)).toEqual({
      type: "submit-form",
    });
    expect(interpretEditorKey({ key: "Enter", shiftKey: true }, baseContext)).toEqual({
      type: "soft-break",
    });
  });

  test("unhandled keys return null", () => {
    expect(interpretEditorKey({ key: "a", shiftKey: false }, baseContext)).toBeNull();
  });
});

describe("interpretQuestionKey", () => {
  const event = (key: string, extra: Partial<Parameters<typeof interpretQuestionKey>[0]> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    ...extra,
  });

  test("escape dismisses regardless of highlight", () => {
    expect(interpretQuestionKey(event("Escape"), { hasHighlight: false })).toEqual({
      type: "dismiss-step",
    });
  });

  test("without highlight, other keys pass through", () => {
    expect(interpretQuestionKey(event("ArrowDown"), { hasHighlight: false })).toBeNull();
  });

  test("with highlight, arrows navigate and enter selects", () => {
    expect(interpretQuestionKey(event("ArrowDown"), { hasHighlight: true })).toEqual({
      type: "navigate-options",
      direction: 1,
    });
    expect(interpretQuestionKey(event("Enter"), { hasHighlight: true })).toEqual({
      type: "select-option",
    });
    expect(interpretQuestionKey(event("ArrowLeft"), { hasHighlight: true })).toEqual({
      type: "go-back",
    });
  });

  test("printable characters route back to the input", () => {
    expect(interpretQuestionKey(event("x"), { hasHighlight: true })).toEqual({
      type: "insert-character",
      character: "x",
    });
    expect(interpretQuestionKey(event("x", { metaKey: true }), { hasHighlight: true })).toBeNull();
  });

  test("defaultPrevented events are ignored", () => {
    expect(
      interpretQuestionKey(event("Escape", { defaultPrevented: true }), { hasHighlight: true }),
    ).toBeNull();
  });
});

describe("interpretEditorKey: submitOn", () => {
  const inverted = { ...baseContext, submitOn: "shift-enter" as const };

  test("shift-enter mode swaps the chord mapping", () => {
    expect(interpretEditorKey({ key: "Enter", shiftKey: true }, inverted)).toEqual({
      type: "submit-form",
    });
    expect(interpretEditorKey({ key: "Enter", shiftKey: false }, inverted)).toEqual({
      type: "soft-break",
    });
  });

  test("an open command list still owns plain Enter (select) in shift-enter mode", () => {
    expect(
      interpretEditorKey(
        { key: "Enter", shiftKey: false },
        { ...inverted, isCommandListOpen: true },
      ),
    ).toEqual({ type: "command-select" });
  });

  test("the send chord never submits while the command list is open", () => {
    // Default mode: Shift+Enter (non-send) soft-breaks — unchanged.
    expect(
      interpretEditorKey(
        { key: "Enter", shiftKey: true },
        { ...baseContext, isCommandListOpen: true },
      ),
    ).toEqual({ type: "soft-break" });
    // Inverted mode: Shift+Enter is the send chord, but the popup suppresses it.
    expect(
      interpretEditorKey(
        { key: "Enter", shiftKey: true },
        { ...inverted, isCommandListOpen: true },
      ),
    ).toEqual({ type: "soft-break" });
  });
});

describe("interpretQuestionKey: Space selects", () => {
  test("Space toggles the highlighted option (APG radio/checkbox)", () => {
    expect(
      interpretQuestionKey(
        { key: " ", ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false },
        { hasHighlight: true },
      ),
    ).toEqual({ type: "select-option" });
  });
});

describe("interpretEditorKey: question dismiss", () => {
  test("editor-focused Escape dismisses the active question", () => {
    expect(
      interpretEditorKey(
        { key: "Escape", shiftKey: false },
        { ...baseContext, hasActiveQuestions: true },
      ),
    ).toEqual({ type: "question-dismiss" });
  });

  test("command list still owns Escape when both are active", () => {
    expect(
      interpretEditorKey(
        { key: "Escape", shiftKey: false },
        { ...baseContext, hasActiveQuestions: true, isCommandListOpen: true },
      ),
    ).toEqual({ type: "command-close" });
  });
});
