import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Activity, StrictMode, useState } from "react";
import type { AttachmentItem } from "../src/attachments";
import { Composer } from "../src/composer";
import type { ComposerSubmitData } from "../src/composer/types";

type ChatProps = {
  withAttachments?: boolean;
  globalDrop?: boolean;
  onSubmit?: (data: ComposerSubmitData) => void;
};

const Chat = ({ withAttachments = false, globalDrop, onSubmit = () => {} }: ChatProps) => (
  <Composer.Root onSubmit={onSubmit}>
    {withAttachments && <Composer.Attachments globalDrop={globalDrop} />}
    <Composer.Textarea aria-label="Message" />
    <Composer.Submit />
  </Composer.Root>
);

const Toggled = ({ onSubmit, globalDrop }: Pick<ChatProps, "onSubmit" | "globalDrop">) => {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setMounted(false)}>
        unmount attachments
      </button>
      <Chat withAttachments={mounted} globalDrop={globalDrop} onSubmit={onSubmit} />
    </>
  );
};

const editor = () => screen.getByRole("textbox", { name: "Message" });
const submitButton = () => screen.getByRole("button", { name: /send|submit/i });
const root = () => document.querySelector<HTMLElement>("[data-composer-root]") as HTMLElement;
const unmountAttachments = () =>
  act(() => void fireEvent.click(screen.getByText("unmount attachments")));

const pngFile = () => new File(["x"], "a.png", { type: "image/png" });

const dragData = (file = pngFile()) => ({
  dataTransfer: { types: ["Files"], files: [file] },
});

const drop = (target: Element) => {
  let notPrevented = true;
  act(() => {
    notPrevented = fireEvent.drop(target, dragData());
  });
  return { defaultPrevented: !notPrevented };
};

const paste = ({ file, text }: { file?: File; text?: string }) =>
  act(() => {
    const items = file ? [{ kind: "file", getAsFile: () => file }] : [];
    fireEvent.paste(editor(), {
      clipboardData: {
        items,
        getData: (type: string) => (type === "text/plain" ? (text ?? "") : ""),
      },
    });
  });

const send = () => act(() => void fireEvent.click(submitButton()));

const sentFiles = (onSubmit: { mock: { calls: ComposerSubmitData[][] } }) =>
  onSubmit.mock.calls.flatMap(([data]) => (data?.kind === "message" ? data.files : []));

afterEach(cleanup);

describe("without Composer.Attachments", () => {
  test("a dropped file is ignored and left to the browser", () => {
    const onSubmit = mock();
    render(<Chat onSubmit={onSubmit} />);

    const { defaultPrevented } = drop(root());

    expect(defaultPrevented).toBe(false);
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    send();
    expect(sentFiles(onSubmit)).toHaveLength(0);
  });

  test("dragging a file over the root does not mark it as dragging", () => {
    render(<Chat />);

    act(() => void fireEvent.dragEnter(root(), dragData()));
    expect(root().hasAttribute("data-dragging")).toBe(false);
    act(() => void fireEvent.dragOver(root(), dragData()));
    expect(root().hasAttribute("data-dragging")).toBe(false);
  });

  test("a pasted file adds nothing", () => {
    const onSubmit = mock();
    render(<Chat onSubmit={onSubmit} />);

    paste({ file: pngFile() });

    expect(submitButton().hasAttribute("disabled")).toBe(true);
    send();
    expect(sentFiles(onSubmit)).toHaveLength(0);
  });

  test("a paste carrying a file and text inserts the text", () => {
    render(<Chat />);

    paste({ file: pngFile(), text: "pasted words" });

    expect(editor().textContent).toBe("pasted words");
  });
});

describe("with Composer.Attachments", () => {
  test("a dropped file is taken and submitted", () => {
    const onSubmit = mock();
    render(<Chat withAttachments onSubmit={onSubmit} />);

    const { defaultPrevented } = drop(root());

    expect(defaultPrevented).toBe(true);
    send();
    expect(sentFiles(onSubmit)).toHaveLength(1);
  });

  test("a pasted file is taken and submitted", () => {
    const onSubmit = mock();
    render(<Chat withAttachments onSubmit={onSubmit} />);

    paste({ file: pngFile() });

    send();
    expect(sentFiles(onSubmit)).toHaveLength(1);
  });

  test("a dragged file marks the root as dragging", () => {
    render(<Chat withAttachments />);

    act(() => void fireEvent.dragEnter(root(), dragData()));
    expect(root().hasAttribute("data-dragging")).toBe(true);
  });
});

describe("unmounting Composer.Attachments", () => {
  test("ignores later drops and pastes", () => {
    const onSubmit = mock();
    render(<Toggled onSubmit={onSubmit} />);

    unmountAttachments();
    const { defaultPrevented } = drop(root());
    paste({ file: pngFile() });

    expect(defaultPrevented).toBe(false);
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    send();
    expect(sentFiles(onSubmit)).toHaveLength(0);
  });

  test("clears the files it held, so none is sent unseen", () => {
    const onSubmit = mock();
    render(<Toggled onSubmit={onSubmit} />);

    drop(root());
    expect(submitButton().hasAttribute("disabled")).toBe(false);
    unmountAttachments();

    expect(submitButton().hasAttribute("disabled")).toBe(true);
    send();
    expect(sentFiles(onSubmit)).toHaveLength(0);
  });

  test("clears a drag that was under way", () => {
    render(<Toggled />);

    act(() => void fireEvent.dragEnter(root(), dragData()));
    expect(root().hasAttribute("data-dragging")).toBe(true);
    unmountAttachments();

    expect(root().hasAttribute("data-dragging")).toBe(false);
  });
});

