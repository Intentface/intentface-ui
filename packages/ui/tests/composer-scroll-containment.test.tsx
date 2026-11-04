import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "../src/composer";
import { scrollCaretIntoView } from "../src/composer/editor-dom";
import { useComposer } from "../src/composer/store";
import type { ComposerQuestion } from "../src/composer/types";
import { scrollIntoViewWithin } from "../src/internal/scroll-into-view-within";

// A composer embedded in a scrolling page scrolls only its own scroll areas:
// programmatic writes and the question flow's focus moves must leave the page
// where it is (CHAT-42).

// happy-dom has no layout, so each element gets a stubbed box.
type Box = { top: number; height: number; scrollHeight?: number };

const place = (element: HTMLElement, { top, height, scrollHeight = height }: Box) => {
  element.getBoundingClientRect = () =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 0 }) as DOMRect;
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  Object.defineProperty(element, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(element, "scrollTop", { value: 0, writable: true, configurable: true });
};

// page (scrolls) > composer root > text area (may scroll) > editor
const embeddedComposer = ({ textAreaOverflows }: { textAreaOverflows: boolean }) => {
  const page = document.createElement("div");
  const composer = document.createElement("div");
  const textArea = document.createElement("div");
  const editor = document.createElement("div");
  page.style.overflowY = "auto";
  textArea.style.overflowY = "auto";
  composer.setAttribute("data-composer-root", "");
  page.append(composer);
  composer.append(textArea);
  textArea.append(editor);
  document.body.append(page);

  place(page, { top: 100, height: 600, scrollHeight: 2000 });
  place(composer, { top: 400, height: 140 });
  place(textArea, { top: 410, height: 100, scrollHeight: textAreaOverflows ? 400 : 100 });
  place(editor, { top: 410, height: textAreaOverflows ? 400 : 100 });
  return { page, composer, textArea, editor };
};

const rectOf = (rect: Partial<DOMRect>) =>
  ({ top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0, ...rect }) as DOMRect;

// A range with a stubbed box that records where it was placed.
const fakeRange = (rect: Partial<DOMRect>) => {
  const range = {
    startContainer: document.body as Node,
    startOffset: 0,
    selectedNode: null as Node | null,
    setStart: (container: Node, offset: number) => {
      range.startContainer = container;
      range.startOffset = offset;
    },
    collapse: () => {},
    selectNode: (node: Node) => {
      range.selectedNode = node;
    },
    getBoundingClientRect: () => rectOf(rect),
  };
  return range;
};

// The selection's focus point, and the boxes measured there: the caret's own,
// then — when that is empty — the line's.
const caretAt = (
  rect: Partial<DOMRect>,
  point: { container: Node; offset: number } = { container: document.body, offset: 0 },
  lineRect: Partial<DOMRect> = {},
) => {
  const caret = fakeRange(rect);
  const line = fakeRange(lineRect);
  const ranges = [caret, line];
  let created = 0;
  document.getSelection = () =>
    ({ rangeCount: 1, focusNode: point.container, focusOffset: point.offset }) as never;
  document.createRange = () => ranges[created++] as never;
  return { caret, line };
};

describe("scrollCaretIntoView", () => {
  const getSelection = document.getSelection.bind(document);
  const createRange = document.createRange.bind(document);
  afterEach(() => {
    document.getSelection = getSelection;
    document.createRange = createRange;
    document.body.innerHTML = "";
  });

  test("a caret with no box and no line to measure scrolls nothing", () => {
    const { page, textArea, editor } = embeddedComposer({ textAreaOverflows: false });
    caretAt({ top: 0, bottom: 0, height: 0 }, { container: editor, offset: 0 });
    scrollCaretIntoView(editor);
    expect(page.scrollTop).toBe(0);
    expect(textArea.scrollTop).toBe(0);
  });

  test("the walk stops at the composer: a caret outside the page's view leaves the page alone", () => {
    const { page, editor } = embeddedComposer({ textAreaOverflows: false });
    caretAt({ top: 40, bottom: 60, height: 20 });
    scrollCaretIntoView(editor);
    expect(page.scrollTop).toBe(0);
  });

  test("a caret on an empty last line is measured by its <br> and scrolled into view", () => {
    const { page, textArea, editor } = embeddedComposer({ textAreaOverflows: true });
    // "text\n" renders as text, a line break, and the padding break that gives
    // the empty last line its box. The caret sits before that padding break.
    editor.append("text", document.createElement("br"), document.createElement("br"));
    const { line } = caretAt(
      { top: 0, bottom: 0, height: 0 },
      { container: editor, offset: 2 },
      { top: 530, bottom: 550, height: 20 },
    );
    scrollCaretIntoView(editor);
    expect(line.selectedNode).toBe(editor.childNodes[2] as Node);
    expect(textArea.scrollTop).toBe(40);
    expect(page.scrollTop).toBe(0);
  });

  test("overflowing text scrolls the caret into view inside the composer's own text area", () => {
    const { page, textArea, editor } = embeddedComposer({ textAreaOverflows: true });
    caretAt({ top: 530, bottom: 550, height: 20 });
    scrollCaretIntoView(editor);
    expect(textArea.scrollTop).toBe(40);
    expect(page.scrollTop).toBe(0);
  });

  test("a selection is measured at its focus end, not across its full extent", () => {
    const { editor } = embeddedComposer({ textAreaOverflows: true });
    editor.append("first line", "last line");
    const focusNode = editor.childNodes[1] as Node;
    const { caret } = caretAt(
      { top: 530, bottom: 550, height: 20 },
      { container: focusNode, offset: 4 },
    );
    scrollCaretIntoView(editor);
    expect(caret.startContainer).toBe(focusNode);
    expect(caret.startOffset).toBe(4);
  });
});

