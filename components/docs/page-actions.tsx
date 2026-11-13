"use client";

import { Check } from "@keyline-icons/react";
// Keyline has no brand or Markdown icons, so these stay on Tabler.
import { IconBrandGithub, IconMarkdown } from "@tabler/icons-react";
import Button from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useCopy } from "@/hooks/use-copy";

const REPO = "https://github.com/Intentface/intentface-ui";

type PageActionsProps = {
  slug: string[];
  // Component path under packages/ui/src (frontmatter `source`); omitted on
  // pages that document no single component.
  source?: string;
};

// "Copy page" puts the page's raw markdown on the clipboard (the same file the
// `.md` route serves); the GitHub link goes to the primitive's source when the
// page documents one, and to the repo otherwise.
export const PageActions = ({ slug, source }: PageActionsProps) => {
  const { copy, isCopied } = useCopy();
  const markdownUrl = `/${slug.join("/")}.md`;

  const copyPage = async () => {
    const response = await fetch(markdownUrl);
    if (response.ok) await copy(await response.text());
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" className="gap-1.5 pr-2.5 pl-2 text-sm" onClick={copyPage}>
        {isCopied ? <Check /> : <IconMarkdown />}
        {isCopied ? "Copied" : "Copy page"}
      </Button>
      <IconButton
        variant="ghost"
        size="sm"
        nativeButton={false}
        aria-label={source ? "Source on GitHub" : "GitHub repository"}
        render={
          <a
            href={source ? `${REPO}/tree/main/packages/ui/src/${source}` : REPO}
            target="_blank"
            rel="noreferrer"
          >
            <IconBrandGithub />
          </a>
        }
      />
    </div>
  );
};
