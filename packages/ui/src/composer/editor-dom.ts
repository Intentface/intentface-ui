// Editor DOM — the adapters between the contenteditable element and the flat
// segment model. The reader and position mapping are pure (they walk a
// minimal structural node view, so tests need no DOM); the materializers at
// the bottom are thin real-DOM wrappers over the pure spec builder.
//
// One taxonomy, three walkers: classifyNode below is the single answer to
// "what is this node?", and leafWidth the single answer to "how many logical
// positions does it occupy?". The reader, logicalRangeFromDom and
// domPointFromLogical all defer to them — when they disagree the caret and the
// model desync, so the rule lives in exactly one place.
//
// Writer/reader pact for line breaks: every "\n" renders as <br>, plus one
// padding <br> when the document is empty or ends with "\n" (an unpadded
// trailing line is unreachable/zero-height). The padding carries
// data-padding-break, so the reader identifies it structurally rather than
// inferring it from position — a native edit that strands it mid-document then
// reads as scaffolding (dropped, dirty) instead of a phantom newline. Unmarked
// trailing <br>s are the browser's own (Chrome keeps an emptied line box
// alive); the trailing trim covers those too.
// Round-trips: "" ↔ <br·pad>, "a\n" ↔ a<br><br·pad>, "a\n\n" ↔ a<br><br><br·pad>.

import type { ChipData } from "../chip-markdown";
import { scrollIntoViewWithin } from "../internal/scroll-into-view-within";
import { nextChipId, type SegmentDoc } from "./segments";

// ---------------------------------------------------------------------------
// Structural node view — the SerializableNode precedent: the pure functions
// only touch these members, so tests drive them with plain objects.
// ---------------------------------------------------------------------------

export type ReadableNode = {
  nodeType: number;
  nodeName: string;
  /** Text node content (nodeType 3). */
  data?: string;
  childNodes: ArrayLike<ReadableNode>;
  getAttribute?: (name: string) => string | null;
};

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export const toReadable = (node: Node): ReadableNode => node as unknown as ReadableNode;

const childrenOf = (node: ReadableNode): ReadableNode[] => Array.from(node.childNodes);

// ---------------------------------------------------------------------------
// Node taxonomy — the shared vocabulary. Every walker in this file switches on
// a NodeClass rather than re-deriving node kinds from attributes, so they
// cannot drift apart.
// ---------------------------------------------------------------------------

/** The writer marks its padding <br>; the reader recognizes it structurally. */
export const PADDING_BREAK_ATTRIBUTE = "data-padding-break";

// Elements whose appearance inside the editable means something rewrote our
// flat structure (paste leftovers, extensions) — content still reads, but the
// document gets renormalized from the model afterwards.
const BLOCK_NODE_NAMES = new Set([
  "DIV",
  "P",
  "PRE",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "TABLE",
]);

type NodeClass =
  /** Leaves — they carry content and occupy positions. */
  | { kind: "text"; text: string }
  | { kind: "break" }
  | { kind: "padding" }
  | { kind: "chip"; id: string }
  /** Zero-width and opaque: the badge's hint span. Its subtree never reads. */
  | { kind: "presentation" }
  /** Transparent containers — read and measure through them. */
  | { kind: "wrapper" }
  | { kind: "block" }
  /** Comments and the rest: not content, not a container. */
  | { kind: "ignored" };

// Precedence is load-bearing: a chip span is also contenteditable="false", so
// the chip test must come before the presentation test.
const classifyNode = (node: ReadableNode): NodeClass => {
  if (node.nodeType === TEXT_NODE) return { kind: "text", text: node.data ?? "" };
  if (node.nodeType !== ELEMENT_NODE) return { kind: "ignored" };

  if (node.nodeName === "BR") {
    const marked = (node.getAttribute?.(PADDING_BREAK_ATTRIBUTE) ?? null) !== null;
    return marked ? { kind: "padding" } : { kind: "break" };
  }

  const chipId = node.getAttribute?.("data-chip-id") ?? null;
  if (chipId !== null) return { kind: "chip", id: chipId };

  if (node.getAttribute?.("contenteditable") === "false") return { kind: "presentation" };
  if (BLOCK_NODE_NAMES.has(node.nodeName)) return { kind: "block" };
  return { kind: "wrapper" };
};

