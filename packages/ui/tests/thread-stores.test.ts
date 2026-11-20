import { describe, expect, test } from "bun:test";
import {
  createEdgeStore,
  createVisibilityStore,
  EMPTY_VISIBILITY,
  visibilityStatesEqual,
} from "../src/thread/stores";

describe("createEdgeStore", () => {
  test("starts at the top/bottom edge (true) and flips on change", () => {
    const store = createEdgeStore();
    expect(store.getSnapshot()).toBe(true);
    store.setSnapshot(false);
    expect(store.getSnapshot()).toBe(false);
  });

  test("notifies subscribers only on a real change (equality bail)", () => {
    const store = createEdgeStore();
    let calls = 0;
    store.subscribe(() => {
      calls++;
    });
    store.setSnapshot(false); // change → notify
    store.setSnapshot(false); // same → bail
    expect(calls).toBe(1);
  });

  test("unsubscribe stops notifications", () => {
    const store = createEdgeStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls++;
    });
    store.setSnapshot(false);
    unsubscribe();
    store.setSnapshot(true);
    expect(calls).toBe(1);
  });
});

describe("visibilityStatesEqual", () => {
  test("equal for identical ids + current", () => {
    expect(
      visibilityStatesEqual(
        { visibleMessageIds: ["a", "b"], currentMessageId: "a" },
        { visibleMessageIds: ["a", "b"], currentMessageId: "a" },
      ),
    ).toBe(true);
  });

  test("unequal when the current row differs", () => {
    expect(
      visibilityStatesEqual(
        { visibleMessageIds: ["a"], currentMessageId: "a" },
        { visibleMessageIds: ["a"], currentMessageId: "b" },
      ),
    ).toBe(false);
  });

  test("unequal when ids differ in order (document order matters)", () => {
    expect(
      visibilityStatesEqual(
        { visibleMessageIds: ["a", "b"], currentMessageId: "a" },
        { visibleMessageIds: ["b", "a"], currentMessageId: "a" },
      ),
    ).toBe(false);
  });

  test("unequal when the id count differs", () => {
    expect(
      visibilityStatesEqual(
        { visibleMessageIds: ["a"], currentMessageId: "a" },
        { visibleMessageIds: ["a", "b"], currentMessageId: "a" },
      ),
    ).toBe(false);
  });
});

describe("createVisibilityStore", () => {
  test("starts empty", () => {
    const store = createVisibilityStore();
    expect(store.getSnapshot()).toBe(EMPTY_VISIBILITY);
  });

  test("onFirstSubscribe fires once, onLastUnsubscribe fires on the last unsubscribe", () => {
    const store = createVisibilityStore();
    let firsts = 0;
    let lasts = 0;
    const a = store.subscribe(
      () => {},
      () => firsts++,
      () => lasts++,
    );
    const b = store.subscribe(
      () => {},
      () => firsts++,
      () => lasts++,
    );
    expect(firsts).toBe(1); // only the first subscriber spins up tracking
    a();
    expect(lasts).toBe(0); // one subscriber remains
    b();
    expect(lasts).toBe(1); // last one tears it down
  });

  test("setSnapshot bails on an equal state", () => {
    const store = createVisibilityStore();
    let calls = 0;
    store.subscribe(
      () => {
        calls++;
      },
      () => {},
      () => {},
    );
    store.setSnapshot({ visibleMessageIds: ["a"], currentMessageId: "a" }); // change
    store.setSnapshot({ visibleMessageIds: ["a"], currentMessageId: "a" }); // equal → bail
    expect(calls).toBe(1);
  });
});
