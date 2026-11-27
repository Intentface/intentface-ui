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
export { interpretEditorKey, interpretQuestionKey } from "./keyboard";
export type { ComposerPanelProps } from "./panel";
export type { ComposerPlaceholderProps } from "./placeholder";
export type { ComposerPopoverProps } from "./popover";
export type { ActiveTokenState, RegisteredPrefix } from "./prefix-detection";
export { CLOSED_COMMAND_STATE, detectActivePrefix } from "./prefix-detection";
export type {
  ComposerQuestionContinueProps,
  ComposerQuestionDismissProps,
  ComposerQuestionHeaderProps,
  ComposerQuestionHintsProps,
  ComposerQuestionLabelProps,
  ComposerQuestionNavigationProps,
  ComposerQuestionNextProps,
  ComposerQuestionOptionContentProps,
  ComposerQuestionOptionDescriptionProps,
  ComposerQuestionOptionLabelProps,
  ComposerQuestionOptionProps,
  ComposerQuestionOptionState,
  ComposerQuestionOptionsHandle,
  ComposerQuestionOptionsProps,
  ComposerQuestionPreviousProps,
  ComposerQuestionProps,
  ComposerQuestionStepLabelProps,
  ComposerQuestionStepLabelState,
} from "./question";
export { useQuestionOption, useQuestionOptions } from "./question";
export type { AnswerDraft, EditorBuffer } from "./question-machine";
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
  ComposerAttachmentsState,
  ComposerCommandsState,
  ComposerEditorState,
  ComposerPanelSlice,
  ComposerQuestionsState,
  ComposerState,
  ComposerStore,
} from "./store";
export { useComposer, useComposerStore } from "./store";
export type { ComposerTextareaProps, ComposerTextareaState } from "./textarea";
export type {
  AttachmentsApi,
  ChipData,
  CommandItemData,
  CommandItemKind,
  ComposerAnswer,
  ComposerAnswersSubmit,
  ComposerCommandsConfig,
  ComposerCommandsItems,
  ComposerCommandsMap,
  ComposerEditorHandle,
  ComposerMessageSubmit,
  ComposerQuestion,
  ComposerQuestionOption,
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