describe("globalDrop", () => {
  test("takes a drop outside the root while mounted", () => {
    const onSubmit = mock();
    render(<Chat withAttachments globalDrop onSubmit={onSubmit} />);

    const { defaultPrevented } = drop(document.body);

    expect(defaultPrevented).toBe(true);
    send();
    expect(sentFiles(onSubmit)).toHaveLength(1);
  });

  test("stops taking drops outside the root after unmount", () => {
    const onSubmit = mock();
    render(<Toggled globalDrop onSubmit={onSubmit} />);

    unmountAttachments();
    const { defaultPrevented } = drop(document.body);

    expect(defaultPrevented).toBe(false);
    expect(submitButton().hasAttribute("disabled")).toBe(true);
  });
});

describe("under StrictMode", () => {
  test("drops still work with Composer.Attachments mounted", () => {
    const onSubmit = mock();
    render(
      <StrictMode>
        <Chat withAttachments onSubmit={onSubmit} />
      </StrictMode>,
    );

    const { defaultPrevented } = drop(root());

    expect(defaultPrevented).toBe(true);
    send();
    expect(sentFiles(onSubmit)).toHaveLength(1);
  });
});

describe("two Composer.Attachments at once", () => {
  const Pair = ({ onSubmit }: Pick<ChatProps, "onSubmit">) => {
    const [both, setBoth] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setBoth(false)}>
          drop one
        </button>
        <Composer.Root onSubmit={onSubmit}>
          <Composer.Attachments />
          {both && <Composer.Attachments />}
          <Composer.Textarea aria-label="Message" />
          <Composer.Submit />
        </Composer.Root>
      </>
    );
  };

  test("removing one leaves intake and the files to the other", () => {
    const onSubmit = mock();
    render(<Pair onSubmit={onSubmit} />);

    drop(root());
    act(() => void fireEvent.click(screen.getByText("drop one")));
    const { defaultPrevented } = drop(root());

    expect(defaultPrevented).toBe(true);
    send();
    expect(sentFiles(onSubmit)).toHaveLength(2);
  });
});

describe("a keyed replacement", () => {
  const Replaced = ({
    onSubmit,
    destroys,
  }: Pick<ChatProps, "onSubmit"> & {
    destroys: Record<string, (item: AttachmentItem) => void>;
  }) => {
    const [key, setKey] = useState("a");
    return (
      <>
        <button type="button" onClick={() => setKey("b")}>
          replace
        </button>
        <Composer.Root onSubmit={onSubmit}>
          <Composer.Attachments key={key} destroy={destroys[key]} />
          <Composer.Textarea aria-label="Message" />
          <Composer.Submit />
        </Composer.Root>
      </>
    );
  };

  test("keeps the files and releases each with the destroy that took it", async () => {
    const released: string[] = [];
    const destroys = {
      a: () => void released.push("a"),
      b: () => void released.push("b"),
    };
    const onSubmit = mock();
    render(<Replaced onSubmit={onSubmit} destroys={destroys} />);

    drop(root());
    act(() => void fireEvent.click(screen.getByText("replace")));
    drop(root());
    await act(async () => void fireEvent.click(submitButton()));

    expect(sentFiles(onSubmit)).toHaveLength(2);
    expect(released.sort()).toEqual(["a", "b"]);
  });
});

describe("Composer.Attachments in a hidden <Activity>", () => {
  const Hideable = ({ onSubmit }: Pick<ChatProps, "onSubmit">) => {
    const [mode, setMode] = useState<"visible" | "hidden" | "gone">("visible");
    return (
      <>
        <button type="button" onClick={() => setMode("hidden")}>
          hide
        </button>
        <button type="button" onClick={() => setMode("visible")}>
          show
        </button>
        <button type="button" onClick={() => setMode("gone")}>
          remove
        </button>
        <Composer.Root onSubmit={onSubmit}>
          {mode !== "gone" && (
            <Activity mode={mode === "hidden" ? "hidden" : "visible"}>
              <Composer.Attachments />
            </Activity>
          )}
          <Composer.Textarea aria-label="Message" />
          <Composer.Submit />
        </Composer.Root>
      </>
    );
  };
  const click = (label: string) => act(() => void fireEvent.click(screen.getByText(label)));

  test("keeps its files for when it is shown again", () => {
    const onSubmit = mock();
    render(<Hideable onSubmit={onSubmit} />);

    drop(root());
    click("hide");
    click("show");
    send();

    expect(sentFiles(onSubmit)).toHaveLength(1);
  });

  test("clears its files once removed while hidden", () => {
    const onSubmit = mock();
    render(<Hideable onSubmit={onSubmit} />);

    drop(root());
    click("hide");
    click("remove");
    send();

    expect(sentFiles(onSubmit)).toHaveLength(0);
    expect(submitButton().hasAttribute("disabled")).toBe(true);
  });
});

describe("a drag cut short by an unmount", () => {
  test("leaves no depth behind for the next mount", () => {
    const Remount = () => {
      const [mounted, setMounted] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setMounted((value) => !value)}>
            toggle
          </button>
          <Chat withAttachments={mounted} />
        </>
      );
    };
    render(<Remount />);
    const toggle = () => act(() => void fireEvent.click(screen.getByText("toggle")));

    act(() => void fireEvent.dragEnter(root(), dragData()));
    toggle();
    act(() => void fireEvent.dragLeave(root(), dragData()));
    toggle();
    act(() => void fireEvent.dragEnter(root(), dragData()));
    act(() => void fireEvent.dragLeave(root(), dragData()));

    expect(root().hasAttribute("data-dragging")).toBe(false);
  });
});
