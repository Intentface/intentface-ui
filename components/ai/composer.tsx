"use client";
import { ArrowUp, Check, ChevronLeft, ChevronRight, Stop } from "@keyline-icons/react";

// Styled composer — thin wrappers over @intentface/ui/composer. Behavior
// (editor, store, machines, command plumbing) lives in the package; this file
// carries the Tailwind classes, icons, and motion, and re-exports the public
// surface so consumers keep importing from "@/components/ai/composer".

import {
  type CommandItemData as CommandItemDataPrimitive,
  Composer as ComposerPrimitive,
  type ComposerStore,
  type ComposerSubmitOn,
  useComposer,
  useComposerController,
  useComposerStore,
  useComposerSubmit,
  useQuestionOption,
  useQuestionOptions,
} from "@intentface/ui/composer";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Children, type ComponentProps, type ReactNode, useMemo, useRef } from "react";
import { Attachments } from "@/components/ai/attachments";
import { Chip } from "@/components/ai/chip";
import Button from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { useLoop } from "@/hooks/use-loop";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_FILE_SIZE,
  ATTACHMENT_MAX_FILES,
} from "@/lib/ai/attachments";
import { CHIP_ICONS, type ChipIconKey, isChipIconKey } from "@/lib/ai/chip-icons";
import { cn } from "@/lib/utils";

export { useComposer, useComposerController, useComposerStore };
export type { ComposerStore };

// The wire format carries the icon as an opaque string; this app's command
// items narrow it to the concrete union so CHIP_ICONS indexing stays typed.
export type CommandItemData = Omit<CommandItemDataPrimitive, "icon"> & {
  icon?: ChipIconKey;
};

export type {
  AttachmentsApi,
  ChipData,
  CommandItemKind,
  ComposerAnswer,
  ComposerAnswersSubmit,
  ComposerCommandsConfig,
  ComposerCommandsItems,
  ComposerCommandsMap,
  ComposerEditorHandle,
  ComposerEditorState,
  ComposerMessageSubmit,
  ComposerQuestion,
  ComposerQuestionOption,
  ComposerSnapshot,
  ComposerSubmitData,
  ComposerSubmitOn,
  PrefixOnSelectContext,
  TriggerRule,
} from "@intentface/ui/composer";

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export type ComposerRootProps = ComponentProps<typeof ComposerPrimitive.Root>;

