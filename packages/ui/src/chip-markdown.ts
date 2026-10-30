// Wire format for inline chip references inside a message text part.
// Shape: [Label](chip:prefix:value?icon=…). The icon rides along in the
// token, so a rendered message reconstructs the chip from its own text
// alone — no sidecar metadata array. Presentation that's derivable at render
// time (e.g. a per-prefix variant) is the renderer's job, not wire data.

/**
 * Opaque wire string. The styled layer owns the concrete union and narrows
 * at its own boundary.
 */
export type ChipIconKey = string;

// A label is escape pairs and any character but a bracket or backslash, so the
// brackets escapeMarkdownLink escapes stay inside it.
const LABEL = String.raw`((?:\\[\s\S]|[^\\[\]])+)`;
// Every group after the label excludes "[" so none can consume past the next
// one — without that this backtracks quadratically, and message text is untrusted.
const TAIL = String.raw`\]\(chip:([^[:)]+):([^[)?]+)(?:\?([^[)]*))?\)`;

/**
 * Matches one chip token. Scan text with `parseChipSegments` rather than with
 * this: on its own it retries every escaped "[" inside a label as a token start,
 * which is quadratic.
 */
export const CHIP_REF_PATTERN = new RegExp(String.raw`\[${LABEL}${TAIL}`, "g");

// Consumes a "[" and its label whether or not a token follows, so the scan
// resumes after the label instead of retrying the escaped "[" inside it. A
// match without the tail is plain text.
const SCAN_PATTERN = new RegExp(String.raw`\[${LABEL}(?:${TAIL})?`, "g");

export type ChipData = {
  prefix: string;
  value: string;
  label: string;
  icon?: ChipIconKey;
};

export type ChipSegment =
  | { type: "text"; text: string }
  | {
      type: "chip";
      label: string;
      prefix: string;
      value: string;
      icon?: ChipIconKey;
    };

export const escapeMarkdownLink = (input: string): string =>
  input.replace(/[[\]()\\]/g, (match) => `\\${match}`);

const unescapeMarkdownLink = (input: string): string => input.replace(/\\([[\]()\\])/g, "$1");

// Tolerate legacy/un-encoded values — a stray "%" would otherwise throw and
// take the whole message render down with it.
const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const encodeChipMarkdown = (chip: ChipData): string => {
  const params = new URLSearchParams();
  if (chip.icon) params.set("icon", chip.icon);
  const query = params.toString();
  const value = encodeURIComponent(chip.value);
  return `[${escapeMarkdownLink(chip.label)}](chip:${chip.prefix}:${value}${query ? `?${query}` : ""})`;
};

export const parseChipSegments = (text: string): ChipSegment[] => {
  const segments: ChipSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(SCAN_PATTERN)) {
    const [token, rawLabel = "", prefix, rawValue = "", rawQuery] = match;
    // A label with no token after it stays in the surrounding text.
    if (prefix === undefined) continue;
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, start) });
    }
    const params = new URLSearchParams(rawQuery ?? "");
    const icon = params.get("icon");
    segments.push({
      type: "chip",
      label: unescapeMarkdownLink(rawLabel),
      prefix,
      value: safeDecode(rawValue),
      ...(icon ? { icon } : {}),
    });
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }
  return segments;
};

// Building editor nodes from these segments lives with the document model in
// composer/segments.ts — this module is only the neutral wire format.
