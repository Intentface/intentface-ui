"use client";

// Headless ask parts — the question flow widget. Owns the option registration system
// (cmdk pattern), highlight state, and the imperative keyboard-navigation
// handle. Input widgets (checkbox/radio), icons, and the answered summary
// belong to the styled layer, which reads state via useQuestionOptions() /
// useQuestionOption(). Every part supports the Base UI render prop.

import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useCallback,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";
import { scrollIntoViewWithin } from "../internal/scroll-into-view-within";
import { useComposer } from "./store";

// Shared ids so Options can label itself from the question label and describe
// itself from the step indicator without any consumer wiring: Root mints both,
// Label/StepLabel stamp them, Options references them.
type QuestionIdsContextValue = { labelId: string; stepLabelId: string };

const QuestionIdsContext = createContext<QuestionIdsContextValue>({ labelId: "", stepLabelId: "" });

/** Ask root container. Stateless — consumers manage all state externally. */
export type ComposerQuestionProps = PrimitiveProps<"div">;

export const ComposerQuestion = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionProps) => {
  const labelId = useId();
  const stepLabelId = useId();
  const element = useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-composer-question": "" }, elementProps] },
  );
  const ids = useMemo(() => ({ labelId, stepLabelId }), [labelId, stepLabelId]);
  return <QuestionIdsContext value={ids}>{element}</QuestionIdsContext>;
};

/** Question label text. Carries the id `Options` uses as its accessible name. */
export type ComposerQuestionLabelProps = PrimitiveProps<"p">;

export const ComposerQuestionLabel = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionLabelProps) => {
  const { labelId } = use(QuestionIdsContext);
  return useRenderElement(
    "p",
    { className, render, style },
    { props: [{ id: labelId || undefined, "data-composer-question-label": "" }, elementProps] },
  );
};

/** Row container for `Label` and optional `Navigation`. */
export type ComposerQuestionHeaderProps = PrimitiveProps<"div">;

export const ComposerQuestionHeader = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionHeaderProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-composer-question-header": "" }, elementProps] },
  );

/** Row container for `Previous`, `StepLabel`, and `Next`. */
export type ComposerQuestionNavigationProps = PrimitiveProps<"div">;

export const ComposerQuestionNavigation = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionNavigationProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-composer-question-navigation": "" }, elementProps] },
  );

/** Navigate to the previous step. Default accessible name; override via aria-label. */
export type ComposerQuestionPreviousProps = PrimitiveProps<"button">;

export const ComposerQuestionPrevious = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionPreviousProps) =>
  useRenderElement(
    "button",
    { className, render, style },
    {
      props: [
        { "aria-label": "Previous question", "data-composer-question-previous": "" },
        elementProps,
      ],
    },
  );

/** Navigate to the next step. Default accessible name; override via aria-label. */
export type ComposerQuestionNextProps = PrimitiveProps<"button">;

export const ComposerQuestionNext = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionNextProps) =>
  useRenderElement(
    "button",
    { className, render, style },
    { props: [{ "aria-label": "Next question", "data-composer-question-next": "" }, elementProps] },
  );

/** Step indicator. Reads the current step + total from the composer store; the
 * consumer supplies the text via `children` — either a node, or a callback
 * receiving `{ current, total }` (1-based current). No default format. */
export type ComposerQuestionStepLabelState = { current: number; total: number };

export type ComposerQuestionStepLabelProps = Omit<PrimitiveProps<"span">, "children"> & {
  children?: ReactNode | ((state: ComposerQuestionStepLabelState) => ReactNode);
};

