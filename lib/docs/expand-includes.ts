import { readFile } from "node:fs/promises";
import path from "node:path";

// <include>../../packages/ui/CHANGELOG.md</include>
const INCLUDE_TAG = /<include>([^<]+)<\/include>/g;

/**
 * Replaces each `<include>` in a docs page's raw MDX with the file it names,
 * resolved from the page's folder. The rendered page does this at build time;
 * without it the markdown copy holds only the tag. An unreadable file leaves the
 * tag untouched.
 */
export const expandIncludes = async (markdown: string, pageFile: string): Promise<string> => {
  const files = [...new Set([...markdown.matchAll(INCLUDE_TAG)].map(([, file]) => file.trim()))];
  if (files.length === 0) return markdown;

  const sources = new Map<string, string>();
  await Promise.all(
    files.map(async (file) => {
      const source = await readFile(path.resolve(path.dirname(pageFile), file), "utf8").catch(
        () => null,
      );
      if (source !== null) sources.set(file, source.trimEnd());
    }),
  );

  return markdown.replace(INCLUDE_TAG, (tag, file: string) => sources.get(file.trim()) ?? tag);
};
