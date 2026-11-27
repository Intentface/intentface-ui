// Segments — the editor engine's pure document kernel. The document is a flat
// inline sequence: text segments (soft breaks ride inline as "\n") and atomic
// chips of logical length 1. Everything here is pure and position-based —
// logical positions count one per text character and one per chip — so the
// DOM layer, the trigger tracker, and the tests all speak the same integers.
//
// Projections: the same document reads three ways depending on the consumer —
// getPlainText (chips vanish; the getText/onValueChange contract),
// toFlatText (chips as "￼"; input diffing needs 1:1 positions),
// toScanText (chips as " "; prefix detection needs word boundaries and the
// guarantee that a token can never span a chip).

import { type ChipData, type ChipSegment, encodeChipMarkdown } from "../chip-markdown";
import type { ComposerSnapshot } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Segment = { type: "text"; text: string } | { type: "chip"; id: string; chip: ChipData };

export type SegmentDoc = Segment[];

// A document edit expressed as one contiguous logical-range replacement. Every
// mutation reduces to this shape, which is what makes position mapping below a
// single arithmetic rule rather than a per-operation special case.
export type TextChange = {
  rangeStart: number;
  rangeEnd: number;
  insertedLength: number;
};

// The character standing in for a chip in the diff projection. Object
// Replacement Character — never produced by real typing.
const CHIP_SENTINEL = "￼";

// ---------------------------------------------------------------------------
// Chip ids — monotonically increasing per module load. Deterministic (no
// randomness), unique within a session, and test-friendly.
// ---------------------------------------------------------------------------

let chipIdCounter = 0;

export const nextChipId = (): string => `chip-${++chipIdCounter}`;

// ---------------------------------------------------------------------------
// Projections & measurements
// ---------------------------------------------------------------------------

export const documentLength = (doc: SegmentDoc): number =>
  doc.reduce((length, segment) => length + (segment.type === "text" ? segment.text.length : 1), 0);

/** Chips contribute nothing — the getText()/onValueChange contract. */
export const getPlainText = (doc: SegmentDoc): string =>
  doc.reduce((text, segment) => (segment.type === "text" ? text + segment.text : text), "");

/** Chips as the sentinel char — positions stay 1:1 for diffing. */
export const toFlatText = (doc: SegmentDoc): string =>
  doc.reduce(
    (text, segment) => text + (segment.type === "text" ? segment.text : CHIP_SENTINEL),
    "",
  );

/**
 * Chips as a single space — positions stay 1:1 for prefix detection, and the
 * whitespace guarantees an active token can never span a chip.
 */
export const toScanText = (doc: SegmentDoc): string =>
  doc.reduce((text, segment) => text + (segment.type === "text" ? segment.text : " "), "");

export const chipRangesOf = (
  doc: SegmentDoc,
): Array<{ id: string; start: number; end: number }> => {
  const ranges: Array<{ id: string; start: number; end: number }> = [];
  let offset = 0;
  for (const segment of doc) {
    if (segment.type === "chip") {
      ranges.push({ id: segment.id, start: offset, end: offset + 1 });
      offset += 1;
    } else {
      offset += segment.text.length;
    }
  }
  return ranges;
};

/** The "\n"-delimited line around a position in scan text. */
export const lineBoundsAt = (
  scanText: string,
  position: number,
): { lineStart: number; lineEnd: number } => {
  const lineStart = scanText.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const newlineAfter = scanText.indexOf("\n", position);
  return { lineStart, lineEnd: newlineAfter === -1 ? scanText.length : newlineAfter };
};

// ---------------------------------------------------------------------------
// Construction & serialization
// ---------------------------------------------------------------------------

export const segmentsFromText = (text: string): SegmentDoc =>
  text.length === 0 ? [] : [{ type: "text", text }];

export const segmentsFromChipSegments = (
  segments: readonly ChipSegment[],
  makeId: () => string = nextChipId,
): SegmentDoc =>
  normalizeSegments(
    segments.map((segment) =>
      segment.type === "text"
        ? { type: "text", text: segment.text }
        : {
            type: "chip",
            id: makeId(),
            chip: {
              prefix: segment.prefix,
              value: segment.value,
              label: segment.label,
              ...(segment.icon ? { icon: segment.icon } : {}),
            },
          },
    ),
  );

/**
 * The {text} submit payload — text as-is, chips as chip-markdown tokens.
 * Byte-identical to the legacy serializeDocument for equivalent content.
 */
