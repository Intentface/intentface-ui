import { describe, expect, test } from "bun:test";
import { encodeChipMarkdown, parseChipSegments } from "../src/chip-markdown";

describe("encodeChipMarkdown / parseChipSegments round trip", () => {
  test("plain chip", () => {
    const token = encodeChipMarkdown({ prefix: "file", value: "report.pdf", label: "report.pdf" });
    expect(token).toBe("[report.pdf](chip:file:report.pdf)");

    const segments = parseChipSegments(`see ${token} for details`);
    expect(segments).toEqual([
      { type: "text", text: "see " },
      { type: "chip", label: "report.pdf", prefix: "file", value: "report.pdf" },
      { type: "text", text: " for details" },
    ]);
  });

  test("icon rides along in the token", () => {
    const token = encodeChipMarkdown({
      prefix: "tool",
      value: "web-search",
      label: "Web search",
      icon: "globe",
    });

    const segments = parseChipSegments(token);
    expect(segments).toEqual([
      {
        type: "chip",
        label: "Web search",
        prefix: "tool",
        value: "web-search",
        icon: "globe",
      },
    ]);
  });

  test("unknown token params (e.g. legacy variant) are ignored", () => {
    const segments = parseChipSegments("[Web search](chip:tool:web-search?variant=accent)");
    expect(segments).toEqual([
      { type: "chip", label: "Web search", prefix: "tool", value: "web-search" },
    ]);
  });

  test("values with special characters survive the round trip", () => {
    const token = encodeChipMarkdown({
      prefix: "query",
      value: "a & b? 100%",
      label: "a & b? 100%",
    });
    const segments = parseChipSegments(token);
    expect(segments[0]).toMatchObject({ type: "chip", value: "a & b? 100%" });
  });

  test.each([
    ["brackets", "Q3 [draft].md"],
    ["parentheses", "Notes (final).md"],
    ["a backslash", "back\\slash"],
    ["a trailing backslash", "C:\\dir\\"],
  ])("labels with %s survive the round trip", (_name, label) => {
    const token = encodeChipMarkdown({ prefix: "@", value: "file:fid_abc", label });
    expect(parseChipSegments(`see ${token} here`)).toEqual([
      { type: "text", text: "see " },
      { type: "chip", label, prefix: "@", value: "file:fid_abc" },
      { type: "text", text: " here" },
    ]);
  });

  test("legacy un-encoded values do not throw", () => {
    const segments = parseChipSegments("[label](chip:file:100%raw)");
    expect(segments[0]).toMatchObject({ type: "chip", value: "100%raw" });
  });

  test("text without chips is a single text segment", () => {
    expect(parseChipSegments("no chips here")).toEqual([{ type: "text", text: "no chips here" }]);
  });

  // ReDoS regression. The old pattern took ~355ms at 32k characters here.
  test("an unclosed bracket run does not blow up (ReDoS regression)", () => {
    const started = performance.now();
    const segments = parseChipSegments("[".repeat(200_000));
    const elapsed = performance.now() - started;

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: "text" });
    expect(elapsed).toBeLessThan(100);
  });

  test("a bracket run followed by a real chip still finds the chip", () => {
    const segments = parseChipSegments(`${"[".repeat(5_000)} [ada](chip:user:ada)`);
    expect(segments.filter((s) => s.type === "chip")).toEqual([
      { type: "chip", label: "ada", prefix: "user", value: "ada" },
    ]);
  });

  // The second blowup: token openings with no closing paren, which backtracked
  // through the value group from many start positions. ~264ms at 88k before.
  test.each([
    ["unterminated openings", "[a](chip:x:"],
    ["unterminated queries", "[a](chip:x:y?"],
  ])("%s do not blow up (ReDoS regression)", (_name, unit) => {
    const started = performance.now();
    const segments = parseChipSegments(unit.repeat(20_000));
    const elapsed = performance.now() - started;

    expect(segments.every((segment) => segment.type === "text")).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });

  // The third: an escaped "[" belongs to its label, so retrying each one as a
  // token start re-reads the rest of the run. ~1.5s at 40k when scanning with
  // CHIP_REF_PATTERN alone.
  test("a run of escaped brackets does not blow up (ReDoS regression)", () => {
    const started = performance.now();
    const segments = parseChipSegments(`[${"\\[".repeat(100_000)} [ada](chip:user:ada)`);
    const elapsed = performance.now() - started;

    expect(segments.filter((s) => s.type === "chip")).toEqual([
      { type: "chip", label: "ada", prefix: "user", value: "ada" },
    ]);
    expect(elapsed).toBeLessThan(100);
  });
});
