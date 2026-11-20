import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Composer } from "../src/composer";
import type { ComposerSnapshot } from "../src/composer/types";

// A host that controls Composer.Root with a snapshot and echoes every report
// back as the next value (UI-64: a value the host set itself never settled).

const snapshotOf = (text: string) =>
  ({
    __doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    __brand: "ComposerSnapshot",
  }) as ComposerSnapshot;

const editor = () => screen.getByRole("textbox", { name: "Message" });

const EchoingHost = ({
  initial,
  defaultValue,
  onReport,
}: {
  initial?: ComposerSnapshot;
  defaultValue?: ComposerSnapshot;
  onReport: () => void;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Composer.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={(snapshot) => {
          onReport();
          setValue(snapshot);
        }}
        onSubmit={() => {}}
      >
        <Composer.Textarea aria-label="Message" />
      </Composer.Root>
      <button type="button" onClick={() => setValue(snapshotOf("Set by the host"))}>
        Set
      </button>
    </>
  );
};

describe("a controlled snapshot value with an echoing onValueChange", () => {
  test("a value the host sets itself settles after one report", () => {
    let reports = 0;
    render(<EchoingHost initial={snapshotOf("First draft")} onReport={() => reports++} />);
    expect(editor().textContent).toBe("First draft");

    reports = 0;
    act(() => screen.getByRole("button", { name: "Set" }).click());

    expect(reports).toBe(1);
    expect(editor().textContent).toBe("Set by the host");
  });

  test("the initial value settles after one report", () => {
    let reports = 0;
    render(<EchoingHost initial={snapshotOf("First draft")} onReport={() => reports++} />);
    expect(reports).toBe(1);
  });

  test("a defaultValue settles after one report", () => {
    let reports = 0;
    render(<EchoingHost defaultValue={snapshotOf("First draft")} onReport={() => reports++} />);
    expect(reports).toBe(1);
    expect(editor().textContent).toBe("First draft");
  });
});
