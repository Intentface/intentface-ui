import { describe, expect, test } from "bun:test";
import { decideEditorKey, type EditorKeyFacts, type KeyPress } from "../src/composer/keyboard";

const press = (key: string, init: Partial<KeyPress> = {}): KeyPress => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  composing: false,
  handled: false,
  ...init,
});

const baseFacts: EditorKeyFacts = {
  commandList: false,
  empty: false,
  hasAttachments: false,
  submitOn: "enter",
};

describe("decideEditorKey", () => {
  test("command list captures navigation and selection", () => {
    const facts = { ...baseFacts, commandList: true };
    expect(decideEditorKey(press("Tab"), facts)).toEqual({ type: "command-select" });
    expect(decideEditorKey(press("ArrowDown"), facts)).toEqual({
      type: "command-navigate",
      direction: 1,
    });
    expect(decideEditorKey(press("Escape"), facts)).toEqual({ type: "command-close" });
    expect(decideEditorKey(press("Enter"), facts)).toEqual({ type: "command-select" });
  });

  test("backspace on empty editor with attachments removes the last one", () => {
    const facts = { ...baseFacts, empty: true, hasAttachments: true };
    expect(decideEditorKey(press("Backspace"), facts)).toEqual({
      type: "remove-last-attachment",
    });
  });

  test("enter submits, shift+enter soft-breaks", () => {
    expect(decideEditorKey(press("Enter"), baseFacts)).toEqual({ type: "submit" });
    expect(decideEditorKey(press("Enter", { shiftKey: true }), baseFacts)).toEqual({
      type: "soft-break",
    });
  });

  test("unhandled keys return null", () => {
    expect(decideEditorKey(press("a"), baseFacts)).toBeNull();
  });

  test("a key an IME is composing, or one something already used, is not the editor's", () => {
    const facts = { ...baseFacts, commandList: true };
    expect(decideEditorKey(press("Enter", { composing: true }), baseFacts)).toBeNull();
    expect(decideEditorKey(press("Escape", { composing: true }), facts)).toBeNull();
    expect(decideEditorKey(press("Enter", { handled: true }), baseFacts)).toBeNull();
  });
});

describe("decideEditorKey: submitOn", () => {
  const inverted = { ...baseFacts, submitOn: "shift-enter" as const };

  test("shift-enter mode swaps the chord mapping", () => {
    expect(decideEditorKey(press("Enter", { shiftKey: true }), inverted)).toEqual({
      type: "submit",
    });
    expect(decideEditorKey(press("Enter"), inverted)).toEqual({ type: "soft-break" });
  });

  test("an open command list still owns plain Enter (select) in shift-enter mode", () => {
    expect(decideEditorKey(press("Enter"), { ...inverted, commandList: true })).toEqual({
      type: "command-select",
    });
  });

  test("the send chord never submits while the command list is open", () => {
    // Default mode: Shift+Enter (non-send) soft-breaks — unchanged.
    expect(
      decideEditorKey(press("Enter", { shiftKey: true }), { ...baseFacts, commandList: true }),
    ).toEqual({ type: "soft-break" });
    // Inverted mode: Shift+Enter is the send chord, but the popup suppresses it.
    expect(
      decideEditorKey(press("Enter", { shiftKey: true }), { ...inverted, commandList: true }),
    ).toEqual({ type: "soft-break" });
  });
});