export const ComposerQuestionStepLabel = ({
  children,
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionStepLabelProps) => {
  const current = useComposer((composer) => composer.questions.step) + 1;
  const total = useComposer((composer) => composer.questions.items?.length ?? 0);
  const { stepLabelId } = use(QuestionIdsContext);
  const content = typeof children === "function" ? children({ current, total }) : children;

  return useRenderElement(
    "span",
    { className, render, style },
    {
      props: [
        {
          id: stepLabelId || undefined,
          "data-composer-question-step-label": "",
          children: content,
        },
        elementProps,
      ],
    },
  );
};

/** Fieldset wrapper for `Option` items. Provides `multiSelect`, `groupName`, and highlight state to child options via context. Items self-register on mount (cmdk pattern). */
type OptionsContextValue = {
  multiSelect: boolean;
  groupName: string;
  highlightedValue: string | null;
  items: RefObject<string[]>;
  register: (value: string, getElement: () => HTMLElement | null) => () => void;
  onItemHover: (value: string) => void;
};

const OptionsContext = createContext<OptionsContextValue>({
  multiSelect: false,
  groupName: "",
  highlightedValue: null,
  items: { current: [] },
  register: () => () => {},
  onItemHover: () => {},
});

export const useQuestionOptions = () => use(OptionsContext);

/** Imperative handle exposed by `Composer.QuestionOptions` for keyboard navigation. */
export type ComposerQuestionOptionsHandle = {
  /** Move highlight by direction, focusing the newly highlighted option (roving tabindex). Returns the new highlighted value (null = past the list boundary). */
  navigate: (direction: number) => string | null;
  select: () => { value: string } | null;
  clearHighlight: () => void;
  resetHighlight: () => void;
  /** Move DOM focus onto the highlighted option (or the first option when none is highlighted). */
  focusHighlighted: () => void;
  /** The options container element — the composer attaches its question-mode keydown handling here. */
  getElement: () => HTMLElement | null;
  highlightedValue: string | null;
};

export type ComposerQuestionOptionsProps = Omit<PrimitiveProps<"fieldset">, "value" | "ref"> & {
  /** When true, options render as multi-select (checkbox semantics in the styled layer). */
  multiSelect?: boolean;
  /** Shared `name` attribute for all option inputs in this group. */
  groupName?: string;
  /** Imperative ref for keyboard navigation (navigate, select, clearHighlight, resetHighlight). */
  ref?: RefObject<ComposerQuestionOptionsHandle | null>;
};

export const ComposerQuestionOptions = ({
  multiSelect = false,
  groupName = "",
  ref,
  className,
  render,
  style,
  children,
  ...elementProps
}: ComposerQuestionOptionsProps) => {
  const registeredItems = useRef<string[]>([]);
  const itemElements = useRef<Map<string, () => HTMLElement | null>>(new Map());
  const containerRef = useRef<HTMLFieldSetElement | null>(null);
  const { labelId, stepLabelId } = use(QuestionIdsContext);
  const [highlightedValue, setHighlightedValue] = useState<string | null>(null);

  // Track highlight in a ref so imperative methods see latest value without re-binding.
  // Mirrored after commit, not during a render React may discard, and in an
  // insertion effect: it runs before every layout effect in the tree, and the
  // options register in theirs, where they may seed the highlight imperatively.
  const highlightedValueRef = useRef(highlightedValue);
  useInsertionEffect(() => {
    highlightedValueRef.current = highlightedValue;
  });

  const register = useCallback((itemValue: string, getElement: () => HTMLElement | null) => {
    registeredItems.current = [...registeredItems.current, itemValue];
    itemElements.current.set(itemValue, getElement);
    // Auto-highlight whenever an item registers while nothing is highlighted.
    // Using length === 1 here is fragile: during a step transition, React can
    // interleave old-item cleanups with new-item setups, so the new first
    // option may arrive when the list is not exactly length 1.
    if (highlightedValueRef.current === null) {
      highlightedValueRef.current = itemValue;
      setHighlightedValue(itemValue);
    }
    return () => {
      registeredItems.current = registeredItems.current.filter((v) => v !== itemValue);
      itemElements.current.delete(itemValue);
      // Clear highlight when the highlighted item deregisters — allows auto-highlight
      // to fire for the next set of items (e.g. on step change)
      if (highlightedValueRef.current === itemValue) {
        highlightedValueRef.current = null;
        setHighlightedValue(null);
      }
    };
  }, []);

  const onItemHover = useCallback((itemValue: string) => {
    setHighlightedValue(itemValue);
  }, []);

  // Roving tabindex: DOM focus follows the highlight for keyboard navigation.
  // Focus without the browser's scroll, which would also move the page around
  // an embedded question; bring the option into view within the question's
  // own scroll area instead.
  const focusValue = useCallback((itemValue: string | null) => {
    if (itemValue === null) return;
    const element = itemElements.current.get(itemValue)?.();
    if (!element) return;
    element.focus({ preventScroll: true });
    const boundary = element.closest("[data-composer-question]") ?? element;
    scrollIntoViewWithin(element.getBoundingClientRect(), element, boundary);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      navigate: (direction: number): string | null => {
        const items = registeredItems.current;
        if (items.length === 0) return null;
        const previous = highlightedValueRef.current;
        let next: string | null;
        if (previous === null) {
          next = (direction > 0 ? items[0] : items[items.length - 1]) ?? null;
        } else {
          const currentIndex = items.indexOf(previous);
          const nextIndex = currentIndex + direction;
          if (nextIndex >= items.length || nextIndex < 0) next = null;
          else next = items[nextIndex] ?? null;
        }
        highlightedValueRef.current = next;
        setHighlightedValue(next);
        focusValue(next);
        return next;
      },
      select: () => {
        const current = highlightedValueRef.current;
        if (current === null) return null;
        return { value: current };
      },
      clearHighlight: () => {
        highlightedValueRef.current = null;
        setHighlightedValue(null);
      },
      resetHighlight: () => {
        // Clear synchronously — the auto-highlight path in `register` will pick
        // up the first new item when it mounts after a step change.
        highlightedValueRef.current = null;
        setHighlightedValue(null);
      },
      focusHighlighted: () => {
        const target = highlightedValueRef.current ?? registeredItems.current[0] ?? null;
        if (target !== null && highlightedValueRef.current === null) {
          highlightedValueRef.current = target;
          setHighlightedValue(target);
        }
        focusValue(target);
      },
      getElement: () => containerRef.current,
      get highlightedValue() {
        return highlightedValueRef.current;
      },
    }),
    [focusValue],
  );

  const element = useRenderElement(
    "fieldset",
    { className, render, style },
    {
      ref: containerRef,
      props: [
        {
          // The options are the real selectable controls (role radio/checkbox
          // on each option), so the container is their labelled group.
          role: multiSelect ? "group" : "radiogroup",
          "aria-labelledby": labelId || undefined,
          "aria-describedby": stepLabelId || undefined,
          "data-composer-question-options": "",
          children,
        },
        elementProps,
      ],
    },
  );

  const options = useMemo(
    () => ({
      multiSelect,
      groupName,
      highlightedValue,
      items: registeredItems,
      register,
      onItemHover,
    }),
    [multiSelect, groupName, highlightedValue, register, onItemHover],
  );

  return <OptionsContext value={options}>{element}</OptionsContext>;
};

