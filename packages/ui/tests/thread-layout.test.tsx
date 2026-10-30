import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { Message } from "../src/message";
import { Thread, type ThreadAutoScrollMode } from "../src/thread";

const RESERVE = "var(--thread-turn-min-height, 0px)";

type TranscriptProps = {
  mode: ThreadAutoScrollMode;
  ids: string[];
  asTurns?: boolean;
  trailing?: boolean;
};

const Transcript = ({ mode, ids, asTurns = true, trailing = false }: TranscriptProps) => (
  <Thread.Root autoScroll={mode}>
    <Thread.Viewport>
      <Thread.Content data-testid="content">
        {ids.map((id) =>
          asTurns ? (
            <Message.Turn key={id} data-testid={id}>
              {id}
            </Message.Turn>
          ) : (
            <div key={id} data-testid={id}>
              {id}
            </div>
          ),
        )}
        {trailing && <div data-testid="trailing">typing…</div>}
      </Thread.Content>
    </Thread.Viewport>
    <Thread.Composer data-testid="composer" />
  </Thread.Root>
);

// The thread watches its content with a MutationObserver, which reports after the commit.
const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe("Thread.Composer", () => {
  test("docks itself along the bottom edge of the root", () => {
    const { getByTestId } = render(<Transcript mode="follow" ids={["a"]} />);
    const style = (getByTestId("composer") as HTMLElement).style;

    expect(style.position).toBe("absolute");
    expect(style.bottom).toBe("0px");
  });

  test("spans the root's width", () => {
    // happy-dom drops inset-inline, so read it off the server markup.
    expect(renderToString(<Thread.Composer />)).toContain("inset-inline:0");
  });

  test("a style prop wins over the default position", () => {
    const { getByTestId } = render(
      <Thread.Root>
        <Thread.Composer data-testid="composer" style={{ position: "relative", bottom: "8px" }} />
      </Thread.Root>,
    );
    const style = (getByTestId("composer") as HTMLElement).style;

    expect(style.position).toBe("relative");
    expect(style.bottom).toBe("8px");
  });
});

describe("Thread.Root dock variables", () => {
  const original = HTMLElement.prototype.getBoundingClientRect;

  // Layout does not exist in happy-dom, so give the root and the dock a box.
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const box = { top: 0, bottom: 0, width: 0, height: 0 };
      if (this.hasAttribute("data-thread-root")) box.bottom = 600;
      if (this.hasAttribute("data-thread-composer")) {
        Object.assign(box, { top: 540, width: 640.4, height: 60.2 });
      }
      return box as DOMRect;
    };
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
  });

  test("publishes the dock's inset and own size on the root", () => {
    const { container } = render(<Transcript mode="follow" ids={["a"]} />);
    const root = container.querySelector("[data-thread-root]") as HTMLElement;

    expect(root.style.getPropertyValue("--thread-dock-inset")).toBe("92px");
    expect(root.style.getPropertyValue("--thread-dock-height")).toBe("60px");
    expect(root.style.getPropertyValue("--thread-dock-width")).toBe("640px");
  });

  test("no longer publishes the overlay-named variable", () => {
    const { container } = render(<Transcript mode="follow" ids={["a"]} />);
    const root = container.querySelector("[data-thread-root]") as HTMLElement;

    expect(root.style.getPropertyValue("--thread-overlay-bottom-height")).toBe("");
  });

  test("writes no dock variable while there is no dock", () => {
    const { container } = render(
      <Thread.Root>
        <Thread.Viewport>
          <Thread.Content />
        </Thread.Viewport>
      </Thread.Root>,
    );
    const root = container.querySelector("[data-thread-root]") as HTMLElement;

    expect(root.style.getPropertyValue("--thread-dock-inset")).toBe("");
    expect(root.style.getPropertyValue("--thread-dock-height")).toBe("");
    expect(root.style.getPropertyValue("--thread-dock-width")).toBe("");
  });
});