const ComposerRoot = ({ className, ...props }: ComposerRootProps) => (
  <ComposerPrimitive.Root
    className={cn(
      "relative flex w-full flex-col rounded-2xl transition-[padding,background-color] duration-200",
      // With context showing, the root becomes the Linear-style tray: a grey
      // band wrapping the composer, its context row on top.
      "has-[>[data-composer-context-window][data-open]]:bg-ink-primary/[0.04] has-[>[data-composer-context-window][data-open]]:p-1 dark:has-[>[data-composer-context-window][data-open]]:bg-white/[0.02]",
      className,
    )}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

type ComposerContainerProps = ComponentProps<typeof ComposerPrimitive.Container>;

const ComposerContainer = ({ className, ...props }: ComposerContainerProps) => (
  <ComposerPrimitive.Container
    className={cn(
      // One colour throughout; the edge is the composer shadow, not a border.
      "relative cursor-text rounded-xl bg-composer-bg p-1 shadow-composer transition-colors",
      className,
    )}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// Attachments / AttachmentTrigger
// ---------------------------------------------------------------------------

type ComposerAttachmentsProps = {
  className?: string;
  accept?: string;
  maxFiles?: number;
  maxFileSize?: number;
  multiple?: boolean;
  globalDrop?: boolean;
};

// The primitive imposes no policy; this app's accept/limits are applied here.
const ComposerAttachments = ({
  className,
  accept = ATTACHMENT_ACCEPT,
  maxFiles = ATTACHMENT_MAX_FILES,
  maxFileSize = ATTACHMENT_MAX_FILE_SIZE,
  ...props
}: ComposerAttachmentsProps) => {
  const attachments = useComposer((composer) => composer.attachments);

  return (
    <ComposerPrimitive.Attachments
      accept={accept}
      maxFiles={maxFiles}
      maxFileSize={maxFileSize}
      {...props}
    >
      <AnimatePresence initial={false}>
        {(attachments.isDragging || attachments.items.length > 0) && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="relative">
              {attachments.items.length > 0 ? (
                <div className={cn("flex flex-wrap gap-2 p-2", className)}>
                  <AnimatePresence initial={false}>
                    {attachments.items.map((attachment) => (
                      <Attachments.Item key={attachment.id} item={attachment}>
                        <Attachments.Remove
                          filename={attachment.filename}
                          onRemove={() => attachments.remove(attachment.id)}
                        />
                      </Attachments.Item>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="h-14" />
              )}
              <Attachments.Dropzone visible={attachments.isDragging} variant="inline" />
            </div>
          </m.div>
        )}
      </AnimatePresence>
      <Attachments.Error code={attachments.error} />
    </ComposerPrimitive.Attachments>
  );
};

type ComposerAttachmentTriggerProps = ComponentProps<typeof IconButton>;

const ComposerAttachmentTrigger = (props: ComposerAttachmentTriggerProps) => {
  const attachments = useComposer((composer) => composer.attachments);

  return (
    <Attachments.Trigger
      data-slot="composer-attachment-trigger"
      onClick={() => attachments.openFileDialog()}
      {...props}
    />
  );
};

// ---------------------------------------------------------------------------
// Textarea / Placeholder
// ---------------------------------------------------------------------------

type ComposerTextareaProps = {
  value?: string;
  onValueChange?: (text: string) => void;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Which Enter chord sends the message; the other inserts a soft break. */
  submitOn?: ComposerSubmitOn;
  children?: ReactNode;
};

const ComposerTextarea = ({ className, disabled = false, ...props }: ComposerTextareaProps) => (
  <ComposerPrimitive.Textarea
    disabled={disabled}
    // The wire format carries the icon as an opaque string; narrow it to this
    // app's concrete keys here — unknown values fall back to no icon.
    renderChip={(chip) => {
      const icon = chip.icon && isChipIconKey(chip.icon) ? CHIP_ICONS[chip.icon] : undefined;
      return (
        // One chip surface everywhere, so the badge commits without a jump.
        <Chip>
          {icon && <Chip.Icon>{icon}</Chip.Icon>}
          <Chip.Label>{chip.label}</Chip.Label>
        </Chip>
      );
    }}
    className={cn(
      "max-h-32 min-h-12 overflow-y-auto px-2.5 pt-2.5 pb-1 text-md",
      "mask-[linear-gradient(to_bottom,transparent,black_16px,black_calc(100%-16px),transparent)]",
      // The editor element — engine-owned DOM, out of JSX reach.
      "**:data-composer-editor:w-full **:data-composer-editor:max-w-none **:data-composer-editor:font-book **:data-composer-editor:leading-6 [&_[data-composer-editor]:focus]:outline-none",
      // Active-prefix badge: the same surface as the committed chip above, so
      // the badge and the chip it becomes share one baseline — no jump on commit.
      "**:data-command-badge:box-decoration-clone **:data-command-badge:inline **:data-command-badge:rounded **:data-command-badge:px-1.5 **:data-command-badge:py-0.5 **:data-command-badge:align-baseline **:data-command-badge:font-book **:data-command-badge:leading-[inherit] **:data-command-badge:whitespace-nowrap **:data-command-badge:bg-ink-primary/6 **:data-command-badge:text-ink-primary",
      // The badge's hint element — ghost-text completion or the empty-query
      // placeholder (the package renders whichever applies into one slot).
      "**:data-command-hint:pointer-events-none **:data-command-hint:whitespace-nowrap **:data-command-hint:text-ink-tertiary",

      disabled && "opacity-50 cursor-not-allowed",
      className,
    )}
    {...props}
  />
);

type ComposerPlaceholderProps =
  | { placeholder: string | string[]; children?: never; className?: string }
  | { placeholder?: never; children: ReactNode; className?: string };

const ComposerPlaceholder = ({ placeholder, children, className }: ComposerPlaceholderProps) => {
  // Rotation lives here, in the styled layer — the headless Composer.Placeholder
  // just renders content. Resolve the items and loop over the string ones.
  const items = useMemo<ReactNode[]>(() => {
    if (placeholder !== undefined) return Array.isArray(placeholder) ? placeholder : [placeholder];
    if (children) return Children.toArray(children);
    return [];
  }, [placeholder, children]);

  const isLooping = items.length > 1;
  const loopItems = useMemo(
    () => items.map((item) => (typeof item === "string" ? item : "")),
    [items],
  );
  const { currentItem, key } = useLoop(loopItems);

  if (!isLooping && items.length === 1) {
    return <div className={cn("min-h-lh text-ink-tertiary leading-6", className)}>{items[0]}</div>;
  }

  if (!isLooping && items.length === 0) return null;

  return (
    <div className="pointer-events-none flex min-h-lh">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={key}
          initial={{ opacity: 0, y: "100%", filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: "-100%", filter: "blur(4px)" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={cn("text-ink-tertiary font-book leading-6", className)}
        >
          {typeof items[0] === "string" ? currentItem : items[key % items.length]}
        </m.span>
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ContextWindow / Actions / Submit
// ---------------------------------------------------------------------------

type ComposerContextWindowProps = ComponentProps<typeof ComposerPrimitive.ContextWindow>;

const ComposerContextWindow = ({ className, ...props }: ComposerContextWindowProps) => (
  <ComposerPrimitive.ContextWindow
    className={cn(
      "flex items-center gap-3 overflow-hidden px-3 font-medium text-ink-body text-xs transition-[height,opacity] duration-200",
      // The tray's top row: 34px when there is context, collapsed when not.
      "h-0 opacity-0 data-open:h-[34px] data-open:opacity-100",
      className,
    )}
    {...props}
  />
);

const ComposerActions = ({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.Actions>) => (
  <ComposerPrimitive.Actions
    className={cn("flex h-12 items-center justify-end gap-1 px-1.5", className)}
    {...props}
  />
);

type ComposerSubmitProps = ComponentProps<typeof IconButton> & {
  // While generating, the button morphs into a stop control: the send glyph
  // cross-fades to a stop square, the type flips to "button", and clicking it
  // (or pressing Escape) calls onStop instead of submitting the form.
  isGenerating?: boolean;
  onStop?: () => void;
};

const ComposerSubmit = ({
  children,
  className,
  disabled,
  isGenerating = false,
  onStop,
  onClick,
  ...props
}: ComposerSubmitProps) => {
  const submit = useComposerSubmit({ isGenerating, onStop, disabled });

  return (
    <IconButton
      type={submit.type}
      variant="accent"
      size="sm"
      data-slot="composer-submit"
      data-generating={isGenerating ? "" : undefined}
      aria-label={isGenerating ? "Stop generating" : "Send message"}
      className={cn("rounded-full", className)}
      disabled={submit.disabled}
      onClick={isGenerating ? () => onStop?.() : onClick}
      {...props}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={isGenerating ? "stop" : "send"}
          initial={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center"
        >
          {isGenerating ? <Stop /> : (children ?? <ArrowUp />)}
        </m.span>
      </AnimatePresence>
    </IconButton>
  );
};

// ---------------------------------------------------------------------------
// Panel — a floating surface card above the input. `anchor` runs it through the
// shared collision-aware positioner (portaled, matched to the Container width,
// flipping/shifting/sizing near a viewport edge) instead of a plain absolute box.
// The primitive owns the Base UI open/close lifecycle: it stays mounted through
// its exit and exposes data-open/data-closed + data-starting-style/data-ending-style
// (plus data-side from the positioner), keeping the last content mounted while it
// animates out. So this is pure CSS — no AnimatePresence: the card fades/slides
// from data-starting-style on open and to data-ending-style on close, from whichever
// side it resolved to, and the primitive unmounts once the transition finishes.
// ---------------------------------------------------------------------------

type ComposerPanelProps = Omit<ComponentProps<typeof ComposerPrimitive.Panel>, "render">;

const ComposerPanel = ({ className, ...props }: ComposerPanelProps) => (
  <ComposerPrimitive.Panel
    sideOffset={8}
    {...props}
    className={cn(
      // absolute is the base positioning context (the positioner writes left/top in page
      // coordinates); portaled to the body, so it never reserves layout in the composer.
      // Match the composer Container's width via the positioner's --anchor-width var.
      "absolute z-50 w-(--anchor-width) overflow-hidden",
      "rounded-xl bg-primary-bg shadow-composer",
      "transition-[opacity,transform] duration-150 ease-out",
      "data-starting-style:opacity-0 data-ending-style:opacity-0",
      // Slide from the anchored edge: default (above) drops in from below; flipped
      // below the input, it rises in from above.
      "data-[side=top]:data-starting-style:translate-y-1.5 data-[side=top]:data-ending-style:translate-y-1.5",
      "data-[side=bottom]:data-starting-style:-translate-y-1.5 data-[side=bottom]:data-ending-style:-translate-y-1.5",
      className,
    )}
  />
);

// ---------------------------------------------------------------------------
// Popover — the floating alternative to a Panel. Takes the same command-list
// children but lifts them into a portal above the field, anchored to the active
// command badge. Content-driven like Panel (no `open` prop): the primitive opens
// while it has children, and exposes data-open/data-closed for the enter/exit
// animation below — the same content-driven open state ContextWindow uses.
// ---------------------------------------------------------------------------

type ComposerPopoverProps = ComponentProps<typeof ComposerPrimitive.Popover>;

const ComposerPopover = ({ className, ...props }: ComposerPopoverProps) => {
  return (
    <ComposerPrimitive.Popover
      className={cn(
        // Floating shell — same material as the in-flow panel, scaled down and lifted
        // off the anchor token with a stronger shadow. `absolute` is the base positioning
        // context (the positioner then writes left/top in page coordinates); z-50 keeps
        // the portaled popover above the thread.
        "absolute z-50 w-72 overflow-hidden rounded-xl bg-primary-bg shadow-composer",
        "transition-[opacity,transform,filter] duration-150 ease-out",
        "data-closed:opacity-0 data-closed:blur-[3px]",
        // Slide from the anchored edge — opens upward by default, downward when flipped.
        "data-[side=top]:data-closed:translate-y-1.5 data-[side=bottom]:data-closed:-translate-y-1.5",
        className,
      )}
      {...props}
    />
  );
};

// ---------------------------------------------------------------------------
// Command family
// ---------------------------------------------------------------------------

type ComposerCommandProps = ComponentProps<typeof ComposerPrimitive.Command>;

const ComposerCommand = ({ className, ...props }: ComposerCommandProps) => (
  <ComposerPrimitive.Command
    className={cn(
      // Pure content — the host (a Panel card or the Popover) supplies the surface
      // material and positioning; this is just the scrollable list. Height caps at
      // 16rem, or the positioner's available space near a viewport edge, whichever is
      // smaller (the var falls back to 16rem when unset, e.g. an in-flow panel).
      "group/composer-command-list flex max-h-[min(16rem,var(--anchor-available-height,16rem))] flex-col overflow-y-auto p-1 scroll-py-1",
      className,
    )}
    {...props}
  />
);

type ComposerCommandListProps<Item extends CommandItemDataPrimitive> = {
  className?: string;
  children: (item: Item) => ReactNode;
};

const ComposerCommandList = <Item extends CommandItemDataPrimitive = CommandItemData>({
  className,
  children,
}: ComposerCommandListProps<Item>): ReactNode => (
  <ComposerPrimitive.CommandList
    className={cn("flex flex-col", "group-data-empty/composer-command-list:hidden", className)}
  >
    {children}
  </ComposerPrimitive.CommandList>
);

const ComposerCommandLoading = ({
  className,
  children = "Loading…",
  ...props
}: ComponentProps<typeof ComposerPrimitive.CommandLoading>) => (
  <ComposerPrimitive.CommandLoading
    className={cn(
      "hidden group-data-loading/composer-command-list:flex",
      "items-center px-3 h-8 text-sm text-ink-tertiary",
      className,
    )}
    {...props}
  >
    {children}
  </ComposerPrimitive.CommandLoading>
);

const ComposerCommandEmpty = ({
  className,
  children = "No results found",
  ...props
}: ComponentProps<typeof ComposerPrimitive.CommandEmpty>) => (
  <ComposerPrimitive.CommandEmpty
    className={cn(
      "hidden group-data-empty/composer-command-list:flex",
      // Shown only when nothing matches, where it acts as the single highlighted
      // option whose selection dismisses — so it carries the highlight styling.
      "items-center gap-2 rounded-lg bg-ink-primary/5 px-3 h-8 text-sm text-ink-primary",
      className,
    )}
    {...props}
  >
    {children}
  </ComposerPrimitive.CommandEmpty>
);

const ComposerCommandDismiss = ({
  className,
  children = "Dismiss",
  ...props
}: ComponentProps<typeof ComposerPrimitive.CommandDismiss>) => (
  <ComposerPrimitive.CommandDismiss
    className={cn("cursor-pointer text-ink-tertiary hover:text-ink-primary", className)}
    {...props}
  >
    {children}
  </ComposerPrimitive.CommandDismiss>
);

type ComposerCommandItemProps = ComponentProps<typeof ComposerPrimitive.CommandItem>;

const ComposerCommandItem = ({ className, ...props }: ComposerCommandItemProps) => (
  <ComposerPrimitive.CommandItem
    className={cn(
      // Radius is the surface's 12px (rounded-xl) minus its 4px padding, so the
      // highlight corner stays concentric with it.
      "flex w-full items-center rounded-lg gap-2.5 px-2.5 h-8 text-sm font-book text-ink-primary cursor-pointer data-highlighted:bg-ink-primary/5",
      className,
    )}
    {...props}
  />
);

const ComposerCommandItemIcon = ({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.CommandItemIcon>) => (
  <ComposerPrimitive.CommandItemIcon
    className={cn(
      "inline-flex size-4 items-center justify-center text-ink-tertiary [&>svg]:size-4",
      className,
    )}
    {...props}
  />
);

const ComposerCommandItemLabel = ({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.CommandItemLabel>) => (
  <ComposerPrimitive.CommandItemLabel
    className={cn("min-w-0 truncate text-sm font-book", className)}
    {...props}
  />
);

const ComposerCommandItemDescription = ({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.CommandItemDescription>) => (
  <ComposerPrimitive.CommandItemDescription
    className={cn("text-xs text-ink-tertiary truncate", className)}
    {...props}
  />
);

const ComposerCommandGroup = ComposerPrimitive.CommandGroup;

const ComposerCommandGroupLabel = ({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.CommandGroupLabel>) => (
  <ComposerPrimitive.CommandGroupLabel
    className={cn("px-2.5 pt-2 pb-1 text-xs font-medium text-ink-secondary", className)}
    {...props}
  />
);

// Commands — the whole command-list shape for one prefix in a single part:
// loading/empty states plus items rendered as icon + label + optional
// description (the shape every prefix shares). Drop `<Composer.Commands
// prefix="@" />` into a Panel/Popover instead of hand-rolling the Command
// tree per prefix; reach for the lower-level parts only when a prefix needs
// bespoke item markup.
type ComposerCommandsProps = {
  prefix: string;
  className?: string;
};

const ComposerCommands = ({ prefix }: ComposerCommandsProps) => (
  <ComposerCommand prefix={prefix}>
    <ComposerCommandLoading />
    <ComposerCommandEmpty />
    <ComposerCommandList>
      {(item) => (
        <ComposerCommandItem value={item.value}>
          {item.icon && <ComposerCommandItemIcon>{CHIP_ICONS[item.icon]}</ComposerCommandItemIcon>}
          <ComposerCommandItemLabel>{item.label}</ComposerCommandItemLabel>
          {item.description && (
            <ComposerCommandItemDescription>{item.description}</ComposerCommandItemDescription>
          )}
        </ComposerCommandItem>
      )}
    </ComposerCommandList>
  </ComposerCommand>
);

// ---------------------------------------------------------------------------
// Question — default render for the question flow armed by the `questions`
// prop on Composer Root.
// ---------------------------------------------------------------------------

const questionNavigationButtonClasses =
  "flex size-6 cursor-pointer items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-accent-bg/60 disabled:pointer-events-none disabled:opacity-30";

// Decorative selection indicator: a check for multi-select, the option's
// 1-based index for single-select. The Option itself carries the radio or
// checkbox role and checked state, so this is aria-hidden and never focusable:
// a nested control is invalid inside role=radio and breaks the key scoping.
const QuestionOptionIndicator = () => {
  const options = useQuestionOptions();
  const option = useQuestionOption();
  const index = options.items.current.indexOf(option.value) + 1;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] bg-raised font-medium text-[10px] text-ink-secondary tabular-nums shadow-raised",
        option.selected && "bg-accent-raised text-white shadow-accent",
      )}
    >
      {options.multiSelect ? option.selected && <Check className="size-3" /> : index}
    </span>
  );
};

const ComposerQuestion = () => {
  const questions = useComposer((composer) => composer.questions);

  // Content only. The consumer gates the enclosing Panel on `questions.active`;
  // this renders the current question, or null when there are none. `display`
  // keeps the last question on screen through an exit animation.
  const question = questions.items?.[questions.step] ?? null;
  const lastQuestionRef = useRef(question);
  if (question) lastQuestionRef.current = question;
  const display = question ?? lastQuestionRef.current;

  if (!display) return null;

  const draft = questions.drafts.get(questions.step) ?? {
    selected: new Set<string>(),
    buffer: null,
  };

  const totalQuestions = questions.items?.length ?? 0;

  return (
    <ComposerPrimitive.Question data-slot="composer-question" className="flex flex-col gap-2 p-2">
      <ComposerPrimitive.QuestionHeader
        data-slot="composer-question-header"
        className="flex h-7 items-center gap-2"
      >
        <ComposerPrimitive.QuestionLabel
          data-slot="composer-question-label"
          className="min-w-0 flex-1 px-2 font-medium text-sm leading-tight"
        >
          {display.label}
        </ComposerPrimitive.QuestionLabel>
        {!questions.isSingle && totalQuestions > 1 && (
          <ComposerPrimitive.QuestionNavigation
            data-slot="composer-question-navigation"
            className="flex shrink-0 items-center gap-1"
          >
            <ComposerPrimitive.QuestionPrevious
              data-slot="composer-question-previous"
              onClick={questions.goBack}
              disabled={questions.step === 0}
              className={questionNavigationButtonClasses}
            >
              <ChevronLeft className="size-3.5" />
            </ComposerPrimitive.QuestionPrevious>
            <ComposerPrimitive.QuestionStepLabel
              data-slot="composer-question-step-label"
              className="text-2xs text-ink-tertiary tabular-nums"
            >
              {({ current, total }) => `${current} of ${total} questions`}
            </ComposerPrimitive.QuestionStepLabel>
            <ComposerPrimitive.QuestionNext
              data-slot="composer-question-next"
              onClick={questions.goNext}
              disabled={questions.step === totalQuestions - 1}
              className={questionNavigationButtonClasses}
            >
              <ChevronRight className="size-3.5" />
            </ComposerPrimitive.QuestionNext>
          </ComposerPrimitive.QuestionNavigation>
        )}
      </ComposerPrimitive.QuestionHeader>
      {display.options && (
        <ComposerPrimitive.QuestionOptions
          data-slot="composer-question-options"
          ref={questions.optionsRef}
          multiSelect={!!display.multiSelect}
          groupName={`q-${questions.step}`}
          className="flex flex-col gap-1.5"
        >
          {display.options.map((option) => {
            // One identity for key, value, lookup and toggle — so a supplied
            // `value` is what the answer carries.
            const optionValue = option.value ?? option.label;
            return (
              <ComposerPrimitive.QuestionOption
                key={optionValue}
                data-slot="composer-question-option"
                value={optionValue}
                selected={draft.selected.has(optionValue)}
                onSelect={() => questions.toggleOption(optionValue)}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg p-2 leading-tight transition-colors",
                  "data-highlighted:bg-ink-primary/5",
                  // Options carry real focus (roving tabindex), but focus always
                  // tracks the highlight — the highlight wash IS the focus
                  // indication, same as command items. No extra ring.
                  "outline-none",
                )}
              >
                <QuestionOptionIndicator />
                <ComposerPrimitive.QuestionOptionContent
                  data-slot="composer-question-option-content"
                  className="flex min-w-0 flex-1 flex-col gap-1"
                >
                  <ComposerPrimitive.QuestionOptionLabel
                    data-slot="composer-question-option-label"
                    className="text-sm leading-tight"
                  >
                    {option.label}
                  </ComposerPrimitive.QuestionOptionLabel>
                  {option.description && (
                    <ComposerPrimitive.QuestionOptionDescription
                      data-slot="composer-question-option-description"
                      className="text-ink-secondary text-xs leading-tight"
                    >
                      {option.description}
                    </ComposerPrimitive.QuestionOptionDescription>
                  )}
                </ComposerPrimitive.QuestionOptionContent>
              </ComposerPrimitive.QuestionOption>
            );
          })}
        </ComposerPrimitive.QuestionOptions>
      )}
    </ComposerPrimitive.Question>
  );
};

const ComposerQuestionHints = ({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.QuestionHints>) => {
  const questions = useComposer((composer) => composer.questions);
  const totalQuestions = questions.items?.length ?? 0;

  return (
    <ComposerPrimitive.QuestionHints
      data-slot="composer-question-hints"
      className={cn(
        "flex flex-1 items-center gap-3 px-2 pt-1 text-2xs text-ink-tertiary",
        className,
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        <Kbd size="sm">↑</Kbd>
        <Kbd size="sm">↓</Kbd> navigate
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd size="sm">↵</Kbd> select
      </span>
      {!questions.isSingle && totalQuestions > 1 && (
        <span className="inline-flex items-center gap-1">
          <Kbd size="sm">←</Kbd>
          <Kbd size="sm">→</Kbd> between questions
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Kbd size="sm">esc</Kbd> skip
      </span>
    </ComposerPrimitive.QuestionHints>
  );
};

type ComposerQuestionDismissProps = ComponentProps<typeof Button>;

const ComposerQuestionDismiss = ({ className, ...props }: ComposerQuestionDismissProps) => {
  const questions = useComposer((composer) => composer.questions);
  return (
    <Button
      type="button"
      variant="ghost"
      data-slot="composer-question-dismiss"
      className={cn("gap-2", className)}
      onClick={questions.dismissStep}
      {...props}
    >
      Dismiss
    </Button>
  );
};

type ComposerQuestionContinueProps = ComponentProps<typeof Button>;

const ComposerQuestionContinue = ({ className, ...props }: ComposerQuestionContinueProps) => {
  const questions = useComposer((composer) => composer.questions);
  return (
    <Button
      type="submit"
      variant="tertiary"
      data-slot="composer-question-continue"
      className={cn("gap-2", className)}
      {...props}
    >
      {questions.isLastStep ? "Submit" : "Continue"}
    </Button>
  );
};

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------

export const Composer = Object.assign(ComposerRoot, {
  createStore: ComposerPrimitive.createStore,
  Container: ComposerContainer,
  Attachments: ComposerAttachments,
  AttachmentTrigger: ComposerAttachmentTrigger,
  ContextWindow: ComposerContextWindow,
  Actions: ComposerActions,
  Placeholder: ComposerPlaceholder,
  Submit: ComposerSubmit,
  Panel: ComposerPanel,
  Popover: ComposerPopover,
  Textarea: ComposerTextarea,
  Question: ComposerQuestion,
  QuestionHints: ComposerQuestionHints,
  QuestionDismiss: ComposerQuestionDismiss,
  QuestionContinue: ComposerQuestionContinue,
  Commands: ComposerCommands,
  Command: ComposerCommand,
  CommandList: ComposerCommandList,
  CommandLoading: ComposerCommandLoading,
  CommandEmpty: ComposerCommandEmpty,
  CommandDismiss: ComposerCommandDismiss,
  CommandItem: ComposerCommandItem,
  CommandItemIcon: ComposerCommandItemIcon,
  CommandItemLabel: ComposerCommandItemLabel,
  CommandItemDescription: ComposerCommandItemDescription,
  CommandGroup: ComposerCommandGroup,
  CommandGroupLabel: ComposerCommandGroupLabel,
});
