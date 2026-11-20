import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Composer, type ComposerTextareaState } from "../src/composer";

const editor = () => screen.getByRole("textbox", { name: "Message" });

describe("the native placeholder", () => {
  test("marks an empty editor and sets aria-placeholder", () => {
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" placeholder="Ask anything" />
      </Composer.Root>,
    );
    expect(editor().hasAttribute("data-placeholder")).toBe(true);
    expect(editor().getAttribute("aria-placeholder")).toBe("Ask anything");
  });

  test("is absent once the editor has content", () => {
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" placeholder="Ask anything" value="Hello" />
      </Composer.Root>,
    );
    expect(editor().hasAttribute("data-placeholder")).toBe(false);
  });

  test("is absent without a placeholder string", () => {
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" />
      </Composer.Root>,
    );
    expect(editor().hasAttribute("data-placeholder")).toBe(false);
  });

  test("is absent during an IME composition and returns when it is cancelled", () => {
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" placeholder="Ask anything" />
      </Composer.Root>,
    );
    act(() => void fireEvent.compositionStart(editor()));
    expect(editor().hasAttribute("data-placeholder")).toBe(false);
    act(() => void fireEvent.compositionEnd(editor()));
    expect(editor().hasAttribute("data-placeholder")).toBe(true);
  });
});

describe("a custom placeholder passed as children", () => {
  test("wins over the native one, which keeps only aria-placeholder", () => {
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" placeholder="Ask anything">
          <span data-testid="hint">Ask anything</span>
        </Composer.Textarea>
      </Composer.Root>,
    );
    expect(screen.getByTestId("hint")).toBeTruthy();
    expect(editor().hasAttribute("data-placeholder")).toBe(false);
    expect(editor().getAttribute("aria-placeholder")).toBe("Ask anything");
  });

  test("leaves the native one on when it renders nothing", () => {
    const off = false;
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" placeholder="Ask anything">
          {off && <span>Ask anything</span>}
        </Composer.Textarea>
      </Composer.Root>,
    );
    expect(editor().hasAttribute("data-placeholder")).toBe(true);
  });

  test("leaves the native one on when a function child returns nothing", () => {
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" placeholder="Ask anything">
          {() => null}
        </Composer.Textarea>
      </Composer.Root>,
    );
    expect(editor().hasAttribute("data-placeholder")).toBe(true);
  });
});

describe("Composer.Textarea children as a function", () => {
  test("receives the editor state", () => {
    const seen: ComposerTextareaState[] = [];
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" disabled value="Hello">
          {(state) => {
            seen.push(state);
            return null;
          }}
        </Composer.Textarea>
      </Composer.Root>,
    );
    expect(seen.at(-1)).toEqual({ disabled: true, filled: true, composing: false });
  });

  test("lets the consumer gate its own content", () => {
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message">
          {({ filled }) => (filled ? null : <span data-testid="hint">Type here</span>)}
        </Composer.Textarea>
      </Composer.Root>,
    );
    expect(screen.getByTestId("hint")).toBeTruthy();
  });

  test("reports composing on the wrapper and in the state", () => {
    const seen: boolean[] = [];
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message">
          {({ composing }) => {
            seen.push(composing);
            return null;
          }}
        </Composer.Textarea>
      </Composer.Root>,
    );
    act(() => void fireEvent.compositionStart(editor()));
    expect(seen.at(-1)).toBe(true);
    expect(document.querySelector("[data-composer-textarea]")?.hasAttribute("data-composing")).toBe(
      true,
    );
  });
});
