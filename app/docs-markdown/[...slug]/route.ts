import { readFile } from "node:fs/promises";
import path from "node:path";
import { expandDemos } from "@/lib/docs/expand-demos";
import { expandIncludes } from "@/lib/docs/expand-includes";
import { getPages } from "@/lib/docs/source";

// Prerendered at build time, when the demos and included files are on disk. A
// serverless function would hold only what the bundler traced, which misses an
// include like the changelog's.
export const dynamic = "force-static";
export const dynamicParams = false;

// The root page is "index", the slug llms.txt links to.
export const generateStaticParams = () =>
  getPages().map((page) => ({ slug: page.slugs.length ? page.slugs : ["index"] }));

// Serves a doc page's .mdx as text/plain so "View as Markdown" opens the source
// in-browser (and pastes cleanly into an LLM). The slug maps directly to the
// file under content/docs, mirroring the fumadocs page route. Demos and included
// files are inlined so a reader that can't run the page still gets the content.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;

  // Reject anything that could escape content/docs; slugs are plain segments.
  if (!slug?.length || slug.some((segment) => segment.includes(".."))) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "content", "docs", `${slug.join("/")}.mdx`);

  try {
    const source = await expandDemos(
      await expandIncludes(await readFile(filePath, "utf8"), filePath),
    );
    return new Response(source, {
      headers: { "content-type": "text/markdown; charset=utf-8" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
