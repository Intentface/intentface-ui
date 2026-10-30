// Public composer types — the wire-level contracts consumers interact with:
// command configs, submit payloads, the opaque editor snapshot, and the
// imperative editor/attachments APIs.

import type { AttachmentItem } from "../attachments";
import type { ChipData, ChipIconKey } from "../chip-markdown";

// The composer's question contract — the minimal shape the flow needs to step
// through questions, toggle options, and compile answers. It carries no
// app-tool schema: richer consumer types satisfy it structurally.
export type ComposerQuestionOption = {
  /** Machine-readable, echoed back in `selected`. Falls back to `label`. */
  value?: string;
  label: string;
  description?: string;
};

export type ComposerQuestion = {
  /** Opaque to the package — the consumer mints it and gets it back. */
  id: string;
  label: string;
  options: ComposerQuestionOption[];
  multiSelect?: boolean;
};

export type CommandItemKind = "insert" | "execute";

/**
 * Where a prefix is allowed to open its command list.
 *
 * - `doc-start` — only when the prefix is the very first thing in the document
 *   (the `/` slash-command convention).
 * - `word-boundary` — at the start of a line or after whitespace, so `@` opens
 *   a mention but the `@` in `user@example.com` does not.
 */
export type TriggerRule = "doc-start" | "word-boundary";

export type { ChipData };

export type ComposerEditorHandle = {
  /** Focus the editor. Takes `HTMLElement.focus()`'s options: pass `{ preventScroll: true }` to leave the page where it is. */
  focus: (options?: FocusOptions) => void;
  blur: () => void;
  clear: () => void;
  insertText: (text: string) => void;
  insertChip: (chip: ChipData) => void;
};

// The contract a mounted editor engine registers with the composer store.
// The store, internals, and the shared command list speak only this interface —
// never a concrete editor — so engines are interchangeable behind it. The
// engine owns its document model, trigger-token tracking, and DOM; the
// composer drives it through these operations.
export type RegisteredEditor = ComposerEditorHandle & {
  getText: () => string;
  setText: (text: string) => void;
  serialize: () => { text: string };
  isFocused: () => boolean;
  /** The editable root element — event scoping and badge queries anchor to it. */
  getRootElement: () => HTMLElement | null;
  getSnapshot: () => ComposerSnapshot;
  /** Show a saved buffer. Never takes focus: the DOM selection moves only while the editor already has it. */
  applySnapshot: (snapshot: ComposerSnapshot) => void;
  /** Replace the active trigger token with a chip, plus a trailing space unless one follows. */
  insertChipAtTrigger: (chip: ChipData) => void;
  /** Remove the active trigger token (execute-kind command selections). */
  deleteTrigger: () => void;
  /** Close the command popup state after a selection committed. */
  closeCommands: () => void;
  /** Refocus the editor and close the command popup — the Escape/Dismiss path. */
  dismissCommands: () => void;
};

export type AttachmentsApi = {
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  openFileDialog: () => void;
};

export type PrefixOnSelectContext = {
  editor: ComposerEditorHandle;
  attachments: AttachmentsApi;
};

export type CommandItemData = {
  value: string;
  label: string;
  description?: string;
  icon?: ChipIconKey;
  keywords?: string;
  /**
   * Renders the row inert (aria-disabled / data-disabled) and removes it from
   * keyboard navigation and selection. Disabled rows still match the filter.
   */
  disabled?: boolean;
  onSelect?: (context: PrefixOnSelectContext) => void;
};

/**
 * Opaque editor content for the controlled `value` / `defaultValue` API. Treat
 * it as a token: persist and hand it back, but don't read into `__doc` — the
 * payload shape is an implementation detail (currently paragraph JSON).
 */
export type ComposerSnapshot = {
  readonly __doc: object;
  readonly __brand: "ComposerSnapshot";
};

export type ComposerMessageSubmit = {
  kind: "message";
  text: string;
  files: AttachmentItem[];
};

// An answer: the id the consumer minted on its question, plus what the user
// picked. One flat shape for every kind of question.
export type ComposerAnswer = {
  id: string;
  /** Option values; empty when skipped or text-only. */
  selected: string[];
  /** Present only when the user typed something. */
  text?: string;
};

export type ComposerAnswersSubmit = {
  kind: "answers";
  answers: ComposerAnswer[];
};

export type ComposerSubmitData = ComposerMessageSubmit | ComposerAnswersSubmit;

export type ComposerCommandsItems =
  | CommandItemData[]
  | ((
      query: string,
      options: { signal: AbortSignal },
    ) => CommandItemData[] | Promise<CommandItemData[]>);

export type ComposerCommandsConfig = {
  kind: CommandItemKind;
  trigger: TriggerRule;
  items: ComposerCommandsItems;
  /**
   * Ghost-text completion of the highlighted item in the active token
   * (data-command-suggestion). Defaults to true; turn off per prefix when the
   * highlight is unstable (e.g. async sources re-ranking while typing).
   */
  suggestion?: boolean;
  /**
   * Per-prefix hint shown while the query is empty, rendered into the badge's
   * hint element (span[data-command-hint]). Defaults to "Type to
   * filter". Never shows alongside a suggestion — one hint slot, suggestion
   * wins — so this is the resident hint for suggestion: false prefixes and
   * the fallback when nothing can complete.
   */
  placeholder?: string;
};

export type ComposerCommandsMap = Record<string, ComposerCommandsConfig>;