/**
 * Logical positions a leaf occupies. Containers are the sum of their children,
 * so they are not leaves and answer 0 here — the walkers descend instead.
 */
const leafWidth = (classified: NodeClass): number => {
  switch (classified.kind) {
    case "text":
      return classified.text.length;
    case "break":
    case "chip":
      return 1;
    default:
      return 0;
  }
};

// ---------------------------------------------------------------------------
// Reader — DOM → segments, in two passes. The walk flattens the tree into
// tokens; the fold turns tokens into segments and applies the padding rules.
// Splitting them keeps the line-break policy in one readable place instead of
// smeared across the traversal as flags.
// ---------------------------------------------------------------------------

type ReadToken =
  | { kind: "text"; text: string }
  | { kind: "break" }
  | { kind: "padding" }
  | { kind: "chip"; id: string };

const tokenizeDom = (root: ReadableNode): { tokens: ReadToken[]; dirty: boolean } => {
  const tokens: ReadToken[] = [];
  let dirty = false;

  const descend = (node: ReadableNode) => {
    for (const child of childrenOf(node)) visit(child);
  };

  const visit = (node: ReadableNode) => {
    const classified = classifyNode(node);
    switch (classified.kind) {
      case "text":
        // Empty text nodes are editing residue — dropping them keeps the
        // padding rules below looking at real neighbours.
        if (classified.text.length > 0) tokens.push(classified);
        return;
      case "break":
      case "padding":
        tokens.push({ kind: classified.kind });
        return;
      case "chip":
        tokens.push(classified);
        return;
      case "presentation":
      case "ignored":
        return;
      case "block":
        dirty = true;
        descend(node);
        return;
      case "wrapper":
        descend(node);
        return;
    }
  };

  descend(root);
  return { tokens, dirty };
};

/**
 * Drop the writer's trailing line-box scaffolding: our own marked padding, or
 * an unmarked <br> the browser added to keep an emptied last line alive. Any
 * padding token that survives this was stranded mid-document.
 */
const trimTrailingPadding = (tokens: ReadToken[]): ReadToken[] => {
  const last = tokens.at(-1);
  if (last?.kind === "padding" || last?.kind === "break") return tokens.slice(0, -1);
  return tokens;
};

const foldTokens = (
  tokens: ReadToken[],
  resolveChip: (id: string) => ChipData | null,
  makeId: () => string,
): { doc: SegmentDoc; dirty: boolean } => {
  const doc: SegmentDoc = [];
  let dirty = false;
  let pendingText = "";
  const seenChipIds = new Set<string>();

  const flushText = () => {
    if (pendingText.length === 0) return;
    const previous = doc.at(-1);
    if (previous?.type === "text") {
      doc[doc.length - 1] = { type: "text", text: previous.text + pendingText };
    } else {
      doc.push({ type: "text", text: pendingText });
    }
    pendingText = "";
  };

  for (const token of trimTrailingPadding(tokens)) {
    switch (token.kind) {
      case "text":
        // Adjacent text concatenates logically, never via root.normalize() —
        // WebKit collapses the caret when the selection's node gets merged.
        pendingText += token.text.replace(/\u00A0/g, " ");
        break;
      case "break":
        pendingText += "\n";
        break;
      case "padding":
        // Survived the trim, so it is not the trailing scaffolding: a native
        // edit stranded it mid-document. Not content — repaint from the model.
        dirty = true;
        break;
      case "chip": {
        // Unknown ids are leftovers from DOM the model doesn't know (mark
        // dirty, skip); duplicated ids (clone paths) get a fresh identity.
        const chip = resolveChip(token.id);
        if (!chip) {
          dirty = true;
          break;
        }
        flushText();
        const id = seenChipIds.has(token.id) ? makeId() : token.id;
        seenChipIds.add(token.id);
        doc.push({ type: "chip", id, chip });
        break;
      }
    }
  }
  flushText();

  return { doc, dirty };
};

