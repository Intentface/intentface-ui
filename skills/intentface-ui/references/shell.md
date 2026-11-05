# App shell: Shell, Nav and Tabs

`Shell`, `Nav` and `Tabs` work on their own or around a chat. They position nothing, so the layout is the app's. Each page's Keyboard table lists the keys the parts handle.

## Rules

| Rule | Summary |
|------|---------|
| Inside the root | Every `Shell`, `Nav` and `Tabs` part throws outside its root. |
| Controlled state reports | With a controlled `open`, `expanded`, `value` or `items`, the change callback hands over the new value, and nothing changes until the app passes it back. |
| One store per mount | Create an external store with `useState(() => Shell.createStore())`, and the same for `Nav.createStore` and `Tabs.createStore`. A store at module scope is shared by every mount and every server request. |
| Shell positions nothing | Take `Shell.Sidebar` out of flow, fixed or absolute inside a relative root. Give the content side a gutter element whose width reads `--shell-sidebar-width` and drops to 0 while `data-state="collapsed"`. |
| Sidebar width in CSS | The width and the drag range are the sidebar's `width`, `min-width` and `max-width`. There is no width prop. `--shell-sidebar-width` is unset until the first drag, so give it a default on the root. |
| Opaque sidebar | Content slides under the sidebar, so its background is opaque in every state. Turn transitions off while `data-resizing` is present. |
| Shell shortcut | The grip resizes with the arrow keys. No shortcut to toggle the sidebar ships. Bind one, such as Cmd+B, and call the store's `toggle`. |
| Nav is a div | Render `<Nav.Root render={<nav />} aria-label="Main">`. |
| Nav rows as links | There is no router integration. Compute `active` from the app's router and render rows as its links, through `render`. A render function must spread the props it receives, or keyboard navigation breaks. |
| Nav guides are CSS | The guides only emit attributes. The indent, the rail and the elbows are the app's CSS, and `--nav-depth` gives one indent rule for every level. Never put `overflow: hidden` on a row, because the rail draws outside it. |
| Tabs is a toolbar | `Tabs` is a toolbar of disclosures, not a tablist. `value` may be `null`, which means no tab is open. Without `selectOnClose`, closing the open tab leaves nothing open. |
| Only the open tab renders | `Tabs.Viewport` renders only the open tab. A tab that renders the same component as the last one keeps its instance, with its state, so key the content by the tab, as in `{(id) => <Chat key={id} id={id} />}`. Keep live state, such as a streaming chat, in a store outside the tab. |
| Tabs popup placement | Give `Tabs.Positioner` the `z-index`, and never set its `position`, `left` or `top`. Animate `Tabs.Popup`, and size it from `--anchor-width` and `--anchor-available-height`, which it inherits from the positioner. |

## Shell gutter

```tsx
<Shell.Root defaultOpen className="group/shell fixed inset-0 flex [--shell-sidebar-width:16rem]">
  <div className="w-(--shell-sidebar-width) shrink-0 transition-[width] group-data-resizing/shell:transition-none group-data-[state=collapsed]/shell:w-0" />
  <Shell.Sidebar className="absolute inset-y-0 left-0 w-(--shell-sidebar-width) min-w-48 max-w-80 transition-[left] data-resizing:transition-none data-[state=collapsed]:-left-(--shell-sidebar-width)">
    <Shell.Trigger aria-label="Collapse sidebar">
      <PanelLeftIcon />
    </Shell.Trigger>
    {nav}
  </Shell.Sidebar>
  <Shell.Grip
    aria-label="Resize sidebar"
    className="absolute inset-y-0 left-(--shell-sidebar-width) -translate-x-1/2 data-[state=collapsed]:hidden"
  />
  <Shell.Viewport className="min-w-0 flex-1">{children}</Shell.Viewport>
</Shell.Root>
```

- The gutter is the app's own element. It reserves the sidebar's width in the layout and shrinks to 0 while the sidebar slides out.
- The root gives `--shell-sidebar-width` its default, and the grip overwrites it on every drag, clamped to the sidebar's `min-width` and `max-width`. Those two values are the drag range, and `16rem`, `min-w-48` and `max-w-80` stand for the app's own.
- Every part carries `data-state` and `data-resizing`, so the sidebar and the grip style themselves, and the gutter reads them from the root through a named group.
- The grip is a sibling of the sidebar, so a sidebar that clips its overflow can't cut the handle in half.
- The sidebar's background must be opaque, because the content slides under it.

## Nav rows as router links

```tsx
"use client";

import { Nav } from "@intentface/ui/nav";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const MainNav = () => {
  const pathname = usePathname();

  return (
    <Nav.Root render={<nav />} aria-label="Main">
      <Nav.List>
        <Nav.Item value="home" active={pathname === "/"} render={<Link href="/" />}>
          <Nav.Label>Home</Nav.Label>
        </Nav.Item>
        <Nav.Item value="settings" active={pathname === "/settings"} render={<Link href="/settings" />}>
          <Nav.Label>Settings</Nav.Label>
        </Nav.Item>
      </Nav.List>
    </Nav.Root>
  );
};
```

- The router decides `active`, and the row reflects it as `data-active` and `aria-current="page"`.
- The element form of `render` works in a server component too. This one is a client component because it reads the pathname.
- The row renders the router's `<a>`, so opening it in a new tab and copying its address keep working.
