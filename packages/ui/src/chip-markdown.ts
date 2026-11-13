// Wire format for inline chip references inside a message text part.
// Shape: [Label](chip:prefix:value?icon=…). The icon rides along in the
// token, so a rendered message reconstructs the chip from its own text
// alone — no sidecar metadata array. Presentation that's derivable at render
// time (e.g. a per-prefix variant) is the renderer's job, not wire data.

/**
 * An icon key, carried as an opaque string. The app owns the set of keys and
 * narrows to it at its own boundary.
 */
export type ChipIconKey = string;

// A label is escape pairs and any character but a bracket or backslash, so the
// brackets escapeMarkdownLink escapes stay inside it.
const LABEL = String.raw`((?:\\[\s\S]|[^\\[\]])+)`;
// Every group after the label excludes "[" so none can consume past the next
// one — without that this backtracks quadratically, and message text is untrusted.
const TAIL = String.raw`\]\(chip:([^[:)]+):([^[)?]+)(?:\?([^[)]*))?\)`;

// Consumes a "[" and its label whether or not a token follows, so the scan
// resumes after the label instead of retrying the escaped "[" inside it. A
// match without the tail is plain text.
const SCAN_PATTERN = new RegExp(String.raw`\[${LABEL}(?:${TAIL})?`, "g");

/**
 * A chip: the label it shows, the prefix and value that say what it points
 * at, and an optional icon key.
 */
export type ChipData = {
  prefix: string;
  value: string;
  label: string;
  icon?: ChipIconKey;
};

/** One run of message text: plain text, or a chip parsed from a token. */
export type ChipSegment =
  | { type: "text"; text: string }
  | {
      type: "chip";
      label: string;
      prefix: string;
      value: string;
      icon?: ChipIconKey;
    };

/**
 * Backslash-escapes `[`, `]`, `(`, `)` and `\`, so the string can sit inside a
 * Markdown link's label.
 */
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

/**
 * Writes a chip as a token, `[Label](chip:prefix:value?icon=key)`. The label is
 * escaped, and the value and icon are percent-encoded, which leaves `)` as it
 * is. A token doesn't parse back when the prefix holds `:`, `)` or `[`, when the
 * value holds `)`, or when the label, prefix or value is empty.
 */
export const encodeChipMarkdown = (chip: ChipData): string => {
  const params = new URLSearchParams();
  if (chip.icon) params.set("icon", chip.icon);
  const query = params.toString();
  const value = encodeURIComponent(chip.value);
  return `[${escapeMarkdownLink(chip.label)}](chip:${chip.prefix}:${value}${query ? `?${query}` : ""})`;
};

/**
 * Splits message text into text and chip segments, in order. Anything that
 * isn't a whole token, a plain Markdown link included, stays in the text, and a
 * value with a malformed `%` escape is kept as written.
 */
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
