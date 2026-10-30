"use client";

import { Chip as ChipPrimitive } from "@intentface/ui/chip";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import HoverCard from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

// Shared inline text-flow surface for committed chips and the composer's
// active-prefix decoration — one model so both sit on the same baseline/line box.
// `inline` (not inline-flex) so the chip flows as text; `py` is visual only and
// doesn't grow the line box; `box-decoration-clone` keeps padding/bg intact if a
// chip wraps; `leading-[inherit]` so it never inflates the editor's line height.
export const CHIP_SURFACE_CLASS =
  "box-decoration-clone inline rounded bg-ink-primary/6 px-1.5 py-0.5 align-baseline font-book leading-[inherit] whitespace-nowrap text-ink-primary";

const chipVariants = cva(CHIP_SURFACE_CLASS, {
  variants: {
    variant: {
      primary: "",
      accent: "",
      warning: "",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

export type ChipVariant = NonNullable<VariantProps<typeof chipVariants>["variant"]>;

// Inline-block icon with a baseline nudge (not flex/absolute) so it rides the
// text baseline without inflating the line box. Inherits the chip's text color.
const CHIP_ICON_WRAPPER_CLASSES =
  "mr-0.5 inline-block size-3.5 align-[-0.15em] opacity-70 [&>svg]:block [&>svg]:size-3.5";

type ChipRootProps = ComponentProps<typeof ChipPrimitive.Root> & {
  variant?: ChipVariant;
};

const ChipRoot = ({ variant, className, ...props }: ChipRootProps) => (
  <ChipPrimitive.Root
    className={cn(chipVariants({ variant }), className)}
    renderWithPreview={(badge, preview) => (
      <HoverCard>
        <HoverCard.Trigger render={badge} />
        <HoverCard.Content>{preview}</HoverCard.Content>
      </HoverCard>
    )}
    {...props}
  />
);

type ChipIconProps = ComponentProps<typeof ChipPrimitive.Icon>;

const ChipIcon = ({ className, ...props }: ChipIconProps) => (
  <ChipPrimitive.Icon className={cn(CHIP_ICON_WRAPPER_CLASSES, className)} {...props} />
);

export const Chip = Object.assign(ChipRoot, {
  Icon: ChipIcon,
  Label: ChipPrimitive.Label,
  Preview: ChipPrimitive.Preview,
});