export const readDocumentFromDom = (
  root: ReadableNode,
  resolveChip: (id: string) => ChipData | null,
  makeId: () => string = nextChipId,
): { doc: SegmentDoc; dirty: boolean } => {
  const { tokens, dirty: structureDirty } = tokenizeDom(root);
  const { doc, dirty: contentDirty } = foldTokens(tokens, resolveChip, makeId);
  return { doc, dirty: structureDirty || contentDirty };
};

// ---------------------------------------------------------------------------
// Position mapping — DOM points ↔ logical positions, inverses of each other
// over leafWidth. Chips count 1, a real <br> counts 1 (it renders a "\n"),
// padding and presentation count 0, wrappers are transparent.
// ---------------------------------------------------------------------------

/** Logical position of (node, offset), or null when the point isn't inside root. */
export const logicalRangeFromDom = (
  root: ReadableNode,
  targetNode: ReadableNode,
  targetOffset: number,
): number | null => {
  let position = 0;
  let found: number | null = null;

  const contains = (parent: ReadableNode, target: ReadableNode): boolean =>
    childrenOf(parent).some((child) => child === target || contains(child, target));

  // Element point: the offset is a child index — advance past that many
  // children, then record where we landed.
  const measureUpTo = (node: ReadableNode, childIndex: number): boolean => {
    for (const child of childrenOf(node).slice(0, childIndex)) {
      if (visit(child)) return true;
    }
    return false;
  };

  const visit = (node: ReadableNode): boolean => {
    const classified = classifyNode(node);

    if (node === targetNode && classified.kind !== "text" && classified.kind !== "chip") {
      if (measureUpTo(node, targetOffset)) return true;
      found = position;
      return true;
    }

    switch (classified.kind) {
      case "text":
        if (node === targetNode) {
          found = position + Math.min(targetOffset, classified.text.length);
          return true;
        }
        position += leafWidth(classified);
        return false;
      case "break":
      case "padding":
        position += leafWidth(classified);
        return false;
      // A point inside a chip or a hint span clamps to that node's start; they
      // differ only in width.
      case "chip":
      case "presentation":
        if (node === targetNode || contains(node, targetNode)) {
          found = position;
          return true;
        }
        position += leafWidth(classified);
        return false;
      case "wrapper":
      case "block":
        for (const child of childrenOf(node)) {
          if (visit(child)) return true;
        }
        return false;
      case "ignored":
        return false;
    }
  };

  if (root === targetNode) {
    return measureUpTo(root, targetOffset) ? found : position;
  }

  for (const child of childrenOf(root)) {
    if (visit(child)) return found;
  }
  return found;
};

/** DOM point for a logical position, preferring text-node points. */
export const domPointFromLogical = (
  root: HTMLElement,
  position: number,
): { node: Node; offset: number } => {
  let remaining = position;

  const walk = (parent: Node): { node: Node; offset: number } | null => {
    for (let index = 0; index < parent.childNodes.length; index++) {
      const child = parent.childNodes[index];
      if (!child) continue;
      const classified = classifyNode(toReadable(child));

      switch (classified.kind) {
        case "text": {
          const width = leafWidth(classified);
          if (remaining <= width) return { node: child, offset: remaining };
          remaining -= width;
          continue;
        }
        // Atomic children: the point is the gap before them. Padding is
        // zero-width, so the caret can never be written past the model's end.
        case "break":
        case "padding":
        case "chip":
          if (remaining === 0) return { node: parent, offset: index };
          remaining -= leafWidth(classified);
          continue;
        case "presentation":
        case "ignored":
          continue;
        case "wrapper":
        case "block": {
          const inner = walk(child);
          if (inner) return inner;
          continue;
        }
      }
    }
    return remaining === 0 ? { node: parent, offset: parent.childNodes.length } : null;
  };

  return walk(root) ?? { node: root, offset: root.childNodes.length };
};

// ---------------------------------------------------------------------------
// Spec builder — segments → the canonical child list. Pure and fully tested;
// the materializer below just instantiates it.
// ---------------------------------------------------------------------------

export type DomNodeSpec =
  | { kind: "text"; text: string }
  | { kind: "br"; padding: boolean }
  | { kind: "chip"; id: string };

