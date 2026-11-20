import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { Activity, StrictMode, useState } from "react";
import { Composer } from "../src/composer";
import { type ComposerStore, useComposer } from "../src/composer/store";

// React runs effect cleanups without a real unmount: StrictMode's simulated
// unmount in development, and an <Activity> hidden then shown again. The
// composer's state lives on through both, so nothing may be reset there
// (CHAT-41: the placeholder drew over a controlled value after one).

const placeholder = () => document.querySelector("[data-composer-placeholder]");

const ControlledComposer = ({ initial }: { initial: string }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" value={value} onValueChange={setValue}>
          <Composer.Placeholder>Ask a follow-up…</Composer.Placeholder>
        </Composer.Textarea>
      </Composer.Root>
      <button type="button" onClick={() => setValue("")}>
        Clear
      </button>
    </>
  );
};

describe("a controlled value under StrictMode", () => {
  test("shows the text without the placeholder", () => {
    render(
      <StrictMode>
        <ControlledComposer initial="Is memoising the list enough?" />
      </StrictMode>,
    );
    expect(screen.getByRole("textbox", { name: "Message" }).textContent).toBe(
      "Is memoising the list enough?",
    );
    expect(placeholder()).toBeNull();
  });

  test("clearing the text brings the placeholder back", () => {
    render(
      <StrictMode>
        <ControlledComposer initial="Is memoising the list enough?" />
      </StrictMode>,
    );
    act(() => screen.getByRole("button", { name: "Clear" }).click());
    expect(placeholder()).not.toBeNull();
  });
});

// Reads the store from inside the composer, and adds a file through it.
const AttachmentProbe = () => {
  const attachments = useComposer((composer) => composer.attachments);
  return (
    <button
      type="button"
      onClick={() => attachments.add([new File(["x"], "notes.txt", { type: "text/plain" })])}
    >
      {`Attach (${attachments.items.length})`}
    </button>
  );
};

const HideableComposer = ({ visible }: { visible: boolean }) => (
  <Activity mode={visible ? "visible" : "hidden"}>
    <Composer.Root onSubmit={() => {}}>
      <Composer.Textarea aria-label="Message" value="A draft">
        <Composer.Placeholder>Ask anything</Composer.Placeholder>
      </Composer.Textarea>
      <AttachmentProbe />
    </Composer.Root>
  </Activity>
);

describe("a composer hidden and shown again with <Activity>", () => {
  test("keeps its text flag and its attachments", () => {
    const { rerender } = render(<HideableComposer visible />);
    act(() => screen.getByRole("button", { name: "Attach (0)" }).click());
    expect(screen.getByRole("button", { name: "Attach (1)" })).toBeTruthy();

    rerender(<HideableComposer visible={false} />);
    rerender(<HideableComposer visible />);

    expect(screen.getByRole("button", { name: "Attach (1)" })).toBeTruthy();
    expect(placeholder()).toBeNull();
  });
});

// A real unmount, unlike the cases above, abandons the attachments for good.
describe("a composer that really unmounts", () => {
  const revokeObjectURL = URL.revokeObjectURL;
  let revoked: string[] = [];
  beforeEach(() => {
    revoked = [];
    URL.revokeObjectURL = (url) => void revoked.push(url);
  });
  afterEach(() => {
    URL.revokeObjectURL = revokeObjectURL;
  });

  const AttachingComposer = ({ store }: { store?: ComposerStore }) => (
    <Composer.Root store={store} onSubmit={() => {}}>
      <Composer.Textarea aria-label="Message" />
      <AttachmentProbe />
    </Composer.Root>
  );

  test("releases its unsent attachments' blob URLs", () => {
    const { unmount } = render(<AttachingComposer />);
    act(() => screen.getByRole("button", { name: "Attach (0)" }).click());
    unmount();
    expect(revoked).toHaveLength(1);
    expect(revoked[0]?.startsWith("blob:")).toBe(true);
  });

  test("leaves an explicit store's attachments to its owner", () => {
    const store = Composer.createStore();
    const { unmount } = render(<AttachingComposer store={store} />);
    act(() => screen.getByRole("button", { name: "Attach (0)" }).click());
    unmount();
    expect(revoked).toHaveLength(0);
    expect(store.getSnapshot().attachments.items).toHaveLength(1);
  });
});
