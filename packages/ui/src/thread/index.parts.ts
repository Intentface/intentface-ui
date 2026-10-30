// Part names for the `Thread` namespace. Deliberately carries no
// "use client" directive: this module and index.ts must stay server-resolvable
// so a React Server Component can reach Thread.Root and its siblings
// through them. The directive lives one level down, on thread.tsx.
export {
  ThreadComposer as Composer,
  ThreadContent as Content,
  ThreadPlaceholder as Placeholder,
  ThreadRoot as Root,
  ThreadViewport as Viewport,
} from "./thread";
