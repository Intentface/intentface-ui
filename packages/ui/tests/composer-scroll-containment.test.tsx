import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AskUser } from "../src/ask-user";
import { Composer } from "../src/composer";
import { scrollCaretIntoView } from "../src/composer/editor-dom";
import { useComposer } from "../src/composer/store";
import type { AskUserQuestion, CommandItemData } from "../src/composer/types";
import { scrollIntoViewWithin } from "../src/internal/scroll-into-view-within";

// A composer embedded in a scrolling page scrolls only its own scroll areas:
// programmatic writes, the ask-user flow's focus moves and the command list's
// highlight must leave the page where it is (CHAT-42, CHAT-48).

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
    textArea.scrollTop = 100;
    const rect = { top: 380, bottom: 400, height: 20 } as DOMRect;
    scrollIntoViewWithin({ rect, from: editor }, textArea);
    expect(textArea.scrollTop).toBe(70);
  });

  test("nested scroll areas inside the boundary each scroll their share", () => {
    const { page, composer, textArea, editor } = embeddedComposer({ textAreaOverflows: true });
    // The text area sits partly below the scrollable composer's view (400–540).
    composer.style.overflowY = "auto";
    place(composer, { top: 400, height: 140, scrollHeight: 300 });
    place(textArea, { top: 520, height: 100, scrollHeight: 400 });
    const rect = { top: 700, bottom: 720, height: 20 } as DOMRect;
    scrollIntoViewWithin({ rect, from: editor }, composer);
    expect(textArea.scrollTop).toBe(100);
    expect(composer.scrollTop).toBe(80);
    expect(page.scrollTop).toBe(0);
  });

  test("an element with no scrollable ancestor inside the boundary scrolls nothing", () => {
    const { page, editor } = embeddedComposer({ textAreaOverflows: false });
    scrollIntoViewWithin(
      { rect: { top: 0, bottom: 20, height: 20 } as DOMRect, from: editor },
      editor,
    );
    expect(page.scrollTop).toBe(0);
  });

  test("an element target aligns by `block`, its scroll-margin included", () => {
    const { page, composer, textArea, editor } = embeddedComposer({ textAreaOverflows: true });
    const line = document.createElement("p");
    line.style.scrollMarginTop = "8px";
    editor.append(line);
    // 120px into the text area's content.
    place(line, { top: 530, height: 20 });
    scrollIntoViewWithin(line, composer, { block: "start" });
    expect(textArea.scrollTop).toBe(112);
    expect(page.scrollTop).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The ask-user flow's own focus moves
// ---------------------------------------------------------------------------

const QUESTIONS: AskUserQuestion[] = [
  { question: "Which database?", options: [{ label: "PostgreSQL" }, { label: "SQLite" }] },
];

const AskUserOptions = () => {
  const askUser = useComposer((composer) => composer.askUser);
  const question = askUser.questions?.[askUser.step];
  if (!question) return null;
  return (
    <AskUser.Root>
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
    </AskUser.Root>
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

describe("ask-user focus moves keep the page in place", () => {
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
      <Composer.Root questions={QUESTIONS} onSubmit={() => {}}>
        <Composer.Textarea aria-label="Message" />
        <AskUserOptions />
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

// ---------------------------------------------------------------------------
// The command list's highlight
// ---------------------------------------------------------------------------

const ITEMS: CommandItemData[] = [
  { value: "rasmus", label: "Rasmus" },
  { value: "maija", label: "Maija" },
];

describe("the command list's highlight keeps the page in place", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("arrowing to a row outside the list's view scrolls the list, not the page", () => {
    const page = document.createElement("div");
    page.style.overflowY = "auto";
    document.body.append(page);
    const store = Composer.createStore();
    render(
      <Composer.Root
        store={store}
        onSubmit={() => {}}
        commands={{ "@": { kind: "insert", trigger: "word-boundary", items: ITEMS } }}
      >
        <Composer.Textarea aria-label="Message" />
        <Composer.Command prefix="@">
          <Composer.CommandList>
            {(item) => (
              <Composer.CommandItem key={item.value} value={item.value}>
                {item.label}
              </Composer.CommandItem>
            )}
          </Composer.CommandList>
        </Composer.Command>
      </Composer.Root>,
      { container: page },
    );
    act(() => store.setCommands({ active: true, trigger: "@", query: "" }));

    // The list pads its view by 4px at each edge; the second row sits just
    // below it, and the list runs past the page's view, so a scroll that
    // leaked out of the composer would move the page.
    const list = page.querySelector<HTMLElement>("[data-composer-command-list]");
    if (!list) throw new Error("command list not rendered");
    list.style.overflowY = "auto";
    list.style.scrollPaddingTop = "4px";
    list.style.scrollPaddingBottom = "4px";
    place(page, { top: 0, height: 420, scrollHeight: 2000 });
    place(list, { top: 400, height: 60, scrollHeight: 160 });
    place(screen.getByRole("option", { name: "Maija" }), { top: 460, height: 40 });

    act(() => store.moveHighlight(1));
    // The row's bottom (100px in) at the padded band's bottom: 100 - 4 - (60 - 8).
    expect(list.scrollTop).toBe(44);
    expect(page.scrollTop).toBe(0);
  });
});
