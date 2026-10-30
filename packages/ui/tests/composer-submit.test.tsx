import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, type MouseEvent, useState } from "react";
import { AskUser } from "../src/ask-user";
import { Composer } from "../src/composer";
import { useComposer } from "../src/composer/store";
import type { AskUserQuestion, ComposerSubmitData } from "../src/composer/types";

type ChatProps = {
  initial?: string;
  name?: string;
  rootProps?: Partial<ComponentProps<typeof Composer.Root>>;
  submitProps?: Partial<ComponentProps<typeof Composer.Submit>>;
  onSubmit?: (data: ComposerSubmitData) => void;
};

const Chat = ({
  initial = "hello",
  name,
  rootProps,
  submitProps,
  onSubmit = () => {},
}: ChatProps) => {
  const [value, setValue] = useState(initial);
  return (
    <Composer.Root onSubmit={onSubmit} {...rootProps}>
      <Composer.Textarea aria-label="Message" name={name} value={value} onValueChange={setValue} />
      <Composer.Submit {...submitProps} />
    </Composer.Root>
  );
};

const editor = () => screen.getByRole("textbox", { name: "Message" });
const pressEnter = () => act(() => void fireEvent.keyDown(editor(), { key: "Enter" }));
const clickSubmit = () => act(() => void fireEvent.click(screen.getByRole("button")));

afterEach(cleanup);

describe("the root element", () => {
  test("is a div, with no form in the container", () => {
    const { container } = render(<Chat />);
    const root = container.querySelector("[data-composer-root]");
    expect(root?.tagName).toBe("DIV");
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("Enter", () => {
  test("sends the text once and clears the editor", () => {
    const onSubmit = mock();
    render(<Chat onSubmit={onSubmit} />);

    pressEnter();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ kind: "message", text: "hello", files: [] });
    expect(editor().textContent).toBe("");
  });

  test("does nothing while a submission is in flight", () => {
    const onSubmit = mock();
    render(<Chat onSubmit={onSubmit} rootProps={{ isSubmitting: true }} />);

    pressEnter();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("Composer.Submit", () => {
  test("sends the same way as Enter", () => {
    const onSubmit = mock();
    render(<Chat onSubmit={onSubmit} />);

    clickSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ kind: "message", text: "hello", files: [] });
    expect(editor().textContent).toBe("");
  });

  test("an onClick that prevents default cancels the send", () => {
    const onSubmit = mock();
    const onClick = mock((event: MouseEvent) => event.preventDefault());
    render(<Chat onSubmit={onSubmit} submitProps={{ onClick }} />);

    clickSubmit();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(editor().textContent).toBe("hello");
  });

  test("an onClick that leaves the event alone runs before the send", () => {
    const calls: string[] = [];
    render(
      <Chat
        onSubmit={() => void calls.push("submit")}
        submitProps={{ onClick: () => void calls.push("click") }}
      />,
    );

    clickSubmit();
    expect(calls).toEqual(["click", "submit"]);
  });

  test("while generating, a click stops and does not send", () => {
    const onSubmit = mock();
    const onStop = mock();
    render(<Chat onSubmit={onSubmit} submitProps={{ isGenerating: true, onStop }} />);

    clickSubmit();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("inside a consumer's own form", () => {
  test("nests without a React warning, sends without submitting the form, and feeds its FormData", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    const onSubmit = mock();
    const onFormSubmit = mock((event: Event) => event.preventDefault());
    const { container } = render(
      <form aria-label="Outer">
        <Chat onSubmit={onSubmit} name="prompt" initial="from the form" />
      </form>,
    );
    const form = container.querySelector("form") as HTMLFormElement;
    form.addEventListener("submit", onFormSubmit);

    pressEnter();

    const warnings = consoleError.mock.calls.filter((args) => args.join(" ").includes("<form>"));
    consoleError.mockRestore();
    expect(warnings).toEqual([]);
    expect(onFormSubmit).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("Composer.Submit sends without submitting the form", () => {
    const onSubmit = mock();
    const onFormSubmit = mock((event: Event) => event.preventDefault());
    const { container } = render(
      <form aria-label="Outer">
        <Chat onSubmit={onSubmit} />
      </form>,
    );
    container.querySelector("form")?.addEventListener("submit", onFormSubmit);

    clickSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onFormSubmit).not.toHaveBeenCalled();
  });

  test("the textarea's name puts its text in the form's FormData", () => {
    const { container } = render(
      <form aria-label="Outer">
        <Chat name="prompt" initial="from the form" />
      </form>,
    );
    const form = container.querySelector("form") as HTMLFormElement;

    expect(new FormData(form).get("prompt")).toBe("from the form");
  });
});

describe("render={<form />}", () => {
  const asForm = { render: <form aria-label="Composer" /> };

  test("Enter sends", () => {
    const onSubmit = mock();
    render(<Chat onSubmit={onSubmit} rootProps={asForm} />);

    pressEnter();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("Submit sends", () => {
    const onSubmit = mock();
    render(<Chat onSubmit={onSubmit} rootProps={asForm} />);

    clickSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("a submit event on the form sends and is default-prevented", () => {
    const onSubmit = mock();
    render(<Chat onSubmit={onSubmit} rootProps={asForm} />);

    const notPrevented = fireEvent.submit(screen.getByRole("form", { name: "Composer" }));
    expect(notPrevented).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("a submit event from a descendant is left alone", () => {
    const onSubmit = mock();
    render(
      <Composer.Root onSubmit={onSubmit} render={<form />}>
        <Composer.Textarea aria-label="Message" value="hello" />
        <div data-testid="descendant" />
      </Composer.Root>,
    );

    const notPrevented = fireEvent.submit(screen.getByTestId("descendant"));
    expect(notPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("AskUser.Continue", () => {
  const QUESTIONS: AskUserQuestion[] = [
    { question: "Which database?", options: [{ label: "PostgreSQL" }, { label: "SQLite" }] },
  ];

  const Questions = () => {
    const askUser = useComposer((composer) => composer.askUser);
    const question = askUser.questions?.[askUser.step];
    if (!question) return null;
    return (
      <>
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
        <AskUser.Continue>Continue</AskUser.Continue>
      </>
    );
  };

  test("on the last step sends the answers", () => {
    const onSubmit = mock();
    render(
      <Composer.Root questions={QUESTIONS} onSubmit={onSubmit}>
        <Composer.Textarea aria-label="Message" />
        <Questions />
      </Composer.Root>,
    );

    act(() => void fireEvent.click(screen.getByRole("radio", { name: "SQLite" })));
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Continue" })));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: "answers",
      answers: [{ question: "Which database?", option: "SQLite" }],
    });
  });
});