describe("Thread.Content reserve", () => {
  const minHeightOf = (el: HTMLElement) => el.style.getPropertyValue("min-height");

  for (const mode of ["follow", "jump"] as const) {
    test(`"${mode}" reserves on the last turn only`, () => {
      const { getByTestId } = render(<Transcript mode={mode} ids={["a", "b"]} />);

      expect(minHeightOf(getByTestId("a"))).toBe("");
      expect(minHeightOf(getByTestId("b"))).toBe(RESERVE);
    });

    test(`"${mode}" moves the reserve to a turn appended later`, async () => {
      const { getByTestId, rerender } = render(<Transcript mode={mode} ids={["a", "b"]} />);

      rerender(<Transcript mode={mode} ids={["a", "b", "c"]} />);
      await flush();

      expect(minHeightOf(getByTestId("b"))).toBe("");
      expect(minHeightOf(getByTestId("c"))).toBe(RESERVE);
    });
  }

  for (const mode of ["bottom", "off"] as const) {
    test(`"${mode}" sets nothing`, async () => {
      const { getByTestId, rerender } = render(<Transcript mode={mode} ids={["a", "b"]} />);
      rerender(<Transcript mode={mode} ids={["a", "b", "c"]} />);
      await flush();

      for (const id of ["a", "b", "c"]) expect(minHeightOf(getByTestId(id))).toBe("");
    });
  }

  test("switching to a mode that lands at the bottom clears the reserve", () => {
    const { getByTestId, rerender } = render(<Transcript mode="follow" ids={["a", "b"]} />);
    expect(minHeightOf(getByTestId("b"))).toBe(RESERVE);

    rerender(<Transcript mode="bottom" ids={["a", "b"]} />);

    expect(minHeightOf(getByTestId("b"))).toBe("");
  });

  test("switching to a top-landing mode sets the reserve", () => {
    const { getByTestId, rerender } = render(<Transcript mode="off" ids={["a", "b"]} />);

    rerender(<Transcript mode="jump" ids={["a", "b"]} />);

    expect(minHeightOf(getByTestId("b"))).toBe(RESERVE);
  });

  test("unmounting the thread clears the reserve it set", () => {
    const { getByTestId, unmount } = render(<Transcript mode="follow" ids={["a"]} />);
    const turn = getByTestId("a") as HTMLElement;
    expect(minHeightOf(turn)).toBe(RESERVE);

    unmount();

    expect(minHeightOf(turn)).toBe("");
  });

  test("only clears the element it set the reserve on", async () => {
    const Pair = ({ mode, ids }: { mode: ThreadAutoScrollMode; ids: string[] }) => (
      <Thread.Root autoScroll={mode}>
        <Thread.Viewport>
          <Thread.Content>
            {ids.map((id) => (
              <Message.Turn
                key={id}
                data-testid={id}
                style={id === "a" ? { minHeight: "10px" } : {}}
              >
                {id}
              </Message.Turn>
            ))}
          </Thread.Content>
        </Thread.Viewport>
      </Thread.Root>
    );
    const { getByTestId, rerender } = render(<Pair mode="follow" ids={["a", "b"]} />);

    rerender(<Pair mode="follow" ids={["a", "b", "c"]} />);
    await flush();
    expect(minHeightOf(getByTestId("a"))).toBe("10px");
    expect(minHeightOf(getByTestId("c"))).toBe(RESERVE);

    rerender(<Pair mode="bottom" ids={["a", "b", "c"]} />);
    expect(minHeightOf(getByTestId("a"))).toBe("10px");
    expect(minHeightOf(getByTestId("c"))).toBe("");
  });
});

describe("Thread.Content turn warning", () => {
  let warn: ReturnType<typeof spyOn<Console, "warn">>;

  beforeEach(() => {
    warn = spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  test("stays quiet when the children are turns", async () => {
    const { rerender } = render(<Transcript mode="follow" ids={["a"]} />);
    rerender(<Transcript mode="follow" ids={["a", "b"]} />);
    await flush();

    expect(warn).not.toHaveBeenCalled();
  });

  test("stays quiet when the thread does not reserve", () => {
    render(<Transcript mode="bottom" ids={["a"]} asTurns={false} />);

    expect(warn).not.toHaveBeenCalled();
  });

  test("stays quiet while only the empty-state placeholder shows", () => {
    render(
      <Thread.Root autoScroll="follow">
        <Thread.Viewport>
          <Thread.Content>
            <Thread.Placeholder>Start a conversation</Thread.Placeholder>
          </Thread.Content>
        </Thread.Viewport>
      </Thread.Root>,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  test("stays quiet while the transcript is empty", () => {
    render(<Transcript mode="follow" ids={[]} asTurns={false} />);

    expect(warn).not.toHaveBeenCalled();
  });

  // The reserve goes on the last child, so a turn earlier in the list doesn't help.
  test("warns once when the last child is not a turn", async () => {
    const { rerender } = render(<Transcript mode="follow" ids={["a"]} trailing />);
    rerender(<Transcript mode="follow" ids={["a", "b"]} trailing />);
    await flush();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("Message.Turn");
  });
});