export const serializeSegments = (doc: SegmentDoc): { text: string } => ({
  text: doc.reduce(
    (text, segment) =>
      text + (segment.type === "text" ? segment.text : encodeChipMarkdown(segment.chip)),
    "",
  ),
});

// ---------------------------------------------------------------------------
// Splice & slice — all document surgery goes through these, so text merging
// and empty-segment dropping happen in exactly one place.
// ---------------------------------------------------------------------------

/** Merge adjacent text segments and drop empty ones. */
const normalizeSegments = (doc: SegmentDoc): SegmentDoc => {
  const normalized: SegmentDoc = [];
  for (const segment of doc) {
    if (segment.type === "text" && segment.text.length === 0) continue;
    const previous = normalized.at(-1);
    if (segment.type === "text" && previous?.type === "text") {
      normalized[normalized.length - 1] = { type: "text", text: previous.text + segment.text };
      continue;
    }
    normalized.push(segment);
  }
  return normalized;
};

/**
 * Replace the logical range [from, to) with the inserted segments. A chip is
 * atomic: it is removed iff its position falls inside the range (range edges
 * never split it).
 */
export const spliceSegments = (
  doc: SegmentDoc,
  from: number,
  to: number,
  insert: SegmentDoc,
): SegmentDoc => {
  const before: SegmentDoc = [];
  const after: SegmentDoc = [];
  let offset = 0;

  for (const segment of doc) {
    const segmentLength = segment.type === "text" ? segment.text.length : 1;
    const segmentStart = offset;
    const segmentEnd = offset + segmentLength;
    offset = segmentEnd;

    if (segmentEnd <= from) {
      before.push(segment);
      continue;
    }
    if (segmentStart >= to) {
      after.push(segment);
      continue;
    }
    // Overlapping the range. Chips are atomic — fully covered, fully removed.
    if (segment.type === "chip") continue;
    const keepLeft = segment.text.slice(0, Math.max(0, from - segmentStart));
    const keepRight = segment.text.slice(Math.min(segmentLength, to - segmentStart));
    if (keepLeft) before.push({ type: "text", text: keepLeft });
    if (keepRight) after.push({ type: "text", text: keepRight });
  }

  return normalizeSegments([...before, ...insert, ...after]);
};

/** Extract [from, to) as a sub-document. Chips are included iff fully inside. */
export const sliceSegments = (doc: SegmentDoc, from: number, to: number): SegmentDoc => {
  const slice: SegmentDoc = [];
  let offset = 0;

  for (const segment of doc) {
    const segmentLength = segment.type === "text" ? segment.text.length : 1;
    const segmentStart = offset;
    const segmentEnd = offset + segmentLength;
    offset = segmentEnd;

    if (segmentEnd <= from || segmentStart >= to) continue;
    if (segment.type === "chip") {
      slice.push(segment);
      continue;
    }
    const text = segment.text.slice(
      Math.max(0, from - segmentStart),
      Math.min(segmentLength, to - segmentStart),
    );
    if (text) slice.push({ type: "text", text });
  }

  return normalizeSegments(slice);
};

/**
 * Fit segments into `room` logical units for maxLength: text is sliced at the
 * boundary; a chip that doesn't fit whole is dropped entirely.
 */
export const truncateToFit = (insert: SegmentDoc, room: number): SegmentDoc => {
  const fitted: SegmentDoc = [];
  let remaining = Math.max(0, room);
  for (const segment of insert) {
    if (remaining === 0) break;
    if (segment.type === "chip") {
      fitted.push(segment);
      remaining -= 1;
      continue;
    }
    const text = segment.text.slice(0, remaining);
    if (text) fitted.push({ type: "text", text });
    remaining -= text.length;
  }
  return normalizeSegments(fitted);
};

// ---------------------------------------------------------------------------
// Position mapping — carry a position across one change.
// The tracker's sticky token rests on the bias semantics: insertion exactly
// at a position stays before it with bias -1 and moves after it with bias +1,
// which is what lets the token end grow while its start holds.
// ---------------------------------------------------------------------------

