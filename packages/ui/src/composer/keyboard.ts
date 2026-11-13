// What a key means to a composer. Each listener classifies where a keydown
// came from, then asks the decision for its own layers; the call site keeps
// the how (preventDefault, focus, dispatch). The editor decides the editor's
// layer (command list, Enter, Backspace); Composer.Root and the page listener
// decide the composer's layers (the question, then generation).

import { isComposingKey } from "../internal/is-composing-key";

/** Which Enter chord sends the message; the other inserts a soft break. */
export type ComposerSubmitOn = "enter" | "shift-enter";

/** A keydown reduced to what every decision reads. */
export type KeyPress = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** An IME is composing: Enter, the arrows and Escape are the IME's. */
  composing: boolean;
  /** Something closer already used the key. */
  handled: boolean;
};

export const toKeyPress = (event: KeyboardEvent): KeyPress => ({
  key: event.key,
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  altKey: event.altKey,
  composing: isComposingKey(event),
  handled: event.defaultPrevented,
});

// ---------------------------------------------------------------------------
// Origin — where a keydown came from, relative to one composer.
// ---------------------------------------------------------------------------

export type KeyOrigin =
  /** This composer's editable. */
  | "editor"
  /** This composer's AskUser.Options. */
  | "options"
  /** Anything else in this composer's React tree: its buttons, chrome, portaled parts. */
  | "part"
  /** The page itself: focus fell out of every control. */
  | "nowhere"
  /** Another field, another composer, or another composer's options. */
  | "foreign";

export type KeyScope = {
  root: Element | null;
  editor: Element | null;
  options: Element | null;
};

const FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Composer.Root's classifier. React bubbled the key through this composer's
 * tree, so a target that is none of the closer things is one of its parts.
 */
export const classifyTreeKey = (
  target: EventTarget | null,
  scope: KeyScope,
): Exclude<KeyOrigin, "nowhere"> => {
  if (!(target instanceof Element)) return "part";
  if (scope.editor?.contains(target)) return "editor";
  if (scope.options?.contains(target)) return "options";
  if (target.closest(FIELD) || target.closest("[data-ask-user-options]")) return "foreign";
  const root = target.closest("[data-composer-root]");
  return root && root !== scope.root ? "foreign" : "part";
};

/** The page listener's classifier: only the page itself is unowned. */
export const isPageTarget = (target: EventTarget | null, ownerDocument: Document) =>
  target === ownerDocument ||
  target === ownerDocument.body ||
  target === ownerDocument.documentElement;

// ---------------------------------------------------------------------------
// The editor's layer: the command list anchored in it, and its text keys.
// ---------------------------------------------------------------------------

export type EditorKeyFacts = {
  commandList: boolean;
  empty: boolean;
  hasAttachments: boolean;
  submitOn: ComposerSubmitOn;
};

export type EditorKeyAction =
  | { type: "command-select" }
  | { type: "command-close" }
  | { type: "command-navigate"; direction: 1 | -1 }
  | { type: "command-caret"; direction: 1 | -1 }
  | { type: "remove-last-attachment" }
  | { type: "submit" }
  | { type: "soft-break" };

export const decideEditorKey = (press: KeyPress, facts: EditorKeyFacts): EditorKeyAction | null => {
  if (press.composing || press.handled) return null;
  const { key, shiftKey } = press;
  const { commandList } = facts;

  switch (true) {
    case commandList && key === "Tab":
      return { type: "command-select" };
    case commandList && key === "Escape":
      return { type: "command-close" };
    case commandList && key === "ArrowUp":
      return { type: "command-navigate", direction: -1 };
    case commandList && key === "ArrowDown":
      return { type: "command-navigate", direction: 1 };
    case commandList && key === "ArrowLeft":
      return { type: "command-caret", direction: -1 };
    case commandList && key === "ArrowRight":
      return { type: "command-caret", direction: 1 };
    case commandList && key === "Enter" && !shiftKey:
      return { type: "command-select" };

    case key === "Backspace" && facts.empty && facts.hasAttachments:
      return { type: "remove-last-attachment" };

    // Send / soft break — the chord mapping swaps on submitOn. Sending stays
    // suppressed while the command list is open (its own Enter branch above
    // selects; the surviving chord falls through to a soft break here, so
    // neither mapping can submit mid-popup).
    case key === "Enter": {
      const sendChordPressed = facts.submitOn === "enter" ? !shiftKey : shiftKey;
      return sendChordPressed && !commandList ? { type: "submit" } : { type: "soft-break" };
    }

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// The composer's layers: the question, then generation.
// ---------------------------------------------------------------------------

export type ComposerKeyState = {
  question: { phase: "none" } | { phase: "asking"; highlighted: boolean };
  canStopGenerating: boolean;
};

export type ComposerKeyAction =
  | { type: "dismiss-step" }
  | { type: "stop-generating" }
  | { type: "navigate-options"; direction: 1 | -1 }
  | { type: "select-option" }
  | { type: "change-step"; direction: 1 | -1 }
  | { type: "type-answer"; character: string };

type OwnOrigin = Exclude<KeyOrigin, "foreign">;

export const decideComposerKey = (
  press: KeyPress,
  state: ComposerKeyState,
  origin: KeyOrigin,
): ComposerKeyAction | null => {
  if (press.composing || press.handled || origin === "foreign") return null;
  if (state.question.phase === "asking") {
    return decideQuestionKey(press, state.question.highlighted, origin);
  }
  if (press.key === "Escape" && state.canStopGenerating && origin !== "nowhere") {
    return { type: "stop-generating" };
  }
  return null;
};

const VERTICAL_ARROWS: Partial<Record<string, 1 | -1>> = { ArrowUp: -1, ArrowDown: 1 };
const HORIZONTAL_ARROWS: Partial<Record<string, 1 | -1>> = { ArrowLeft: -1, ArrowRight: 1 };

// From the editor only Escape and the vertical arrows are the question's: the
// rest is typing and caret movement. Elsewhere the keys act on the highlighted
// option, except that a focused control presses itself on Enter and Space.
const decideQuestionKey = (
  press: KeyPress,
  highlighted: boolean,
  origin: OwnOrigin,
): ComposerKeyAction | null => {
  const { key } = press;
  const vertical = VERTICAL_ARROWS[key];
  const horizontal = HORIZONTAL_ARROWS[key];

  if (key === "Escape") return { type: "dismiss-step" };
  if (origin === "editor")
    return vertical ? { type: "navigate-options", direction: vertical } : null;
  if (!highlighted) return null;
  if (vertical) return { type: "navigate-options", direction: vertical };
  if (horizontal) return { type: "change-step", direction: horizontal };
  if (key === "Enter" || key === " ") return origin === "part" ? null : { type: "select-option" };
  return isPrintable(press) ? { type: "type-answer", character: key } : null;
};

const isPrintable = ({ key, ctrlKey, metaKey, altKey }: KeyPress) =>
  key.length === 1 && !ctrlKey && !metaKey && !altKey;