describe("scrollIntoViewWithin", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("the boundary itself may scroll", () => {
    const { textArea, editor } = embeddedComposer({ textAreaOverflows: true });
    scrollIntoViewWithin({ top: 380, bottom: 400, height: 20 } as DOMRect, editor, textArea);
    expect(textArea.scrollTop).toBe(-30);
  });

  test("nested scroll areas inside the boundary each scroll their share", () => {
    const { page, composer, textArea, editor } = embeddedComposer({ textAreaOverflows: true });
    // The text area sits partly below the scrollable composer's view (400–540).
    composer.style.overflowY = "auto";
    place(composer, { top: 400, height: 140, scrollHeight: 300 });
    place(textArea, { top: 520, height: 100, scrollHeight: 400 });
    scrollIntoViewWithin({ top: 700, bottom: 720, height: 20 } as DOMRect, editor, composer);
    expect(textArea.scrollTop).toBe(100);
    expect(composer.scrollTop).toBe(80);
    expect(page.scrollTop).toBe(0);
  });

  test("an element with no scrollable ancestor inside the boundary scrolls nothing", () => {
    const { page, editor } = embeddedComposer({ textAreaOverflows: false });
    scrollIntoViewWithin({ top: 0, bottom: 20, height: 20 } as DOMRect, editor, editor);
    expect(page.scrollTop).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The question flow's own focus moves
// ---------------------------------------------------------------------------

const REQUESTS: ComposerQuestion[] = [
  {
    id: "database",
    label: "Which database?",
    options: [{ label: "PostgreSQL" }, { label: "SQLite" }],
  },
];

const RequestOptions = () => {
  const questions = useComposer((composer) => composer.questions);
  const question = questions.items?.[questions.step];
  if (!question) return null;
  return (
    <Composer.Question>
      <Composer.QuestionOptions ref={questions.optionsRef}>
        {question.options.map((option) => (
          <Composer.QuestionOption
            key={option.label}
            value={option.label}
            onSelect={() => questions.toggleOption(option.label)}
          >
            {option.label}
          </Composer.QuestionOption>
        ))}
      </Composer.QuestionOptions>
    </Composer.Question>
  );
};

// activateQuestions moves focus into the options one frame past the commit.
const flushFrames = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

describe("question focus moves keep the page in place", () => {
  const focus = HTMLElement.prototype.focus;
  let calls: { element: HTMLElement; options?: FocusOptions }[] = [];

  beforeEach(() => {
    calls = [];
    HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
      calls.push({ element: this, options });
      focus.call(this, options);
    };
  });

  afterEach(() => {
    HTMLElement.prototype.focus = focus;
  });

  const renderQuestion = async (container?: HTMLElement) => {
    render(
      <Composer.Root questions={REQUESTS} onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" />
        <RequestOptions />
      </Composer.Root>,
      { container },
    );
    await flushFrames();
  };

  const focusesOf = (element: HTMLElement) => calls.filter((call) => call.element === element);

  test("focus moves into the first option without scrolling", async () => {
    await renderQuestion();
    const first = screen.getByRole("radio", { name: "PostgreSQL" });
    expect(focusesOf(first).at(-1)?.options).toEqual({ preventScroll: true });
  });

  test("arrowing between options does not scroll", async () => {
    await renderQuestion();
    act(
      () => void fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowDown" }),
    );
    const second = screen.getByRole("radio", { name: "SQLite" });
    expect(document.activeElement).toBe(second);
    expect(focusesOf(second).at(-1)?.options).toEqual({ preventScroll: true });
  });

  test("arrowing to an option outside its list's view scrolls the list, not the page", async () => {
    const page = document.createElement("div");
    page.style.overflowY = "auto";
    document.body.append(page);
    await renderQuestion(page);
    // The list shows one option at a time; the second sits just below its view,
    // and the list runs past the page's view, so a boundary that leaked out of
    // the question would scroll the page too.
    const list = screen.getByRole("radiogroup");
    list.style.overflowY = "auto";
    place(page, { top: 0, height: 420, scrollHeight: 2000 });
    place(list, { top: 400, height: 40, scrollHeight: 80 });
    place(screen.getByRole("radio", { name: "SQLite" }), { top: 440, height: 40 });

    act(
      () => void fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowDown" }),
    );
    expect(list.scrollTop).toBe(40);
    expect(page.scrollTop).toBe(0);
  });

  test("typing to answer moves focus back to the input without scrolling", async () => {
    await renderQuestion();
    act(() => void fireEvent.keyDown(document.activeElement ?? document.body, { key: "a" }));
    const input = screen.getByRole("textbox", { name: "Message" });
    expect(document.activeElement).toBe(input);
    expect(focusesOf(input).at(-1)?.options).toEqual({ preventScroll: true });
  });
});