export const mapPositionResult = (
  position: number,
  change: TextChange,
  bias: -1 | 1,
): { position: number; deleted: boolean } => {
  const { rangeStart, rangeEnd, insertedLength } = change;
  if (position < rangeStart) return { position, deleted: false };
  if (position > rangeEnd) {
    return { position: position + insertedLength - (rangeEnd - rangeStart), deleted: false };
  }
  if (position === rangeStart) {
    return bias < 0
      ? { position: rangeStart, deleted: false }
      : { position: rangeStart + insertedLength, deleted: false };
  }
  if (position === rangeEnd) {
    return {
      position: rangeStart + insertedLength,
      deleted: bias < 0 && rangeEnd > rangeStart,
    };
  }
  // Strictly inside the replaced range — the content at this position is gone.
  return {
    position: bias < 0 ? rangeStart : rangeStart + insertedLength,
    deleted: true,
  };
};

export const mapPosition = (position: number, change: TextChange, bias: -1 | 1): number =>
  mapPositionResult(position, change, bias).position;

// ---------------------------------------------------------------------------
// Diffing — recover the TextChange from a native edit (there is no transaction
// to consume; the browser already mutated the DOM). Common prefix/suffix diff;
// the caret disambiguates repeated-character runs (prefer the edit that ends
// at the caret, à la CodeMirror).
// ---------------------------------------------------------------------------

