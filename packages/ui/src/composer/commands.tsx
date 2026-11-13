"use client";

// Command-list structural primitives used internally by the composer's command
// palette (see command-list.tsx). Pure markup with part-attribute hooks — selection
// and keyboard behavior live in the composer's command plumbing; styling belongs
// to the styled layer. Not a public export.

import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";

type CommandsGroupProps = PrimitiveProps<"div">;

const CommandsGroup = ({ className, render, style, ...elementProps }: CommandsGroupProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ role: "group", "data-command-group": "" }, elementProps] },
  );

export type CommandsItemState = {
  /** Present as data-highlighted while keyboard/hover highlighted. */
  highlighted: boolean;
  /** Present as data-disabled while the row is inert. */
  disabled: boolean;
};

export type CommandsItemProps = PrimitiveProps<"button", CommandsItemState> & {
  highlighted?: boolean;
  disabled?: boolean;
};

const CommandsItem = ({
  highlighted = false,
  disabled = false,
  className,
  render,
  style,
  ...elementProps
}: CommandsItemProps) =>
  useRenderElement(
    "button",
    { className, render, style },
    {
      state: { highlighted, disabled },
      // Options, not buttons: keyboard selection stays in the editor
      // (activedescendant pattern), so rows must never be tab stops or
      // announce as "button". Disabled is aria-disabled, never the native
      // attribute — a natively disabled button swallows the mousedown that
      // keeps focus in the editor.
      props: [
        {
          role: "option",
          tabIndex: -1,
          "aria-disabled": disabled || undefined,
          "data-command-item": "",
        },
        elementProps,
      ],
    },
  );

export const Commands = { Group: CommandsGroup, Item: CommandsItem };
