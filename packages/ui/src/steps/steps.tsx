"use client";

// Headless steps timeline — a recursive disclosure tree. Every node is the
// same part (Item = a Collapsible; Trigger/Panel scope to the nearest Item by
// nesting), so timelines nest arbitrarily: a panel can contain further items.
// State surfaces as data attributes only: data-status per item, data-open /
// data-closed from the disclosure, and data-nested on items that sit inside
// another item (for rail/connector styling; sibling facts are CSS's job via
// :last-child / :only-child). Icons, connectors, markdown, and all classes
// belong to the styled layer; tool derivation belongs to the app layer.

import { type ComponentProps, type CSSProperties, createContext, use } from "react";
import { Collapsible } from "../internal/collapsible";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";

// Visually-hidden-but-announced (screen-reader-only) default for Steps.Status.
const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

// ---------------------------------------------------------------------------
// Root — a plain container. A collapse-everything timeline is just a
// top-level Item the consumer (or the styled layer) opts into.
// ---------------------------------------------------------------------------

export type StepsRootProps = PrimitiveProps<"div">;

/**
 * The timeline container. Ships the disclosure and status plumbing and no row
 * content: what a tool call or a reasoning step looks like is yours.
 * Renders a `<div>` element.
 */
export const StepsRoot = ({ className, render, style, ...elementProps }: StepsRootProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-steps": "" }, elementProps] },
  );

StepsRoot.displayName = "Steps";

// ---------------------------------------------------------------------------
// Item — one disclosure node. Presence-nested: items inside another item
// carry data-nested.
// ---------------------------------------------------------------------------

// True inside any Item, so deeper items can surface data-nested.
const NestedContext = createContext(false);

// Status inherited by Icon / Label from the nearest Item.
const StepStatusContext = createContext<StepStatus | null>(null);

// Opaque status string — the consumer owns the concrete set (commonly
// "complete" | "active" | "pending"). Surfaced as data-status for styling.
export type StepStatus = string;

const useStepStatus = (status?: StepStatus): StepStatus => {
  const inherited = use(StepStatusContext);
  return status ?? inherited ?? "complete";
};

export type StepsItemProps = ComponentProps<typeof Collapsible> & {
  status?: StepStatus;
};

/**
 * One node of the tree, and the unit that nests: an item's panel may hold
 * further items, so a timeline goes as deep as the run did. Publishes its
 * `status` to the icon and label through context.
 * Renders a `<div>` element, with `aria-current="step"` while `status` is
 * `"active"`.
 */
export const StepsItem = ({ status = "complete", defaultOpen, ...props }: StepsItemProps) => {
  const isNested = use(NestedContext);

  return (
    <NestedContext value={true}>
      <StepStatusContext value={status}>
        <Collapsible
          defaultOpen={defaultOpen ?? status === "active"}
          // The package already privileges "active" (defaultOpen above), so
          // marking it as the current step is the same contract, not new copy.
          aria-current={status === "active" ? "step" : undefined}
          data-steps-item=""
          data-status={status}
          data-nested={isNested || undefined}
          {...props}
        />
      </StepStatusContext>
    </NestedContext>
  );
};

StepsItem.displayName = "StepsItem";

export type StepsTriggerProps = ComponentProps<typeof Collapsible.Trigger>;

/**
 * The row that expands an item. A real button, so the tree is plain sequential
 * tab order rather than a composite widget with its own keyboard model.
 * Renders a `<button>` element.
 */
export const StepsTrigger = (props: StepsTriggerProps) => (
  <Collapsible.Trigger data-steps-trigger="" {...props} />
);

StepsTrigger.displayName = "StepsTrigger";

export type StepsPanelProps = ComponentProps<typeof Collapsible.Panel>;

/**
 * The collapsible body. Publishes its measured height while a transition runs
 * and releases it once settled open, so an open panel grows with content that
 * arrives inside it.
 * Renders a `<div>` element.
 */
export const StepsPanel = (props: StepsPanelProps) => (
  <Collapsible.Panel data-steps-panel="" {...props} />
);

StepsPanel.displayName = "StepsPanel";

// ---------------------------------------------------------------------------
// Icon / Label — timeline row parts. Status comes from an optional prop or
// the nearest Item ancestor.
// ---------------------------------------------------------------------------

export type StepsIconProps = PrimitiveProps<"span", { status: StepStatus }> & {
  status?: StepStatus;
};

/**
 * The row's status glyph, `aria-hidden` because colour and shape announce
 * nothing. Resolves `status` from its own prop, then the enclosing item.
 * Renders a `<span>` element.
 */
export const StepsIcon = ({
  status,
  className,
  render,
  style,
  ...elementProps
}: StepsIconProps) => {
  const resolvedStatus = useStepStatus(status);

  return useRenderElement(
    "span",
    { className, render, style },
    {
      state: { status: resolvedStatus },
      props: [{ "data-steps-icon": "", "aria-hidden": true }, elementProps],
    },
  );
};

StepsIcon.displayName = "StepsIcon";

export type StepsLabelProps = PrimitiveProps<"span", { status: StepStatus }> & {
  status?: StepStatus;
};

/**
 * The row's text. Resolves `status` the same way the icon does, so one
 * attribute drives both.
 * Renders a `<span>` element.
 */
export const StepsLabel = ({
  status,
  className,
  render,
  style,
  ...elementProps
}: StepsLabelProps) => {
  const resolvedStatus = useStepStatus(status);

  return useRenderElement(
    "span",
    { className, render, style },
    {
      state: { status: resolvedStatus },
      props: [{ "data-steps-label": "" }, elementProps],
    },
  );
};

StepsLabel.displayName = "StepsLabel";

// ---------------------------------------------------------------------------
// Status — visually-hidden status announcement. The icon is aria-hidden and
// color never reaches AT, so this part speaks the row's status. Renders the
// resolved status string by default; pass children for localized copy.
// ---------------------------------------------------------------------------

export type StepsStatusProps = PrimitiveProps<"span", { status: StepStatus }> & {
  status?: StepStatus;
};

/**
 * The only part that speaks the status. Renders a visually hidden span saying
 * the resolved status string; pass `children` to localise the wording.
 * Renders a `<span>` element.
 */
export const StepsStatus = ({
  status,
  children,
  className,
  render,
  style,
  ...elementProps
}: StepsStatusProps) => {
  const resolvedStatus = useStepStatus(status);

  return useRenderElement(
    "span",
    { className, render, style },
    {
      state: { status: resolvedStatus },
      props: [
        {
          "data-steps-status": "",
          style: visuallyHiddenStyle,
          children: children ?? resolvedStatus,
        },
        elementProps,
      ],
    },
  );
};

StepsStatus.displayName = "StepsStatus";

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------
