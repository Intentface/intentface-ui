// Part names for the `Composer` namespace. Deliberately carries no
// "use client" directive: this module and index.ts must stay server-resolvable
// so a React Server Component can reach Composer.Root and its siblings through
// them. Each part module carries the directive itself.
export {
  ComposerActions as Actions,
  ComposerContextWindow as ContextWindow,
  ComposerSubmit as Submit,
} from "./actions";
export {
  ComposerAttachments as Attachments,
  ComposerAttachmentTrigger as AttachmentTrigger,
} from "./attachments";
export {
  ComposerCommand as Command,
  ComposerCommandDismiss as CommandDismiss,
  ComposerCommandEmpty as CommandEmpty,
  ComposerCommandGroup as CommandGroup,
  ComposerCommandGroupLabel as CommandGroupLabel,
  ComposerCommandItem as CommandItem,
  ComposerCommandItemDescription as CommandItemDescription,
  ComposerCommandItemIcon as CommandItemIcon,
  ComposerCommandItemLabel as CommandItemLabel,
  ComposerCommandList as CommandList,
  ComposerCommandLoading as CommandLoading,
} from "./command-list";
export { ComposerContainer as Container } from "./container";
export { ComposerPanel as Panel } from "./panel";
export { ComposerPopover as Popover } from "./popover";
export { ComposerRoot as Root } from "./root";
/** Create a standalone store handle: `<Composer.Root store={…}>` + `useComposerStore(store, selector)` + `store.controller` for imperative access. */
export { createComposerStore as createStore } from "./store";
export { ComposerTextarea as Textarea } from "./textarea";
