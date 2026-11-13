"use client";

// Minimal internal disclosure primitive — replaces the @base-ui/react
// Collapsible dependency for the package's own parts. Trigger toggles, Panel
// hides (or unmounts) its content; state is exposed Base UI-style via
// presence attributes (data-open / data-closed) generated from state, plus
// the animation contract: data-starting-style on the panel's first open
// frame, data-ending-style while its exit animations run (hide/unmount waits
// for them), and the panel's natural height as --panel-height. That value is
// released once the open transition settles, so an open panel falls back to
// `auto` and tracks content that grows underneath it.
// Every part supports the Base UI render prop.

import {
  type CSSProperties,
  createContext,
  use,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PrimitiveProps } from "./primitive-props";
import { type TransitionStatus, useOpenTransition } from "./render/transition";
import { useRenderElement } from "./render/useRenderElement";
import { openStateMapping, transitionStatusMapping } from "./state-mappings";

export type CollapsibleState = {
  open: boolean;
};

type CollapsibleContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  panelId: string;
};

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

const useCollapsible = () => {
  const ctx = use(CollapsibleContext);
  if (!ctx) throw new Error("Collapsible parts must be used within <Collapsible>");
  return ctx;
};

export type CollapsibleRootProps = PrimitiveProps<"div", CollapsibleState> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const CollapsibleRoot = ({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
  render,
  style,
  ...elementProps
}: CollapsibleRootProps) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const panelId = useId();

  const setOpen = useCallback(
    (value: boolean) => {
      if (!isControlled) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange],
  );

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      state: { open },
      stateAttributesMapping: openStateMapping,
      props: elementProps,
    },
  );

  const context = useMemo(() => ({ open, setOpen, panelId }), [open, setOpen, panelId]);
  return <CollapsibleContext value={context}>{element}</CollapsibleContext>;
};

export type CollapsibleTriggerProps = PrimitiveProps<"button", CollapsibleState>;

const CollapsibleTrigger = ({
  className,
  render,
  style,
  ...elementProps
}: CollapsibleTriggerProps) => {
  const { open, setOpen, panelId } = useCollapsible();

  return useRenderElement(
    "button",
    { className, render, style },
    {
      state: { open },
      stateAttributesMapping: openStateMapping,
      props: [
        {
          "aria-expanded": open,
          "aria-controls": panelId,
          // mergeProps runs the consumer's onClick first (rightmost wins), so
          // preventDefault there still cancels the toggle — same contract as
          // the previous inline `if (!event.defaultPrevented)` handler.
          onClick: (event: React.MouseEvent) => {
            if (!event.defaultPrevented) setOpen(!open);
          },
        },
        elementProps,
      ],
    },
  );
};

export type CollapsiblePanelProps = PrimitiveProps<"div", CollapsiblePanelState> & {
  /** Keep the panel in the DOM (hidden) when closed. */
  keepMounted?: boolean;
};

export type CollapsiblePanelState = CollapsibleState & {
  transitionStatus: TransitionStatus;
};

const CollapsiblePanel = ({
  keepMounted = false,
  className,
  render,
  style,
  ...elementProps
}: CollapsiblePanelProps) => {
  const { open, panelId } = useCollapsible();
  const panelRef = useRef<HTMLDivElement | null>(null);
  // The shared transition hook owns the open/starting/ending/close lifecycle: it keeps the
  // panel mounted through its exit (waiting on getAnimations), measures the natural height
  // for the CSS var, and reports the status that drives data-starting/ending-style.
  const { mounted, transitionStatus, height } = useOpenTransition(open, panelRef, {
    measureHeight: true,
  });

  const hidden = !open && !mounted;

  return useRenderElement(
    "div",
    { className, render, style },
    {
      enabled: mounted || keepMounted,
      state: { open, transitionStatus },
      stateAttributesMapping: { ...openStateMapping, ...transitionStatusMapping },
      ref: panelRef,
      props: [
        {
          id: panelId,
          hidden,
          // `initial` rather than unset because custom properties inherit, so a settled panel
          // nested in a moving one would otherwise take that ancestor's height. On an
          // unregistered property `initial` is guaranteed-invalid, so a `height: var(…)`
          // consumer falls back to auto.
          style: {
            "--panel-height": height === null ? "initial" : `${height}px`,
          } as CSSProperties,
        },
        elementProps,
      ],
    },
  );
};

export const Collapsible = Object.assign(CollapsibleRoot, {
  Trigger: CollapsibleTrigger,
  Panel: CollapsiblePanel,
});
