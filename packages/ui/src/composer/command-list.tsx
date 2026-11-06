"use client";

// Composer.Command family — resolution (sync/async items, fuzzy filter),
// keyboard/mouse selection, chip insertion, dismissal, and the nav/items
// context split (highlight changes don't re-render the items map, and items
// mutations don't re-render every row). All unstyled; state panels as
// data-state / data-highlighted.

import {
  type ComponentProps,
  createContext,
  Fragment,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PrimitiveProps } from "../internal/primitive-props";
import { useRenderElement } from "../internal/render/useRenderElement";
import { scrollIntoViewWithin } from "../internal/scroll-into-view-within";
import { Commands } from "./commands";
import { filterArrayItems, suggestionRemainder } from "./fuzzy";
import { useAsRef, useComposerInternals, useIsomorphicLayoutEffect } from "./internals";
import { useComposer, useComposerContextStore } from "./store";
import type { CommandItemData, ComposerCommandsItems, PrefixOnSelectContext } from "./types";

// ---------------------------------------------------------------------------
// Types & contexts — a two-context split so navigation and item resolution
// re-render independently.
// ---------------------------------------------------------------------------

export type CommandListState = "loading" | "empty" | "ready";

// Nav slice — updates on arrow-key navigation. Consumed by `Composer.CommandItem`.
type CommandListNavContextValue = {
  highlightedValue: string | null;
  setHighlightedValue: (value: string | null) => void;
  selectByValue: (value: string) => void;
  dismiss: () => void;
  // Stable callback ref the highlighted row attaches to: stores nothing, just
  // scrolls itself into view when it becomes the highlight (no effect).
  scrollHighlightedIntoView: (node: HTMLElement | null) => void;
};

const CommandListNavContext = createContext<CommandListNavContextValue | null>(null);

// Items slice — updates on items resolution. Consumed by `Composer.CommandList`.
type CommandListItemsContextValue = {
  items: CommandItemData[];
  state: CommandListState;
};

const CommandListItemsContext = createContext<CommandListItemsContextValue | null>(null);

// ---------------------------------------------------------------------------
// Item resolution — turn the prefix's items config (array or async callback)
// into the current filtered list + loading/empty/ready state.
// ---------------------------------------------------------------------------