/** Selectable card. Self-registers with parent `Options` on mount (cmdk pattern). Derives highlight state from context. */
type OptionContextValue = {
  id: string;
  value: string;
  selected: boolean;
  onSelect?: () => void;
};

const OptionContext = createContext<OptionContextValue>({
  id: "",
  value: "",
  selected: false,
  onSelect: () => {},
});

export const useQuestionOption = () => use(OptionContext);

export type ComposerQuestionOptionState = {
  /** Present as data-highlighted while keyboard/hover highlighted. */
  highlighted: boolean;
  /** Present as data-selected while the option is selected. */
  selected: boolean;
};

export type ComposerQuestionOptionProps = PrimitiveProps<"label", ComposerQuestionOptionState> & {
  value?: string;
  selected?: boolean;
  onSelect?: () => void;
};

export const ComposerQuestionOption = ({
  value = "",
  selected = false,
  onSelect,
  className,
  render,
  style,
  children,
  ...elementProps
}: ComposerQuestionOptionProps) => {
  const id = useId();
  const { multiSelect, highlightedValue, register, onItemHover } = use(OptionsContext);
  const optionRef = useRef<HTMLLabelElement | null>(null);
  const isHighlighted = value === highlightedValue;

  // Self-register on mount, deregister on unmount (true subscription side effect)
  const registerRef = useRef(register);
  useInsertionEffect(() => {
    registerRef.current = register;
  });
  useItemRegistration(value, registerRef, optionRef);

  const element = useRenderElement(
    "label",
    { className, render, style },
    {
      ref: optionRef,
      state: { highlighted: isHighlighted, selected },
      props: [
        {
          // The option IS the selectable control: role + checked state live
          // here, and the roving tabindex makes the highlighted option the
          // group's single tab stop. Never a native input — the composer's
          // question-mode key scoping treats inputs as foreign editables.
          id,
          role: multiSelect ? "checkbox" : "radio",
          "aria-checked": selected,
          tabIndex: isHighlighted ? 0 : -1,
          "data-composer-question-option": "",
          onMouseMove: () => onItemHover(value),
          // Keep highlight and DOM focus unified when focus arrives by other
          // means (Tab into the group, SR virtual-cursor activation).
          onFocus: () => onItemHover(value),
          // Self-contained click selection. The option itself is the control
          // now, so only a *different* nested interactive element defers —
          // a bare option stays fully clickable.
          onClick: (event: React.MouseEvent<HTMLLabelElement>) => {
            const nested = (event.target as HTMLElement).closest(
              "input,button,[role=checkbox],[role=radio]",
            );
            if (nested && nested !== event.currentTarget) return;
            event.preventDefault();
            onSelect?.();
          },
          children,
        },
        elementProps,
      ],
    },
  );

  const option = useMemo(
    () => ({ id, value, selected, onSelect }),
    [id, value, selected, onSelect],
  );
  return <OptionContext value={option}>{element}</OptionContext>;
};

