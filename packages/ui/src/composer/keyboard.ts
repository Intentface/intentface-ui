// Keyboard interpreters — translate a raw key event (reduced to plain data)
// plus surrounding state into a high-level action. No React or DOM access:
// the component layer decides what a key means here and keeps the how
// (preventDefault, focus, dispatch) at the call site.

export type EditorKeyAction =
  | { type: "command-select" }
  | { type: "command-close" }
  | { type: "command-navigate"; direction: 1 | -1 }
  | { type: "command-caret"; direction: 1 | -1 }
  | { type: "ask-user-arrow"; direction: 1 | -1 }
  | { type: "ask-user-dismiss" }
  | { type: "remove-last-attachment" }
  | { type: "submit-form" }
  | { type: "soft-break" };

/** Which Enter chord sends the message; the other inserts a soft break. */
export type ComposerSubmitOn = "enter" | "shift-enter";

export type EditorKeyContext = {
  isCommandListOpen: boolean;
  hasActiveAskUser: boolean;
  isEditorEmpty: boolean;
  hasAttachments: boolean;
  /** Defaults to "enter" (Enter sends, Shift+Enter breaks). */
  submitOn?: ComposerSubmitOn;
};

export const interpretEditorKey = (
  event: { key: string; shiftKey: boolean },
  context: EditorKeyContext,
): EditorKeyAction | null => {
  const { key, shiftKey } = event;
  const { isCommandListOpen, hasActiveAskUser } = context;

  switch (true) {
    case isCommandListOpen && key === "Tab":
      return { type: "command-select" };
    case isCommandListOpen && key === "Escape":
      return { type: "command-close" };
    case isCommandListOpen && key === "ArrowUp":
      return { type: "command-navigate", direction: -1 };
    case isCommandListOpen && key === "ArrowDown":
      return { type: "command-navigate", direction: 1 };
    case isCommandListOpen && key === "ArrowLeft":
      return { type: "command-caret", direction: -1 };
    case isCommandListOpen && key === "ArrowRight":
      return { type: "command-caret", direction: 1 };
    case isCommandListOpen && key === "Enter" && !shiftKey:
      return { type: "command-select" };

    case hasActiveAskUser && key === "ArrowUp":
      return { type: "ask-user-arrow", direction: -1 };
    case hasActiveAskUser && key === "ArrowDown":
      return { type: "ask-user-arrow", direction: 1 };
    // Question-mode keys now attach to the options container (roving focus),
    // so an editor-focused Escape must dismiss from here.
    case hasActiveAskUser && key === "Escape":
      return { type: "ask-user-dismiss" };

    case key === "Backspace" && context.isEditorEmpty && context.hasAttachments:
      return { type: "remove-last-attachment" };

    // Send / soft break — the chord mapping swaps on submitOn. Sending stays
    // suppressed while the command list is open (its own Enter branch above
    // selects; the surviving chord falls through to a soft break here, so
    // neither mapping can submit mid-popup).
    case key === "Enter": {
      const sendChordPressed = (context.submitOn ?? "enter") === "enter" ? !shiftKey : shiftKey;
      return sendChordPressed && !isCommandListOpen
        ? { type: "submit-form" }
        : { type: "soft-break" };
    }

    default:
      return null;
  }
};

export type AskUserKeyAction =
  | { type: "dismiss-step" }
  | { type: "navigate-options"; direction: 1 | -1 }
  | { type: "select-option" }
  | { type: "go-back" }
  | { type: "go-next" }
  | { type: "insert-character"; character: string };

export type AskUserKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

export const interpretAskUserKey = (
  event: AskUserKeyEvent,
  context: { hasHighlight: boolean },
): AskUserKeyAction | null => {
  const { key } = event;

  switch (true) {
    case event.defaultPrevented:
      return null;
    case key === "Escape":
      return { type: "dismiss-step" };
    case !context.hasHighlight:
      return null;

    case key === "ArrowUp":
      return { type: "navigate-options", direction: -1 };
    case key === "ArrowDown":
      return { type: "navigate-options", direction: 1 };
    case key === "Enter":
      return { type: "select-option" };
    // APG radio/checkbox: Space toggles the focused option. Wins over the
    // printable branch — an answer can't meaningfully start with a space.
    case key === " ":
      return { type: "select-option" };
    case key === "ArrowLeft":
      return { type: "go-back" };
    case key === "ArrowRight":
      return { type: "go-next" };

    default: {
      const isPrintable = key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
      return isPrintable ? { type: "insert-character", character: key } : null;
    }
  }
};
