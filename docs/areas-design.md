# Areas — sidebar grouping design

Areas let the user group Projects into a named, collapsible tree in the sidebar. See [ADR 0001](./adr/0001-areas-explicit-membership.md) for membership, [ADR 0002](./adr/0002-areas-in-dedicated-tables.md) for storage, and [CONTEXT.md](../CONTEXT.md) for the vocabulary.

## Model

- An Area is a pure container. Projects are always leaves; a Project is never an Area.
- Nesting is unlimited, and an Area may hold sub-Areas and Projects side by side.
- A Project belongs to at most one Area; an Area to at most one parent Area.
- Membership is explicit. New Projects arrive ungrouped.
- Assignments survive a Project disappearing from the scan and apply again if the same path returns.

## Sidebar rendering

Ordering, applied identically at the root and inside every Area:

1. Sub-Areas first, in manual order (position is relative to the parent).
2. Then Projects, sorted by session recency as they are today.

Sessions, Slugs and Worktrees are untouched — Areas only add a level above Project.

An Area with no visible descendant stays visible in normal view, and is hidden while a filter or a search is active (otherwise the results are buried in empty groups).

Collapsed state is persisted per Area. While a filter or search is active the persisted state is ignored and the tree renders expanded down to the matches; clearing the search restores the previous state exactly. Collapsed is therefore a computed value — `filter active ? expanded : persisted` — not local mutable state.

Search matches Area names as well as Project names, mirroring today's project-name match: the Area appears expanded with its whole subtree.

Scope is the sidebar only. The card view (`ProjectsApp.vue`) keeps its own flat list and needs no change.

## Interaction

Creation: a "+ Area" button at the top of the sidebar creates an empty root Area with its name in inline edit. Sub-Areas are made by creating at the root then dragging into the parent — a single creation path.

Drag and drop, in the sidebar:

| Dragged | Dropped on | Result |
|---|---|---|
| Project | Area | joins the Area |
| Project | root | leaves its Area |
| Area | Area | becomes a sub-Area, appended after existing sub-Areas |
| Area | root | becomes a root Area |
| Area | its own descendant | rejected (cycle) |
| Project | Project | resolves to the nearest Area ancestor |
| anything | Session / Slug header / Worktree header | resolves to the nearest Area ancestor |

A drop always resolves to the nearest enclosing Area rather than being rejected — in a dense tree, non-target rows are most of the surface.

Deleting an Area promotes its contents one level: sub-Areas and Projects move to the parent (or to the root). Nothing is cascaded, nothing is lost, so no confirmation is asked.

Editing name and image happens in a small Area dialog opened from the Area header, following the existing overlays in `DialogsApp.vue`.

## Image

The image is dropped from the OS onto the Area — the same drop pattern already used by the terminal. It is resized to ~128px and copied into the database as a BLOB, so the Area keeps its image if the source file moves or is deleted. With no image, an Area shows generated initials and colour, like Projects do.

No emoji option.

## Out of scope for v1

- Areas in the card view — if wanted later, as an Area *filter*, not a nested tree (a tree would fight its global sort).
- Bulk "file every project under this directory here" — would perform explicit assignment, not a path rule.
- Persisting the collapsed state of Projects. The dead auto-collapse logic in `ProjectGroup.vue` is fixed in passing (the `ref(() => {...})` holds a never-invoked function, so every Project currently starts collapsed); after the fix only stale Projects start collapsed, which is a visible change to the sidebar.