const useResolvedItems = (
  itemsProp: ComposerCommandsItems,
  query: string,
  isActive: boolean,
): { items: CommandItemData[]; state: CommandListState } => {
  const isCallback = typeof itemsProp === "function";

  const [asyncState, setAsyncState] = useState<{
    items: CommandItemData[];
    loading: boolean;
  }>(() => ({ items: [], loading: isCallback }));

  useEffect(() => {
    if (typeof itemsProp !== "function") return;
    if (!isActive) return;

    const controller = new AbortController();
    let cancelled = false;

    let result: CommandItemData[] | Promise<CommandItemData[]>;
    try {
      result = itemsProp(query, { signal: controller.signal });
    } catch (error) {
      console.warn("Composer.commands items callback threw:", error);
      setAsyncState({ items: [], loading: false });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    if (result instanceof Promise) {
      setAsyncState((previous) => ({ ...previous, loading: true }));
      result.then(
        (resolved) => {
          if (cancelled) return;
          setAsyncState({ items: resolved, loading: false });
        },
        (error) => {
          if (cancelled) return;
          if ((error as { name?: string })?.name === "AbortError") return;
          console.warn("Composer.commands items callback rejected:", error);
          setAsyncState((previous) => ({ ...previous, loading: false }));
        },
      );
    } else {
      setAsyncState({ items: result, loading: false });
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [itemsProp, query, isActive]);

  if (Array.isArray(itemsProp)) {
    const items = filterArrayItems(itemsProp, query);
    return { items, state: items.length === 0 ? "empty" : "ready" };
  }

  if (asyncState.loading) {
    // Locally filter the most-recent resolved set so typing feels instant
    // while the new fetch is in flight. The server result replaces this once
    // it lands.
    return {
      items: filterArrayItems(asyncState.items, query),
      state: "loading",
    };
  }

  return {
    items: asyncState.items,
    state: asyncState.items.length === 0 ? "empty" : "ready",
  };
};

// ---------------------------------------------------------------------------
// Composer.Command — the orchestrator: resolves items for the active
// prefix, owns the highlight/selection/dismiss logic, and provides the two
// contexts. Renders null unless this prefix is the active one.
// ---------------------------------------------------------------------------

const EMPTY_ITEMS: CommandItemData[] = [];

// Deterministic option-row id shared by the row itself and the editor's
// aria-activedescendant. Values sanitize to valid id tokens.
export const optionDomId = (listboxId: string, value: string): string =>
  `${listboxId}-option-${value.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

// The badge's hint chrome: non-editable so the caret can't enter it, no chip
// id so the reader/mappers treat it as zero-width presentation, aria-hidden
// so screen readers skip the ghost. Styled via its part attribute like any other part.
const createHintElement = (badge: Element): HTMLElement => {
  const hint = badge.ownerDocument.createElement("span");
  hint.setAttribute("data-command-hint", "");
  hint.setAttribute("contenteditable", "false");
  hint.setAttribute("aria-hidden", "true");
  badge.appendChild(hint);
  return hint;
};

export type ComposerCommandState = {
  /** Present as data-loading while an async items callback is in flight. */
  loading: boolean;
  /** Present as data-empty when nothing matches the query. */
  empty: boolean;
};

export type ComposerCommandProps = PrimitiveProps<"div", ComposerCommandState> & {
  prefix: string;
};

export const ComposerCommand = ({
  prefix,
  className,
  render,
  style,
  children,
  ...elementProps
}: ComposerCommandProps) => {
  const store = useComposerContextStore();
  const internals = useComposerInternals();

  // Renders while this prefix is the active one AND through its close animation. `active`
  // flips false the instant the trigger closes, but the store keeps `present` sticky until
  // the Panel's exit animation finishes (finalizePanelClose). `wasActive` marks that this
  // prefix — not a sibling — is the one closing, so only it keeps rendering during the window.
  const isActive = useComposer(
    (composer) => composer.commands.active && composer.commands.trigger === prefix,
  );
  const present = useComposer((composer) => composer.commands.present);
  const query = useComposer((composer) => composer.commands.query);

  // State adjusted during render (not a ref React might keep from a discarded
  // render); it only flips at open and at the end of the close, so it costs a
  // re-render at those two moments and nowhere else.
  const [wasActive, setWasActive] = useState(false);
  if (isActive && !wasActive) setWasActive(true);
  else if (!isActive && !present && wasActive) setWasActive(false);
  const isPresent = isActive || (present && wasActive);

  const config = internals.commands[prefix];
  const itemsProp = config?.items ?? EMPTY_ITEMS;
  const kind = config?.kind ?? "execute";

  // Freeze the last resolved items while closing so the exiting panel shows what it had,
  // not a re-filter/re-fetch against the now-empty query.
  const resolved = useResolvedItems(itemsProp, query, isActive);
  const lastResolvedRef = useRef(resolved);
  if (isActive) lastResolvedRef.current = resolved;
  const { items, state } = isActive ? resolved : lastResolvedRef.current;

  // The highlight index lives in the store (so the editor's keydown handler can
  // move it). It's raw/unbounded; wrap it by the current item count here. The
  // wrap runs over the enabled subset only, so disabled rows render but never
  // take the highlight — arrow keys hop over them for free. An empty list has
  // no highlighted row — the "No results" row stands in as the sole selectable.
  const enabledItems = useMemo(() => items.filter((item) => !item.disabled), [items]);
  const highlightIndex = useComposer((composer) => composer.commands.highlightIndex);
  const activeIndex =
    enabledItems.length > 0
      ? ((highlightIndex % enabledItems.length) + enabledItems.length) % enabledItems.length
      : -1;
  const highlightedItem = enabledItems[activeIndex] ?? null;
  const effectiveHighlight = highlightedItem?.value ?? null;

  // Badge hint — one real element (span[data-command-hint], appended
  // inside the badge) carrying either the ghost-text completion of the
  // highlighted item or the per-prefix empty-query placeholder. One slot, one
  // value: the suggestion wins by a plain ?? chain, so exclusivity is code,
  // not CSS specificity. The reader and position mappers treat non-editable,
  // non-chip elements as zero-width presentation, so the hint never reaches
  // the model. The badge is engine-owned DOM out of JSX reach — same access
  // pattern as the popover's anchor query — so this is a true DOM-integration
  // effect. No deps: badge identity changes on token rewraps, which always
  // coincide with a re-render here (query/highlight subscribed).
  const suggestion =
    isActive && highlightedItem && (config?.suggestion ?? true)
      ? suggestionRemainder(query, highlightedItem.label)
      : null;
  const hintText =
    suggestion ?? (isActive && query === "" ? (config?.placeholder ?? "Type to filter") : null);
  useIsomorphicLayoutEffect(() => {
    const badge = store.editorRef.current?.getRootElement()?.querySelector("[data-command-badge]");
    const existingHint = badge?.querySelector("[data-command-hint]") ?? null;
    if (!badge || !hintText) {
      existingHint?.remove();
      return;
    }
    const hint = existingHint ?? createHintElement(badge);
    if (hint.textContent !== hintText) hint.textContent = hintText;
  });

  // Mirror the highlighted row's DOM id into the store — the editor renders
  // it as aria-activedescendant. This is where the raw highlight index
  // resolves against the actual item list, so the id can only be derived here.
  // Only the ACTIVE command writes: with several Commands mounted, an inactive
  // sibling writing null would ping-pong against the active one's id forever
  // (max-update-depth). Clearing on close is setCommands' job.
  useIsomorphicLayoutEffect(() => {
    if (!isActive) return;
    store.setActiveOptionId(
      highlightedItem ? optionDomId(store.listboxId, highlightedItem.value) : null,
    );
  });

  const selectByValue = useCallback(
    (value: string) => {
      const editor = store.editorRef.current;
      if (!editor) return;
      const item = items.find((candidate) => candidate.value === value);
      if (!item || item.disabled) return;

      if (kind === "insert") {
        editor.insertChipAtTrigger({
          prefix,
          value: item.value,
          label: item.label ?? item.value,
          icon: item.icon,
        });
      } else {
        editor.deleteTrigger();
        // Read the attachment actions lazily at selection time — their
        // identities are store-stable, so subscribing would only re-render the
        // list on unrelated attachment changes.
        const { add, remove, openFileDialog } = store.getSnapshot().attachments;
        const onSelectContext: PrefixOnSelectContext = {
          editor: store.controller,
          attachments: { add, remove, openFileDialog },
        };
        item.onSelect?.(onSelectContext);
      }

      editor.closeCommands();
    },
    [store, items, kind, prefix],
  );

  const dismiss = useCallback(() => {
    store.editorRef.current?.dismissCommands();
  }, [store]);

  // The editor's keydown handler invokes the current selection through
  // commandSelectRef. Keep the latest values in a ref so the callback stays
  // stable, and register it via the root's callback ref (commit-time) — not an
  // effect, not a render-phase assignment.
  const selectState = useAsRef({ effectiveHighlight, selectByValue, dismiss, state });
  const runSelect = useCallback(() => {
    const { effectiveHighlight, selectByValue, dismiss, state } = selectState.current;
    // With a match, select it. When empty, the "No results" row is the sole
    // option and selecting it dismisses — so Tab/Enter aren't dead (Linear-style).
    if (effectiveHighlight) selectByValue(effectiveHighlight);
    else if (state === "empty") dismiss();
  }, []);
  const registerSelect = useCallback(
    (node: HTMLDivElement | null) => {
      store.commandSelectRef.current = node ? runSelect : null;
    },
    [store, runSelect],
  );

  // Scroll the highlighted row into view as it becomes the highlight. Stable, so
  // React calls it only on highlight change — no per-render scroll, no effect.
  // Scoped to the list's own container, the popover or (for an in-flow panel)
  // the composer, so the page behind it never moves; the list alone when it's
  // mounted anywhere else.
  const scrollHighlightedIntoView = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const boundary =
      node.closest("[data-composer-popover], [data-composer-root]") ??
      node.closest("[data-composer-command-list]") ??
      node;
    scrollIntoViewWithin(node, boundary);
  }, []);

  const navContext = useMemo<CommandListNavContextValue>(
    () => ({
      highlightedValue: effectiveHighlight,
      setHighlightedValue: (value) => {
        const index = value === null ? -1 : enabledItems.findIndex((item) => item.value === value);
        if (index >= 0) store.setHighlight(index);
      },
      selectByValue,
      dismiss,
      scrollHighlightedIntoView,
    }),
    [effectiveHighlight, enabledItems, selectByValue, dismiss, scrollHighlightedIntoView, store],
  );

  const itemsContext = useMemo<CommandListItemsContextValue>(
    () => ({ items, state }),
    [items, state],
  );

  const element = useRenderElement(
    "div",
    { className, render, style },
    {
      enabled: isPresent,
      state: { loading: state === "loading", empty: state === "empty" },
      ref: registerSelect,
      props: [{ "data-composer-command-list": "", children }, elementProps],
    },
  );

  if (!isPresent) return null;

  return (
    <CommandListItemsContext value={itemsContext}>
      <CommandListNavContext value={navContext}>{element}</CommandListNavContext>
    </CommandListItemsContext>
  );
};

// ---------------------------------------------------------------------------
// List hooks — the consumer-facing items hook and the internal nav accessor
// the slot primitives read.
// ---------------------------------------------------------------------------

export const useCommandListItems = <Item extends CommandItemData = CommandItemData>(): {
  items: Item[];
  state: CommandListState;
} => {
  const context = use(CommandListItemsContext);
  if (!context) {
    throw new Error("<Composer.CommandList> must be rendered inside <Composer.Command>.");
  }
  return context as { items: Item[]; state: CommandListState };
};

const useCommandListNav = (componentName: string): CommandListNavContextValue => {
  const context = use(CommandListNavContext);
  if (!context) {
    throw new Error(`<Composer.${componentName}> must be rendered inside <Composer.Command>.`);
  }
  return context;
};

// ---------------------------------------------------------------------------
// Slot primitives — unstyled structural parts of the list. Each sets its
// its part attribute and forwards props; the styled layer supplies the look.
// ---------------------------------------------------------------------------

export type ComposerCommandListProps<Item extends CommandItemData> = Omit<
  PrimitiveProps<"div">,
  "children"
> & {
  children: (item: Item) => ReactNode;
};

export const ComposerCommandList = <Item extends CommandItemData>({
  className,
  render,
  style,
  children: renderItem,
  ...elementProps
}: ComposerCommandListProps<Item>): ReactNode => {
  const { items, state } = useCommandListItems<Item>();
  const store = useComposerContextStore();

  return useRenderElement(
    "div",
    { className, render, style },
    {
      props: [
        {
          // The combobox popup: the editor references this element via
          // aria-controls and points aria-activedescendant at its rows.
          role: "listbox",
          id: store.listboxId,
          "aria-label": "Suggestions",
          "aria-busy": state === "loading" || undefined,
          "data-composer-command-items": "",
          children: items.map((item, index) => (
            <Fragment key={item.value ?? `__cmd_${index}`}>{renderItem(item)}</Fragment>
          )),
        },
        elementProps,
      ],
    },
  );
};

export type ComposerCommandLoadingProps = PrimitiveProps<"div">;

export const ComposerCommandLoading = ({
  children,
  className,
  render,
  style,
  ...elementProps
}: ComposerCommandLoadingProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    {
      props: [{ "data-composer-command-loading": "", children }, elementProps],
    },
  );

export type ComposerCommandEmptyProps = PrimitiveProps<"div">;

export const ComposerCommandEmpty = ({
  children,
  className,
  render,
  style,
  ...elementProps
}: ComposerCommandEmptyProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    {
      props: [{ role: "status", "data-composer-command-empty": "", children }, elementProps],
    },
  );

// Dismisses the active token (same as Escape): closes the popup, leaves the
// typed text in place, and keeps it dismissed until the prefix is retyped.
// preventDefault on mousedown so the click never steals focus from the editor.
export type ComposerCommandDismissProps = PrimitiveProps<"button">;

export const ComposerCommandDismiss = ({
  children,
  className,
  render,
  style,
  ...elementProps
}: ComposerCommandDismissProps) => {
  const navContext = useCommandListNav("CommandDismiss");

  return useRenderElement(
    "button",
    { className, render, style },
    {
      props: [
        {
          tabIndex: -1,
          "data-composer-command-dismiss": "",
          onMouseDown: (event: React.MouseEvent) => {
            event.preventDefault();
            navContext.dismiss();
          },
          children,
        },
        elementProps,
      ],
    },
  );
};

export type ComposerCommandItemProps = Omit<
  ComponentProps<typeof Commands.Item>,
  "highlighted" | "disabled"
> & {
  value: string;
};

export const ComposerCommandItem = ({ value, ...props }: ComposerCommandItemProps) => {
  const navContext = useCommandListNav("CommandItem");
  const itemsContext = use(CommandListItemsContext);
  const store = useComposerContextStore();

  const isHighlighted = navContext.highlightedValue === value;
  // Disabled comes from the item data (CommandItemData.disabled) — the same
  // source the nav wrap skips — so the row can never disagree with the
  // keyboard behavior. Not a prop: two writers would let them drift.
  const isDisabled =
    itemsContext?.items.some((item) => item.value === value && item.disabled) ?? false;

  return (
    <Commands.Item
      ref={isHighlighted ? navContext.scrollHighlightedIntoView : undefined}
      id={optionDomId(store.listboxId, value)}
      aria-selected={isHighlighted}
      data-composer-command-item=""
      highlighted={isHighlighted}
      disabled={isDisabled}
      onMouseDown={(event) => {
        // preventDefault even when disabled — the click must never steal
        // focus from the editor.
        event.preventDefault();
        if (!isDisabled) navContext.selectByValue(value);
      }}
      onMouseEnter={isDisabled ? undefined : () => navContext.setHighlightedValue(value)}
      {...props}
    />
  );
};

export type ComposerCommandItemIconProps = PrimitiveProps<"span">;

export const ComposerCommandItemIcon = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerCommandItemIconProps) =>
  useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "data-composer-command-item-icon": "" }, elementProps] },
  );

export type ComposerCommandItemLabelProps = PrimitiveProps<"span">;

export const ComposerCommandItemLabel = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerCommandItemLabelProps) =>
  useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "data-composer-command-item-label": "" }, elementProps] },
  );

export type ComposerCommandItemDescriptionProps = PrimitiveProps<"span">;

export const ComposerCommandItemDescription = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerCommandItemDescriptionProps) =>
  useRenderElement(
    "span",
    { className, render, style },
    { props: [{ "data-composer-command-item-description": "" }, elementProps] },
  );

export type ComposerCommandGroupProps<Item extends CommandItemData = CommandItemData> = {
  /** Bucket the resolved items by this key (defines the app's grouping taxonomy). */
  groupBy: (item: Item) => string;
  /** Render one group: its key + that group's already-filtered items. */
  children: (group: string, items: Item[]) => ReactNode;
};

// Grouping is a render concern: this reads the resolved items, buckets them by `groupBy`
// with `Map.groupBy` (which preserves first-appearance order — Object.groupBy would reorder
// integer-like keys), and renders the child once per group inside a `command-group`
// container. Nav order stays store-driven, so a group whose items all filter out just
// doesn't render. Annotate `groupBy`'s param to type the items (no inline JSX generic).
export const ComposerCommandGroup = <Item extends CommandItemData = CommandItemData>({
  groupBy,
  children: renderGroup,
}: ComposerCommandGroupProps<Item>): ReactNode => {
  const { items } = useCommandListItems<Item>();
  return (
    <>
      {[...Map.groupBy(items, groupBy)].map(([group, groupItems]) => (
        <Commands.Group key={group}>{renderGroup(group, groupItems)}</Commands.Group>
      ))}
    </>
  );
};

export type ComposerCommandGroupLabelProps = PrimitiveProps<"div">;

export const ComposerCommandGroupLabel = ({
  className,
  render,
  style,
  ...elementProps
}: ComposerCommandGroupLabelProps) =>
  useRenderElement(
    "div",
    { className, render, style },
    { props: [{ "data-composer-command-group-label": "" }, elementProps] },
  );
