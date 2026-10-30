import { describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { AskUser } from "../src/ask-user";
import { Composer } from "../src/composer";
import { useComposer } from "../src/composer/store";
import type { AskUserQuestion, ComposerSubmitData } from "../src/composer/types";
import { Tabs } from "../src/tabs";

// Escape stops a generating composer only when pressed inside that composer.

const ChatComposer = ({
  name,
  generating = false,
  onStop,
}: {
  name: string;
  generating?: boolean;
  onStop?: () => void;
}) => (
  <Composer.Root onSubmit={() => {}}>
    <Composer.Textarea aria-label={name} />
    <Composer.Submit isGenerating={generating} onStop={onStop} />
  </Composer.Root>
);

const pressEscape = (target: Element | Document) =>
  act(() => void fireEvent.keyDown(target, { key: "Escape" }));

const QUESTIONS: AskUserQuestion[] = [
  { question: "Which database?", options: [{ label: "PostgreSQL" }, { label: "SQLite" }] },
];

const AskUserOptions = () => {
  const askUser = useComposer((composer) => composer.askUser);
  const question = askUser.questions?.[askUser.step];
  if (!question) return null;
  return (
    <AskUser.Options ref={askUser.optionsRef}>
      {question.options.map((option) => (
        <AskUser.Option
          key={option.label}
          value={option.label}
          onSelect={() => askUser.toggleOption(option.label)}
        >
          {option.label}
        </AskUser.Option>
      ))}
    </AskUser.Options>
  );
};

// activateAskUser moves focus into the options one frame past the commit.
const flushFrames = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

describe("Escape stops generation", () => {
  test("typed into the composer", () => {
    const onStop = mock();
    render(<ChatComposer name="Message" generating onStop={onStop} />);

    pressEscape(screen.getByRole("textbox", { name: "Message" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test("from a part portaled out of the composer", () => {
    const onStop = mock();
    render(
      <Composer.Root onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" />
        <Composer.Submit isGenerating onStop={onStop} />
        {createPortal(<button type="button">Option</button>, document.body)}
      </Composer.Root>,
    );

    pressEscape(screen.getByRole("button", { name: "Option" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test("not after focus left the composer", () => {
    const onStop = mock();
    render(<ChatComposer name="Message" generating onStop={onStop} />);

    pressEscape(document.body);
    expect(onStop).not.toHaveBeenCalled();
  });

  test("not while idle", () => {
    const onStop = mock();
    render(<ChatComposer name="Message" onStop={onStop} />);

    pressEscape(screen.getByRole("textbox", { name: "Message" }));
    expect(onStop).not.toHaveBeenCalled();
  });

  test("not when something already handled the key", () => {
    const onStop = mock();
    render(<ChatComposer name="Message" generating onStop={onStop} />);
    const claim = (event: Event) => event.preventDefault();
    const textbox = screen.getByRole("textbox", { name: "Message" });
    textbox.addEventListener("keydown", claim);

    pressEscape(textbox);
    textbox.removeEventListener("keydown", claim);
    expect(onStop).not.toHaveBeenCalled();
  });

  test("not without an onStop, so the key stays free", () => {
    render(<ChatComposer name="Message" generating />);

    const notPrevented = fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), {
      key: "Escape",
    });
    expect(notPrevented).toBe(true);
  });

  test("not while an ask-user question is open; Escape dismisses its step", async () => {
    const onStop = mock();
    const submitted: ComposerSubmitData[] = [];
    render(
      <Composer.Root questions={QUESTIONS} onSubmit={(data) => void submitted.push(data)}>
        <Composer.Textarea aria-label="Message" />
        <AskUserOptions />
        <Composer.Submit isGenerating onStop={onStop} />
      </Composer.Root>,
    );
    await flushFrames();

    pressEscape(screen.getByRole("radio", { name: "PostgreSQL" }));
    expect(onStop).not.toHaveBeenCalled();
    expect(submitted.at(-1)?.kind).toBe("answers");
  });

  test("not when the consumer's onKeyDown skips it", () => {
    const onStop = mock();
    render(
      <Composer.Root onSubmit={() => {}} onKeyDown={(event) => event.preventPrimitiveHandler()}>
        <Composer.Textarea aria-label="Message" />
        <Composer.Submit isGenerating onStop={onStop} />
      </Composer.Root>,
    );

    pressEscape(screen.getByRole("textbox", { name: "Message" }));
    expect(onStop).not.toHaveBeenCalled();
  });
});

describe("with more than one composer on the page", () => {
  test("an Escape typed into another composer is that composer's", () => {
    const onStop = mock();
    render(
      <>
        <ChatComposer name="Page" generating onStop={onStop} />
        <ChatComposer name="Popup" />
      </>,
    );

    pressEscape(screen.getByRole("textbox", { name: "Popup" }));
    expect(onStop).not.toHaveBeenCalled();
  });

  test("with both generating, only the one typed into stops", () => {
    const stopPage = mock();
    const stopPopup = mock();
    render(
      <>
        <ChatComposer name="Page" generating onStop={stopPage} />
        <ChatComposer name="Popup" generating onStop={stopPopup} />
      </>,
    );

    pressEscape(screen.getByRole("textbox", { name: "Popup" }));
    expect(stopPopup).toHaveBeenCalledTimes(1);
    expect(stopPage).not.toHaveBeenCalled();
  });
});

describe("next to elements that are not composers", () => {
  test("an Escape in an unrelated field or button is left alone", () => {
    const onStop = mock();
    render(
      <>
        <ChatComposer name="Message" generating onStop={onStop} />
        <input aria-label="Title" />
        <div role="textbox" aria-label="Notes" contentEditable tabIndex={0} />
        <button type="button">Elsewhere</button>
      </>,
    );

    pressEscape(screen.getByRole("textbox", { name: "Title" }));
    pressEscape(screen.getByRole("textbox", { name: "Notes" }));
    pressEscape(screen.getByRole("button", { name: "Elsewhere" }));
    expect(onStop).not.toHaveBeenCalled();
  });
});

describe("inside a popup or dialog from another library", () => {
  // Base UI's Popover and Dialog close on any Escape that reaches them, through
  // the popup's onKeyDown or a document listener, whether or not it was handled.
  const renderInLayer = (composer: React.ReactNode) => {
    const layer = mock();
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") layer("document");
    };
    document.addEventListener("keydown", onDocumentKeyDown);
    render(
      <div role="dialog" onKeyDown={(event) => event.key === "Escape" && layer("popup")}>
        {composer}
      </div>,
    );
    return {
      layer,
      [Symbol.dispose]: () => document.removeEventListener("keydown", onDocumentKeyDown),
    };
  };

  test("an Escape that stops generating does not reach it", () => {
    const onStop = mock();
    using view = renderInLayer(<ChatComposer name="Message" generating onStop={onStop} />);

    pressEscape(screen.getByRole("textbox", { name: "Message" }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(view.layer).not.toHaveBeenCalled();
  });

  test("an Escape something inside already handled does not reach it", () => {
    using view = renderInLayer(<ChatComposer name="Message" />);
    const textbox = screen.getByRole("textbox", { name: "Message" });
    const claim = (event: Event) => event.preventDefault();
    textbox.addEventListener("keydown", claim);

    pressEscape(textbox);
    textbox.removeEventListener("keydown", claim);
    expect(view.layer).not.toHaveBeenCalled();
  });

  test("an Escape that dismisses a question's step does not reach it", async () => {
    const submitted: ComposerSubmitData[] = [];
    using view = renderInLayer(
      <Composer.Root questions={QUESTIONS} onSubmit={(data) => void submitted.push(data)}>
        <Composer.Textarea aria-label="Message" />
        <AskUserOptions />
      </Composer.Root>,
    );
    await flushFrames();

    pressEscape(screen.getByRole("radio", { name: "PostgreSQL" }));
    expect(submitted.at(-1)?.kind).toBe("answers");
    expect(view.layer).not.toHaveBeenCalled();
  });

  test("an Escape the editor used dismisses the step once and does not reach it", async () => {
    const submitted: ComposerSubmitData[] = [];
    using view = renderInLayer(
      <Composer.Root questions={QUESTIONS} onSubmit={(data) => void submitted.push(data)}>
        <Composer.Textarea aria-label="Message" />
        <AskUserOptions />
      </Composer.Root>,
    );
    await flushFrames();

    pressEscape(screen.getByRole("textbox", { name: "Message" }));
    expect(submitted.map((data) => data.kind)).toEqual(["answers"]);
    expect(view.layer).not.toHaveBeenCalled();
  });

  test("an Escape the composer has no use for reaches it", () => {
    using view = renderInLayer(<ChatComposer name="Message" />);

    pressEscape(screen.getByRole("textbox", { name: "Message" }));
    expect(view.layer).toHaveBeenCalledWith("popup");
    expect(view.layer).toHaveBeenCalledWith("document");
  });
});

describe("inside a floating Tabs.Popup", () => {
  // Stopping ends the generation, as a real chat's status would.
  const Dock = ({ onStop }: { onStop: () => void }) => {
    const [generating, setGenerating] = useState(true);
    const stop = () => {
      onStop();
      setGenerating(false);
    };
    return (
      <Tabs.Root defaultItems={["chat"]} defaultValue="chat">
        <Tabs.List>
          {(id) => (
            <Tabs.Trigger value={id} data-testid={`tab-${id}`}>
              {id}
            </Tabs.Trigger>
          )}
        </Tabs.List>
        <Tabs.Portal>
          <Tabs.Positioner>
            <Tabs.Popup>
              <Tabs.Viewport>
                {() => <ChatComposer name="Reply" generating={generating} onStop={stop} />}
              </Tabs.Viewport>
            </Tabs.Popup>
          </Tabs.Positioner>
        </Tabs.Portal>
      </Tabs.Root>
    );
  };

  test("the first Escape stops generating, the second closes the popup", async () => {
    const onStop = mock();
    const { getByTestId } = render(<Dock onStop={onStop} />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    const reply = screen.getByRole("textbox", { name: "Reply" });

    pressEscape(reply);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(getByTestId("tab-chat").getAttribute("aria-expanded")).toBe("true");

    pressEscape(reply);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(getByTestId("tab-chat").getAttribute("aria-expanded")).toBe("false");
  });
});