export const diffFlatText = (
  oldFlat: string,
  newFlat: string,
  caretHint?: number,
): TextChange | null => {
  if (oldFlat === newFlat) return null;

  let prefix = 0;
  const maxPrefix = Math.min(oldFlat.length, newFlat.length);
  while (prefix < maxPrefix && oldFlat[prefix] === newFlat[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = Math.min(oldFlat.length, newFlat.length) - prefix;
  while (
    suffix < maxSuffix &&
    oldFlat[oldFlat.length - 1 - suffix] === newFlat[newFlat.length - 1 - suffix]
  ) {
    suffix++;
  }

  let rangeStart = prefix;
  let rangeEnd = oldFlat.length - suffix;
  const insertedLength = newFlat.length - suffix - prefix;

  // Slide the window left over equal characters until the inserted region
  // ends at the caret ("aa" + typed "a": rightmost by default, caret decides).
  if (caretHint !== undefined) {
    while (
      rangeStart + insertedLength > caretHint &&
      rangeStart > 0 &&
      oldFlat[rangeStart - 1] === newFlat[rangeStart + insertedLength - 1]
    ) {
      rangeStart--;
      rangeEnd--;
    }
  }

  return { rangeStart, rangeEnd, insertedLength };
};

// ---------------------------------------------------------------------------
// beforeinput policy — the pure allow-list. Native text edits pass through
// (read back on input); anything touching a chip, capped by maxLength, or
// markup-creating is intercepted or denied.
// ---------------------------------------------------------------------------

export type BeforeInputPlan =
  | { kind: "native" }
  | { kind: "block" }
  | { kind: "splice"; from: number; to: number; insert: SegmentDoc; caret: number };

// Text-level inputTypes the browser may perform natively (subject to the
// chip-intersection and maxLength checks below).
const NATIVE_SAFE_INPUT_TYPES = new Set([
  "insertText",
  "insertReplacementText",
  "deleteContentBackward",
  "deleteContentForward",
  "deleteWordBackward",
  "deleteWordForward",
  "deleteSoftLineBackward",
  "deleteHardLineBackward",
  "deleteEntireSoftLine",
  "deleteContent",
  "deleteByCut",
]);

const isInsertType = (inputType: string) =>
  inputType === "insertText" || inputType === "insertReplacementText";

export const planBeforeInput = (args: {
  inputType: string;
  data: string | null;
  /** The event's first target range in logical positions; null when unavailable. */
  targetRange: { start: number; end: number } | null;
  doc: SegmentDoc;
  caret: { start: number; end: number };
  maxLength?: number;
}): BeforeInputPlan => {
  const { inputType, data, doc, maxLength } = args;
  const range = args.targetRange ?? args.caret;

  // IME composition is not cancelable — the composition guard owns it.
  if (inputType === "insertCompositionText") return { kind: "native" };

  // Enter/Shift+Enter backstop (keydown normally consumes these first):
  // emulate as a soft break through the programmatic pipeline.
  if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
    return planTextInsertion(doc, range, "\n", maxLength);
  }

  if (!NATIVE_SAFE_INPUT_TYPES.has(inputType)) return { kind: "block" };

  const rangeTouchesChip = chipRangesOf(doc).some(
    (chip) => chip.start < range.end && chip.end > range.start,
  );

  if (isInsertType(inputType)) {
    const insertedText = data ?? "";
    // Chip in the replaced selection (select-all + type-over) or over the cap:
    // do the splice ourselves. Otherwise the browser handles it.
    const over =
      maxLength !== undefined &&
      documentLength(doc) - (range.end - range.start) + insertedText.length > maxLength;
    if (!rangeTouchesChip && !over) return { kind: "native" };
    return planTextInsertion(doc, range, insertedText, maxLength);
  }

  // Delete variants: native unless the target range touches a chip — engines
  // disagree on atom deletion (WebKit caret placement, word-deletes across
  // atoms), so chip deletion always goes through the model.
  if (!rangeTouchesChip) return { kind: "native" };
  return { kind: "splice", from: range.start, to: range.end, insert: [], caret: range.start };
};

const planTextInsertion = (
  doc: SegmentDoc,
  range: { start: number; end: number },
  text: string,
  maxLength: number | undefined,
): BeforeInputPlan => {
  let insertedText = text;
  if (maxLength !== undefined) {
    const room = maxLength - (documentLength(doc) - (range.end - range.start));
    if (room <= 0) return { kind: "block" };
    insertedText = insertedText.slice(0, room);
  }
  if (insertedText.length === 0) return { kind: "block" };
  return {
    kind: "splice",
    from: range.start,
    to: range.end,
    insert: [{ type: "text", text: insertedText }],
    caret: range.start + insertedText.length,
  };
};

// ---------------------------------------------------------------------------
// Snapshot wire format — the ParagraphNodeJSON vocabulary (shared with the
// legacy engine's document.ts) so snapshots stay engine-portable under the
// ComposerSnapshot brand. Paragraph boundaries ↔ "\n".
// ---------------------------------------------------------------------------

export type SnapshotInlineNode =
  | { type: "text"; text: string }
  | {
      type: "mentionChip";
      attrs: { prefix: string; value: string; label: string; icon?: string };
    };

export type SnapshotParagraphNode = {
  type: "paragraph";
  content?: SnapshotInlineNode[];
};

export const segmentsToParagraphJSON = (doc: SegmentDoc): SnapshotParagraphNode[] => {
  const paragraphs: SnapshotParagraphNode[] = [{ type: "paragraph", content: [] }];
  const pushInline = (node: SnapshotInlineNode) => {
    const target = paragraphs.at(-1);
    if (!target) return;
    target.content = target.content ?? [];
    target.content.push(node);
  };

  for (const segment of doc) {
    if (segment.type === "chip") {
      pushInline({
        type: "mentionChip",
        attrs: {
          prefix: segment.chip.prefix,
          value: segment.chip.value,
          label: segment.chip.label,
          ...(segment.chip.icon ? { icon: segment.chip.icon } : {}),
        },
      });
      continue;
    }
    const lines = segment.text.split("\n");
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) paragraphs.push({ type: "paragraph", content: [] });
      if (line.length > 0) pushInline({ type: "text", text: line });
    });
  }

  // Empty paragraphs stay — they encode blank lines ("\n\n"), and dropping
  // them would make applySnapshot(getSnapshot()) lossy. (The legacy paste
  // path filters them; the snapshot path must not.)
  return paragraphs;
};

export const segmentsToSnapshot = (doc: SegmentDoc): ComposerSnapshot => ({
  __doc: { type: "doc", content: segmentsToParagraphJSON(doc) },
  __brand: "ComposerSnapshot",
});

export const segmentsFromParagraphJSON = (
  paragraphs: readonly SnapshotParagraphNode[],
  makeId: () => string = nextChipId,
): SegmentDoc => {
  const doc: SegmentDoc = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) doc.push({ type: "text", text: "\n" });
    for (const node of paragraph.content ?? []) {
      if (node.type === "text") {
        doc.push({ type: "text", text: node.text });
        continue;
      }
      // A legacy-engine snapshot may carry node types we don't model
      // (hardBreak etc.) — only mention chips convert; the rest are skipped.
      if (node.type !== "mentionChip") continue;
      doc.push({
        type: "chip",
        id: makeId(),
        chip: {
          prefix: node.attrs.prefix,
          value: node.attrs.value,
          label: node.attrs.label,
          ...(node.attrs.icon ? { icon: node.attrs.icon } : {}),
        },
      });
    }
  });
  return normalizeSegments(doc);
};
