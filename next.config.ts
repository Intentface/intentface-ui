import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

// `exports` in packages/ui points at ./dist for consumers, so map each
// subpath back to source here — the app compiles package source with no build
// step. Entries are explicit rather than a wildcard: Turbopack resolveAlias
// matches request strings, not glob patterns.
const packageSourceAliases = {
  "@intentface/ui/types": "./packages/ui/src/types.ts",
  "@intentface/ui/composer": "./packages/ui/src/composer/index.ts",
  "@intentface/ui/chip": "./packages/ui/src/chip/index.ts",
  "@intentface/ui/thread": "./packages/ui/src/thread/index.ts",
  "@intentface/ui/reasoning": "./packages/ui/src/reasoning/index.ts",
  "@intentface/ui/steps": "./packages/ui/src/steps/index.ts",
  "@intentface/ui/attachments": "./packages/ui/src/attachments/index.ts",
  "@intentface/ui/message": "./packages/ui/src/message/index.ts",
  "@intentface/ui/message-utils": "./packages/ui/src/message-utils.ts",
  "@intentface/ui/chip-markdown": "./packages/ui/src/chip-markdown.ts",
};

const nextConfig: NextConfig = {
  transpilePackages: ["@intentface/ui"],
  // React's <ViewTransition>: switching between the docs and the playground
  // cross-dissolves the viewport (see SiteShell).
  experimental: { viewTransition: true },
  turbopack: { resolveAlias: packageSourceAliases },
  // Any docs page is readable as markdown by appending `.md` — the convention
  // agents expect, and guessable from a page URL. It maps onto the same handler
  // that "View as Markdown" uses.
  rewrites: async () => [{ source: "/:slug*.md", destination: "/docs-markdown/:slug*" }],
  // These routes readFile at request time; the bundler can't trace runtime
  // paths, so the files must be included in the serverless output explicitly.
  outputFileTracingIncludes: {
    "/api/chat": ["./content/docs/**/*", "./packages/ui/src/**/*"],
    "/docs-markdown/[...slug]": ["./content/docs/**/*"],
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
