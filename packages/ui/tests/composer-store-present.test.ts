import { describe, expect, test } from "bun:test";
import { createComposerStore } from "../src/composer/store";

// The panel-close lifecycle rests on a sticky `present` flag: opening sets it, closing
// leaves it set (so the Panel can keep the last content mounted while it animates out),
// and only finalizePanelClose() — called once the exit animation finishes — clears it.

describe("composer store: sticky panel presence", () => {
  test("commands: opening sets present; closing keeps it sticky", () => {
    const store = createComposerStore();
    expect(store.getSnapshot().commands.present).toBe(false);

    store.setCommands({ active: true, trigger: "@", query: "" });
    expect(store.getSnapshot().commands.active).toBe(true);
    expect(store.getSnapshot().commands.present).toBe(true);

    store.setCommands({ active: false, trigger: null, query: "" });
    expect(store.getSnapshot().commands.active).toBe(false);
    expect(store.getSnapshot().commands.present).toBe(true);
  });

  test("finalizePanelClose clears present only when inactive", () => {
    const store = createComposerStore();

    store.setCommands({ active: true, trigger: "@", query: "" });
    store.finalizePanelClose();
    // Still logically open → presence preserved.
    expect(store.getSnapshot().commands.present).toBe(true);

    store.setCommands({ active: false, trigger: null, query: "" });
    store.finalizePanelClose();
    // Closed and the animation is done → presence cleared.
    expect(store.getSnapshot().commands.present).toBe(false);
  });

  test("question presence is sticky the same way", () => {
    const store = createComposerStore();
    store.setQuestions([{ id: "pick", label: "Pick one", options: [{ label: "A" }] }]);
    expect(store.getSnapshot().questions.active).toBe(true);
    expect(store.getSnapshot().questions.present).toBe(true);

    store.setQuestions(null);
    expect(store.getSnapshot().questions.active).toBe(false);
    expect(store.getSnapshot().questions.present).toBe(true);

    store.finalizePanelClose();
    expect(store.getSnapshot().questions.present).toBe(false);
  });

  test("reset clears presence", () => {
    const store = createComposerStore();
    store.setCommands({ active: true, trigger: "@", query: "" });
    store.reset();
    expect(store.getSnapshot().commands.present).toBe(false);
  });
});
