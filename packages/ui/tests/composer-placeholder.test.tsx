import { describe, expect, spyOn, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Composer, type ComposerTextareaState } from "../src/composer";

const editor = () => screen.getByRole("textbox", { name: "Message" });
const overlay = () => document.querySelector("[data-composer-placeholder]");

describe("the native placeholder", () => {
  test("marks an empty editor and sets aria-placeholder", () => {
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" placeholder="Ask anything" />
      </Composer.Root>,
    );
    expect(editor().hasAttribute("data-placeholder")).toBe(true);
    expect(editor().getAttribute("aria-placeholder")).toBe("Ask anything");
    expect(overlay()).toBeNull();
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

describe("Composer.Placeholder", () => {
  const ComposerWith = ({ value, keepMounted }: { value?: string; keepMounted?: boolean }) => (
    <Composer.Root onSubmit={() => {}}>
      <Composer.Textarea aria-label="Message" value={value}>
        <Composer.Placeholder keepMounted={keepMounted}>Ask anything</Composer.Placeholder>
      </Composer.Textarea>
    </Composer.Root>
  );

  test("overlays an empty editor, hidden from assistive tech", () => {
    render(<ComposerWith />);
    expect(overlay()?.textContent).toBe("Ask anything");
    expect(overlay()?.getAttribute("aria-hidden")).toBe("true");
    expect((overlay() as HTMLElement).style.position).toBe("absolute");
  });

  test("is gone when the editor is filled", () => {
    render(<ComposerWith value="Hello" />);
    expect(overlay()).toBeNull();
  });

  test("is gone during an IME composition", () => {
    render(<ComposerWith />);
    act(() => void fireEvent.compositionStart(editor()));
    expect(overlay()).toBeNull();
  });

  test("stays mounted with keepMounted, marked data-hidden while it would be hidden", () => {
    const { rerender } = render(<ComposerWith keepMounted />);
    expect(overlay()?.hasAttribute("data-hidden")).toBe(false);

    rerender(<ComposerWith keepMounted value="Hello" />);
    expect(overlay()?.hasAttribute("data-hidden")).toBe(true);
  });

  test("throws outside Composer.Textarea", () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <Composer.Root onSubmit={() => {}}>
          <Composer.Placeholder>Ask anything</Composer.Placeholder>
        </Composer.Root>,
      ),
    ).toThrow("<Composer.Placeholder> must be rendered inside <Composer.Textarea>.");
    error.mockRestore();
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
