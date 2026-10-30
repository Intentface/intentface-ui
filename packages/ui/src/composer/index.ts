// Public surface of @intentface/ui/composer: the `Composer` namespace plus
// the store/controller/hook building blocks. No "use client" directive here —
// see index.parts.ts.

export type { ComposerSubmitState, UseComposerSubmitOptions } from "./actions";
export { useComposerSubmit } from "./actions";
export type { ComposerAttachmentsProps, ComposerAttachmentTriggerProps } from "./attachments";
export type { CommandListState, ComposerCommandProps } from "./command-list";
export { useCommandListItems } from "./command-list";
export type { ComposerContainerProps } from "./container";
export { useComposerController } from "./controller";
export { filterArrayItems, fuzzyScore, suggestionRemainder } from "./fuzzy";
export * as Composer from "./index.parts";
export type { ComposerSubmitOn, EditorKeyAction, EditorKeyContext } from "./keyboard";
export { interpretAskUserKey, interpretEditorKey } from "./keyboard";
export type { ComposerPanelProps } from "./panel";
export type { ComposerPlaceholderProps } from "./placeholder";
export type { ComposerPopoverProps } from "./popover";
export type { ActiveTokenState, RegisteredPrefix } from "./prefix-detection";
export { CLOSED_COMMAND_STATE, detectActivePrefix } from "./prefix-detection";
export type { ComposerRootProps } from "./root";
export type { Segment, SegmentDoc, TextChange } from "./segments";
export {
  documentLength,
  getPlainText,
  serializeSegments,
  sliceSegments,
  spliceSegments,
} from "./segments";
export type {
  ComposerAskUserState,
  ComposerAttachmentsState,
  ComposerBox,
  ComposerCommandsState,
  ComposerEditorState,
  ComposerPanelSlice,
  ComposerSize,
  ComposerState,
  ComposerStore,
} from "./store";
export { useComposer, useComposerStore } from "./store";
export type { ComposerTextareaProps, ComposerTextareaState } from "./textarea";
export type {
  AskUserOption,
  AskUserQuestion,
  AttachmentsApi,
  ChipData,
  CommandItemData,
  CommandItemKind,
  ComposerAnswerEntry,
  ComposerAnswersSubmit,
  ComposerCommandsConfig,
  ComposerCommandsItems,
  ComposerCommandsMap,
  ComposerEditorHandle,
  ComposerMessageSubmit,
  ComposerSnapshot,
  ComposerSubmitData,
  PrefixOnSelectContext,
  RegisteredEditor,
  TriggerRule,
} from "./types";
export type {
  ComposerEditableProps,
  UseComposerEditorOptions,
  UseComposerEditorResult,
} from "./use-composer-editor";
export { useComposerEditor } from "./use-composer-editor";
