import { describe, expect, test } from "bun:test";
import {
  attachmentReducer,
  createDragHandlers,
  INITIAL_ATTACHMENT_STATE,
} from "../src/composer/attachments-machine";

// Injected ingestion: hermetic test item factory + destroy spy target.
const config = {
  enabled: true,
  accept: "image/*",
  maxFiles: 2,
  maxFileSize: 1024,
  convert: (file: File) => ({ id: file.name, url: `test:${file.name}`, filename: file.name }),
  destroy: () => {},
};

const imageFile = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: "image/png" });

describe("attachmentReducer", () => {
  test("add accepts matching files and assigns ids", () => {
    const next = attachmentReducer(
      INITIAL_ATTACHMENT_STATE,
      { type: "add", files: [imageFile("a.png")] },
      config,
    );
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.id).toBeTruthy();
    expect(next.error).toBeNull();
  });

  test("add is ignored without an error while disabled", () => {
    const next = attachmentReducer(
      INITIAL_ATTACHMENT_STATE,
      { type: "add", files: [imageFile("a.png")] },
      { ...config, enabled: false },
    );
    expect(next).toBe(INITIAL_ATTACHMENT_STATE);
  });

  test("remove still works while disabled", () => {
    const withItems = attachmentReducer(
      INITIAL_ATTACHMENT_STATE,
      { type: "add", files: [imageFile("a.png")] },
      config,
    );
    const id = withItems.items[0]?.id ?? "";
    const next = attachmentReducer(
      withItems,
      { type: "remove", id },
      { ...config, enabled: false },
    );
    expect(next.items).toHaveLength(0);
  });

  test("add rejects non-matching types with an error", () => {
    const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const next = attachmentReducer(INITIAL_ATTACHMENT_STATE, { type: "add", files: [pdf] }, config);
    expect(next.items).toHaveLength(0);
    expect(next.error).toBe("accept");
  });

  test("add rejects oversized files", () => {
    const big = imageFile("big.png", 4096);
    const next = attachmentReducer(INITIAL_ATTACHMENT_STATE, { type: "add", files: [big] }, config);
    expect(next.error).toBe("max_file_size");
  });

  test("add caps at maxFiles and reports overflow", () => {
    const next = attachmentReducer(
      INITIAL_ATTACHMENT_STATE,
      { type: "add", files: [imageFile("1.png"), imageFile("2.png"), imageFile("3.png")] },
      config,
    );
    expect(next.items).toHaveLength(2);
    expect(next.error).toBe("max_files");
  });

  test("remove deletes by id and clears the error", () => {
    const withItems = attachmentReducer(
      INITIAL_ATTACHMENT_STATE,
      { type: "add", files: [imageFile("a.png")] },
      config,
    );
    const id = withItems.items[0]?.id ?? "";
    const next = attachmentReducer(withItems, { type: "remove", id }, config);
    expect(next.items).toHaveLength(0);
  });

  test("reset returns the initial state", () => {
    const withItems = attachmentReducer(
      INITIAL_ATTACHMENT_STATE,
      { type: "add", files: [imageFile("a.png")] },
      config,
    );
    expect(attachmentReducer(withItems, { type: "reset" }, config)).toBe(INITIAL_ATTACHMENT_STATE);
  });
});

describe("createDragHandlers", () => {
  const fileDragEvent = (type: string) => {
    const event = new Event(type) as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: { types: ["Files"], files: null },
    });
    return event;
  };

  test("enter/leave depth counting avoids flicker", () => {
    const calls: boolean[] = [];
    const handlers = createDragHandlers({
      isInScope: () => true,
      onFiles: () => {},
      setDragging: (active) => calls.push(active),
    });

    handlers.onDragEnter(fileDragEvent("dragenter"));
    handlers.onDragEnter(fileDragEvent("dragenter"));
    handlers.onDragLeave(fileDragEvent("dragleave"));
    expect(calls).toEqual([true, true]);
    handlers.onDragLeave(fileDragEvent("dragleave"));
    expect(calls).toEqual([true, true, false]);
  });

  test("out-of-scope events are ignored", () => {
    const calls: boolean[] = [];
    const handlers = createDragHandlers({
      isInScope: () => false,
      onFiles: () => {},
      setDragging: (active) => calls.push(active),
    });
    handlers.onDragEnter(fileDragEvent("dragenter"));
    expect(calls).toEqual([]);
  });
});