export const documentToDomSpec = (doc: SegmentDoc): DomNodeSpec[] => {
  const specs: DomNodeSpec[] = [];

  for (const segment of doc) {
    if (segment.type === "chip") {
      specs.push({ kind: "chip", id: segment.id });
      continue;
    }
    const lines = segment.text.split("\n");
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) specs.push({ kind: "br", padding: false });
      if (line.length > 0) specs.push({ kind: "text", text: line });
    });
  }

  // Padding <br>: an empty document or one ending in a line break needs a
  // trailing <br> for the last line to be reachable and have height.
  const last = specs.at(-1);
  if (!last || last.kind === "br") specs.push({ kind: "br", padding: true });

  return specs;
};

// ---------------------------------------------------------------------------
// Real-DOM materializers — thin, untested by design; all decisions live in
// the pure layers above.
// ---------------------------------------------------------------------------

const createChipSpan = (id: string): HTMLElement => {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.setAttribute("data-mention-chip", "");
  span.setAttribute("data-chip-id", id);
  // A chip is atomic inline content: it must sit on the text baseline and must
  // not inherit the editor's break-spaces whitespace mode, or its label wraps
  // mid-chip.
  span.style.display = "inline";
  span.style.verticalAlign = "baseline";
  span.style.whiteSpace = "normal";
  return span;
};

const createBreak = (padding: boolean): HTMLElement => {
  const br = document.createElement("br");
  if (padding) br.setAttribute(PADDING_BREAK_ATTRIBUTE, "");
  return br;
};

/**
 * Render the canonical child list. Existing chip spans are reused by id —
 * moving a node preserves its React portal; recreating it would remount the
 * chip content. Returns the live id → element map for the portal layer.
 */
export const renderDocumentToDom = (
  root: HTMLElement,
  doc: SegmentDoc,
): Map<string, HTMLElement> => {
  const existingSpans = new Map<string, HTMLElement>();
  for (const span of root.querySelectorAll<HTMLElement>("[data-chip-id]")) {
    const id = span.getAttribute("data-chip-id");
    if (id && !existingSpans.has(id)) existingSpans.set(id, span);
  }

  const chipsById = new Map(
    doc.flatMap((segment) =>
      segment.type === "chip" ? [[segment.id, segment.chip] as const] : [],
    ),
  );

  const chipElements = new Map<string, HTMLElement>();
  const children = documentToDomSpec(doc).map((spec): Node => {
    if (spec.kind === "text") return document.createTextNode(spec.text);
    if (spec.kind === "br") return createBreak(spec.padding);
    const span = existingSpans.get(spec.id) ?? createChipSpan(spec.id);
    // Without an accessible boundary the chip reads as bare prose inside the
    // textbox — label + type gives AT an atomic token ("Rasmus, @ mention").
    const chip = chipsById.get(spec.id);
    if (chip) span.setAttribute("aria-label", `${chip.label}, ${chip.prefix} mention`);
    chipElements.set(spec.id, span);
    return span;
  });

  root.replaceChildren(...children);
  return chipElements;
};

// ---------------------------------------------------------------------------
// Selection — reading the caret out of the document and writing it back, plus
// keeping it visible after a programmatic write.
// ---------------------------------------------------------------------------

export const readSelectionRange = (root: HTMLElement): { start: number; end: number } | null => {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = logicalRangeFromDom(
    toReadable(root),
    toReadable(range.startContainer),
    range.startOffset,
  );
  const end = logicalRangeFromDom(
    toReadable(root),
    toReadable(range.endContainer),
    range.endOffset,
  );
  if (start === null || end === null) return null;
  return start <= end ? { start, end } : { start: end, end: start };
};

export const writeCaretToDom = (root: HTMLElement, start: number, end: number = start): void => {
  const selection = root.ownerDocument.getSelection();
  if (!selection) return;
  const anchor = domPointFromLogical(root, start);
  const focus = end === start ? anchor : domPointFromLogical(root, end);
  selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
};