/** Registers an item value + element with the parent Options container synchronously before paint and deregisters on unmount. */
const useItemRegistration = (
  value: string,
  registerRef: RefObject<(value: string, getElement: () => HTMLElement | null) => () => void>,
  elementRef: RefObject<HTMLElement | null>,
) => {
  // useLayoutEffect ensures items are registered before paint so the initial highlight resolves immediately
  useLayoutEffect(() => {
    return registerRef.current(value, () => elementRef.current);
  }, [value, registerRef, elementRef]);
};

/** Flex column wrapper for `OptionLabel` and `OptionDescription`. */
export type ComposerQuestionOptionContentProps = PrimitiveProps<"span">;

export const ComposerQuestionOptionContent = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionOptionContentProps) =>
  useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "data-composer-question-option-content": "" }, elementProps] },
  );

/** Option title text. */
export type ComposerQuestionOptionLabelProps = PrimitiveProps<"span">;

export const ComposerQuestionOptionLabel = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionOptionLabelProps) =>
  useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "data-composer-question-option-label": "" }, elementProps] },
  );

/** Option subtitle/description text. */
export type ComposerQuestionOptionDescriptionProps = PrimitiveProps<"span">;

export const ComposerQuestionOptionDescription = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionOptionDescriptionProps) =>
  useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "data-composer-question-option-description": "" }, elementProps] },
  );

/** Keyboard shortcut hints displayed below the ask options. */
export type ComposerQuestionHintsProps = PrimitiveProps<"div">;

export const ComposerQuestionHints = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionHintsProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-composer-question-hints": "" }, elementProps] },
  );

/** Dismiss/skip button. Stateless — wire `onClick` to your dismiss handler. */
export type ComposerQuestionDismissProps = PrimitiveProps<"button">;

export const ComposerQuestionDismiss = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionDismissProps) =>
  useRenderElement(
    "button",
    { className, render, style },
    { props: [{ type: "button" as const, "data-composer-question-dismiss": "" }, elementProps] },
  );

/** Continue button: continues the current step through `questions.continueStep`. A plain button, not a form submit, so a click after the answers went out never sends the message. */
export type ComposerQuestionContinueProps = PrimitiveProps<"button">;

export const ComposerQuestionContinue = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerQuestionContinueProps) => {
  const continueStep = useComposer((composer) => composer.questions.continueStep);
  return useRenderElement(
    "button",
    { className, render, style },
    {
      props: [
        {
          type: "button" as const,
          "data-composer-question-continue": "",
          onClick: () => continueStep(),
        },
        elementProps,
      ],
    },
  );
};
