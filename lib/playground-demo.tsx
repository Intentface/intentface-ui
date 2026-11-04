import { type CommandItemData, Composer } from "@/components/ai/composer";
import type { Question } from "@/lib/ai/types";

// Demo data for the playground cards (formerly app/playground/page.tsx): the
// question sets, the fake async issue list behind the `#` command,
// and the "open in the workspace" context strip. Pure fixtures — the toggles
// that mount them live in the Composer card.

export const singleQuestion: Question[] = [
  {
    question: "Which database should we use?",
    header: "Database",
    options: [
      {
        label: "PostgreSQL",
        description: "Relational, battle-tested, great for structured data",
      },
      {
        label: "MongoDB",
        description: "Document store, flexible schema, good for rapid prototyping",
      },
      {
        label: "SQLite",
        description: "Embedded, zero-config, perfect for local development",
      },
    ],
  },
];

export const multipleQuestions: Question[] = [
  {
    question: "Which auth method do you prefer?",
    header: "Auth",
    options: [
      {
        label: "OAuth 2.0",
        description: "Delegated auth via Google, GitHub, etc.",
      },
      {
        label: "JWT",
        description: "Stateless tokens, good for APIs",
      },
      {
        label: "Session-based",
        description: "Server-side sessions with cookies",
      },
      {
        label: "Passkeys",
        description: "WebAuthn-based passwordless authentication",
      },
    ],
  },
  {
    question: "Which features should we enable?",
    header: "Features",
    multiSelect: true,
    options: [
      {
        label: "Dark mode",
        description: "Theme toggle with system preference detection",
      },
      {
        label: "Notifications",
        description: "Push and in-app notification system",
      },
      {
        label: "Analytics",
        description: "Usage tracking and dashboard",
      },
      {
        label: "i18n",
        description: "Multi-language support with locale detection",
      },
    ],
  },
];

// Async-callback exercise: a fake "issues" list fetched with simulated latency.
// Typing `#` opens the list; typing fast aborts in-flight calls via AbortSignal.
// The package has no `group` field, so we attach our own for the grouping demo.
export type GroupedIssue = CommandItemData & { group: string };

// Sorted by group (Bugs → UI → Performance) on purpose: the command list's
// highlight is a flat index over this order, so keeping the source grouped keeps
// arrow-key nav aligned with the visual groups below. Reorder it and the
// highlight would jump between groups as you press down.
// Linear-style identifiers: the label describes the entity without repeating
// the typed trigger, so the committed chip reads "INT-123 …", not "##123 …".
export const PLAYGROUND_ISSUES: GroupedIssue[] = [
  { value: "INT-123", label: "INT-123 Login throws on empty password", group: "Bugs" },
  { value: "INT-199", label: "INT-199 Search returns stale results", group: "Bugs" },
  { value: "INT-287", label: "INT-287 Composer keyboard nav broken on Safari", group: "Bugs" },
  { value: "INT-478", label: "INT-478 i18n stubs out of date", group: "Bugs" },
  { value: "INT-534", label: "INT-534 Auth token refresh loop", group: "Bugs" },
  { value: "INT-231", label: "INT-231 Markdown render flash", group: "UI" },
  { value: "INT-312", label: "INT-312 Theme picker overflow", group: "UI" },
  { value: "INT-401", label: "INT-401 Empty state CTA too small", group: "UI" },
  { value: "INT-445", label: "INT-445 Sidebar collapse animation jank", group: "UI" },
  { value: "INT-502", label: "INT-502 Attachment thumbnails missing", group: "UI" },
  { value: "INT-142", label: "INT-142 Memory leak in idle workers", group: "Performance" },
  { value: "INT-356", label: "INT-356 Streaming cancellation race", group: "Performance" },
].map((item) => ({ ...item, icon: "bug" as const }));

const abortableDelay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

export const fetchPlaygroundIssues = async (
  query: string,
  { signal }: { signal: AbortSignal },
): Promise<GroupedIssue[]> => {
  const latency = 300 + Math.random() * 600;
  await abortableDelay(latency, signal);
  const lowered = query.toLowerCase();
  if (!lowered) return PLAYGROUND_ISSUES;
  return PLAYGROUND_ISSUES.filter((item) => item.label.toLowerCase().includes(lowered));
};

// ---------------------------------------------------------------------------
// Grouped command list for the `#` prefix — Composer.CommandGroup owns the
// partition: give it a `groupBy` (our own `group` field) and it buckets the
// resolved, library-filtered items in first-appearance order (nav still flows
// top-to-bottom), rendering the callback once per group. A group whose items
// all filter out just doesn't render.
// ---------------------------------------------------------------------------

export const GroupedIssueCommands = () => (
  <Composer.Command prefix="#">
    <Composer.CommandLoading />
    <Composer.CommandEmpty />
    <Composer.CommandGroup groupBy={(item: GroupedIssue) => item.group}>
      {(group, items) => (
        <>
          <Composer.CommandGroupLabel>{group}</Composer.CommandGroupLabel>
          {items.map((item) => (
            <Composer.CommandItem key={item.value} value={item.value}>
              <Composer.CommandItemLabel>{item.label}</Composer.CommandItemLabel>
            </Composer.CommandItem>
          ))}
        </>
      )}
    </Composer.CommandGroup>
  </Composer.Command>
);