// The caret's box. A collapsed caret on an empty line has none of its own —
// browsers return an all-zero rect, which would read as "above the view" — so
// measure the line instead: the <br> that follows it (a line break, or the
// padding break that gives an empty document its line). Null if neither has
// a box.
const measureCaret = (range: Range): DOMRect | null => {
  const rect = range.getBoundingClientRect();
  if (rect.height > 0) return rect;
  const next = range.startContainer.childNodes[range.startOffset];
  if (next?.nodeName !== "BR") return null;
  const line = next.ownerDocument?.createRange();
  if (!line) return null;
  line.selectNode(next);
  const lineRect = line.getBoundingClientRect();
  return lineRect.height > 0 ? lineRect : null;
};

// Native typing auto-scrolls; programmatic writes don't. Scroll the caret into
// view within the composer's own scroll areas, never the page around it. The
// caret is the selection's focus end: a restored selection can be taller than
// the view, and its top edge would win.
export const scrollCaretIntoView = (root: HTMLElement): void => {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.focusNode) return;
  const caret = root.ownerDocument.createRange();
  caret.setStart(selection.focusNode, selection.focusOffset);
  caret.collapse(true);
  const rect = measureCaret(caret);
  if (!rect) return;
  scrollIntoViewWithin({ rect, from: root }, root.closest("[data-composer-root]") ?? root);
};

// ---------------------------------------------------------------------------
// Badge maintenance — wrap the active trigger token in a real inline span so
// the styled layer and the popover anchor keep working. Idempotent: the fast
// path (existing span already covers exactly the token) runs on every
// selectionchange and must not touch the DOM.
// ---------------------------------------------------------------------------

export type BadgeToken = { start: number; end: number; showPlaceholder: boolean };

const badgeSpansOf = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>("[data-command-badge]"),
];

const unwrapBadgeSpan = (span: HTMLElement): void => {
  const parent = span.parentNode;
  if (!parent) return;
  // Presentation children (the hint span) are the badge's own chrome — they
  // die with it rather than spilling into content.
  for (const child of [...span.children]) {
    if (classifyNode(toReadable(child)).kind === "presentation") child.remove();
  }
  while (span.firstChild) parent.insertBefore(span.firstChild, span);
  parent.removeChild(span);
  // No parent.normalize() — the reader concatenates fragmented text nodes,
  // and merging the selection's node collapses the caret in WebKit.
};

// The badge's logical text length: direct text nodes only — the hint span is
// zero-width presentation and must not count toward the token range.
const badgeTextLength = (span: HTMLElement): number => {
  let length = 0;
  for (const child of [...span.childNodes]) {
    if (child.nodeType === TEXT_NODE) length += (child as Text).data.length;
  }
  return length;
};

/**
 * Make the DOM match the token (or its absence). Returns true when the DOM
 * changed — the caller must restore the caret afterwards.
 */
export const syncBadge = (root: HTMLElement, token: BadgeToken | null): boolean => {
  const spans = badgeSpansOf(root);

  if (!token) {
    if (spans.length === 0) return false;
    for (const span of spans) unwrapBadgeSpan(span);
    return true;
  }

  // Fast path: one span already covering exactly [start, end] with the right
  // placeholder marker.
  const [onlySpan] = spans;
  if (spans.length === 1 && onlySpan) {
    const span = onlySpan;
    const parent = span.parentNode;
    if (parent) {
      const index = [...parent.childNodes].indexOf(span);
      const spanStart = logicalRangeFromDom(toReadable(root), toReadable(parent), index);
      const spanLength = badgeTextLength(span);
      const hasPlaceholder = span.hasAttribute("data-command-placeholder");
      if (
        spanStart === token.start &&
        spanStart + spanLength === token.end &&
        hasPlaceholder === token.showPlaceholder
      ) {
        return false;
      }
    }
  }

  for (const span of spans) unwrapBadgeSpan(span);

  // Wrap [start, end]: a Range handles boundary text-node splitting for us.
  // The token is text-only by construction (chips scan as whitespace), so the
  // extracted fragment never partially covers a non-text node.
  const startPoint = domPointFromLogical(root, token.start);
  const endPoint = domPointFromLogical(root, token.end);
  const range = root.ownerDocument.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);

  const span = root.ownerDocument.createElement("span");
  span.setAttribute("data-command-badge", "");
  if (token.showPlaceholder) span.setAttribute("data-command-placeholder", "");
  span.appendChild(range.extractContents());
  range.insertNode(span);

  return true;
};
