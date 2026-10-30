"use client";

import {
  type ThreadAutoScrollMode,
  Thread as ThreadPrimitive,
  type ThreadVisibilityState,
  useThread,
  useThreadVisibility,
} from "@intentface/ui/thread";
import { ArrowDown } from "@keyline-icons/react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import type { ComponentProps } from "react";
import { memo, useCallback } from "react";
import Button from "@/components/ui/button";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { cn } from "@/lib/utils";

export { useThread, useThreadVisibility };
export type { ThreadAutoScrollMode, ThreadVisibilityState };

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export type ThreadRootProps = ComponentProps<typeof ThreadPrimitive.Root>;

const ThreadRoot = ({ className, ...props }: ThreadRootProps) => (
  <ThreadPrimitive.Root
    className={cn(
      "relative flex h-full w-full overflow-hidden [--chat-top-inset:4rem] [--thread-dock-inset:8rem]",
      className,
    )}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

export type ThreadOverlayProps = ComponentProps<typeof ProgressiveBlur> & {
  direction: "top" | "bottom";
};

const OVERLAY_EDGE = {
  top: ["top-0 h-(--chat-top-inset)", "bg-linear-to-b"],
  bottom: ["bottom-0 h-(--thread-dock-inset)", "bg-linear-to-t"],
} as const;

const ThreadOverlay = memo(({ className, direction, ...props }: ThreadOverlayProps) => {
  const [edge, gradient] = OVERLAY_EDGE[direction];

  return (
    <div
      aria-hidden
      data-slot="thread-overlay"
      className={cn(
        "pointer-events-none absolute right-0 left-0 z-1 mx-auto w-full max-w-(--thread-width)",
        edge,
        className,
      )}
    >
      <ProgressiveBlur
        direction={direction}
        className={cn(
          "h-full w-full bg-linear-to-b from-secondary-bg to-transparent pointer-events-none",
          gradient,
        )}
        {...props}
      />
    </div>
  );
});

ThreadOverlay.displayName = "ThreadOverlay";

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

export type ThreadViewportProps = ComponentProps<"div">;

const ThreadViewport = ({ children, className, ...props }: ThreadViewportProps) => (
  <ThreadPrimitive.Viewport className="h-full w-full overflow-y-auto overflow-x-hidden [overflow-anchor:auto] scrollbar-gutter-stable scrollbar-thin [scrollbar-color:var(--color-ink-tertiary)_transparent] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-bg/40">
    <div
      data-slot="thread-viewport"
      className={cn(
        "relative @container/thread-viewport flex w-full min-w-[340px] flex-col items-center",
        "min-h-full",
        "has-data-thread-placeholder:h-full",
        className,
      )}
      {...props}
    >
      <div className="relative flex min-h-full w-full flex-col items-center pt-(--chat-top-inset) pb-(--thread-dock-inset)">
        <ThreadPrimitive.Content className="mx-auto px-4 flex min-h-full w-full max-w-(--thread-width) flex-col gap-4">
          {children}
        </ThreadPrimitive.Content>
      </div>
    </div>
  </ThreadPrimitive.Viewport>
);

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

export type ThreadComposerProps = ComponentProps<"div">;

const ThreadComposer = ({ className, children, ...props }: ThreadComposerProps) => (
  <ThreadPrimitive.Composer
    className={cn("mx-auto w-full z-2 max-w-(--thread-width)", className)}
    {...props}
  >
    <div className="relative flex w-full flex-col items-center px-4 pb-4 @lg/thread-viewport:px-0">
      {children}
    </div>
  </ThreadPrimitive.Composer>
);

// ---------------------------------------------------------------------------
// ScrollButton (arrow to scroll to bottom — no auto-stick). Composed from the
// package's useThread hook so the motion enter/exit stays exactly as designed.
// ---------------------------------------------------------------------------

export type ThreadScrollButtonProps = ComponentProps<typeof m.div>;

const ThreadScrollButton = ({ className, ...props }: ThreadScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useThread();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    <div className="absolute inset-x-0 -top-3 mx-auto flex h-0 w-full justify-center px-4 md:px-0">
      <div className="z-2 flex h-0 w-full max-w-(--thread-width) items-end justify-center">
        <AnimatePresence>
          {!isAtBottom && (
            <m.div
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              {...props}
            >
              <Button variant="primary" size="sm" onClick={handleScrollToBottom}>
                <ArrowDown />
                Latest
              </Button>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Placeholder
// ---------------------------------------------------------------------------

export type ThreadPlaceholderProps = ComponentProps<"div">;

const ThreadPlaceholder = ({ className, ...props }: ThreadPlaceholderProps) => (
  <ThreadPrimitive.Placeholder
    className={cn("flex flex-1 flex-col items-center justify-center gap-4", className)}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------

export const Thread = Object.assign(ThreadRoot, {
  Overlay: ThreadOverlay,
  Viewport: ThreadViewport,
  Composer: ThreadComposer,
  Placeholder: ThreadPlaceholder,
  ScrollButton: ThreadScrollButton,
});
