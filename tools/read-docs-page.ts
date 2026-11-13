import { readFile } from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { expandDemos } from "@/lib/docs/expand-demos";
import { getPage } from "@/lib/docs/source";

export const readDocsPage = tool({
  description:
    "Read one @intentface/ui documentation page as raw markdown. Use a slug returned by listDocsPages.",
  inputSchema: z.object({
    slug: z.string().describe('Page slug from listDocsPages, e.g. "primitives/composer"'),
  }),
  execute: async ({ slug }) => {
    const page = getPage(slug === "index" ? [] : slug.split("/"));
    if (!page) {
      return { error: `No documentation page "${slug}". Call listDocsPages for valid slugs.` };
    }

    // Scoped under content/docs so the bundler traces that folder, not the
    // whole project; next.config includes it for /api/chat.
    const filePath = path.join(process.cwd(), "content", "docs", page.path);
    // Demos are inlined as code blocks — the tag alone carries no source.
    const markdown = await expandDemos(await readFile(filePath, "utf8"));

    return {
      slug,
      title: page.data.title,
      url: page.url,
      markdown,
    };
  },
});
