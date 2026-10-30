"use client";

// Headless inline chip. Renders an unstyled <span> flow-surface; how a chip
// looks is the consumer's. Popups are not owned by this layer: a
// Chip.Preview child is captured and handed to `renderWithPreview` so the
// styled layer can compose its own hover-card/popover around the badge.
// Every part supports the Base UI render prop.

import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";

type ChipPreviewProps = { children: ReactNode };

/**
 * Marker child whose content becomes the preview body. Renders nothing inline:
 * `Chip.Root` inspects its children and routes this through
 * `renderWithPreview`, so the package never owns a popup.
 */
export const ChipPreview = (_props: ChipPreviewProps): ReactNode => null;

export type ChipRootProps = PrimitiveProps<"span"> & {
  /**
   * Called when a Chip.Preview child is present. Receives the rendered badge
   * element and the preview content; compose your popup of choice around
   * them. Without it, the preview content is ignored.
   */
  renderWithPreview?: (badge: ReactElement, preview: ReactNode) => ReactNode;
};

/**
 * The inline token surface. Flows with the surrounding text rather than
 * breaking the line box, and lifts a `Chip.Preview` child into whatever
 * surface `renderWithPreview` builds.
 * Renders a `<span>` element.
 */
export const ChipRoot = ({
  renderWithPreview,
  className,
  render,
  style,
  children,
  ...elementProps
}: ChipRootProps) => {
  const childArray = Children.toArray(children);
  const previewChild = childArray.find(
    (child) => isValidElement(child) && child.type === ChipPreview,
  ) as ReactElement<ChipPreviewProps> | undefined;
  const inlineChildren = childArray.filter(
    (child) => !isValidElement(child) || child.type !== ChipPreview,
  );

  const badge = useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "data-chip": "", children: inlineChildren }, elementProps] },
  );

  if (!previewChild || !renderWithPreview) return badge;

  return renderWithPreview(badge, previewChild.props.children);
};

export type ChipIconProps = PrimitiveProps<"span">;

/**
 * Leading inline icon, baseline-aligned to the label and `aria-hidden`, so
 * decoration stays out of the chip's accessible name.
 * Renders a `<span>` element.
 */
export const ChipIcon = ({ className, render, style, ...elementProps }: ChipIconProps) =>
  useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "aria-hidden": true, "data-chip-icon": "" }, elementProps] },
  );

export type ChipLabelProps = PrimitiveProps<"span">;

/**
 * The chip's text, which reads as part of the sentence around it.
 * Renders a `<span>` element.
 */
export const ChipLabel = ({ className, render, style, ...elementProps }: ChipLabelProps) =>
  useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "data-chip-label": "" }, elementProps] },
  );
