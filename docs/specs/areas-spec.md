# VIN-75 — Group projects into Areas in the sidebar

Design record: [`docs/areas-design.md`](../areas-design.md), [ADR 0001](../adr/0001-areas-explicit-membership.md), [ADR 0002](../adr/0002-areas-in-dedicated-tables.md). Glossary in [`CONTEXT.md`](../../CONTEXT.md).

Linear: https://linear.app/vincentbattez/issue/VIN-75/group-projects-into-areas-in-the-sidebar

## Problem Statement

I work on several unrelated things at once. My sidebar lists every Project I have ever opened as one flat list — client work (Norauto), my own company (RAR Drop Studio), my portfolio and its satellites, plus a long tail of throwaway folders from Downloads. Nothing tells me which Project belongs to which of my worlds, and nothing lets me put a whole world away when I am not working on it. The only thing I can collapse is a single Project at a time, and that collapse is forgotten as soon as I restart the app, so every launch starts with the same wall of unrelated Projects.

## Solution

A new level above Project in the sidebar: the **Area**. An Area is a container I create, name freely, and give a custom image. I drag Projects into it, and I can drag Areas into other Areas to any depth — `RAR Drop Studio → Commerce → the projects`. An Area collapses like a Project does, but its collapsed state is remembered between launches, so putting a world away is a one-time gesture.

Projects I have not filed stay exactly where they are today: flat, at the top level, underneath the Areas. Nothing is forced on me — before I create my first Area, the sidebar looks unchanged.

## User Stories

 1. As a developer juggling several clients, I want to group my Projects into named Areas, so that the sidebar reflects the way I actually think about my work.
 2. As a developer, I want to name an Area whatever I like, so that it can carry a client name, a company name, or a theme that exists nowhere on my disk.
 3. As a developer, I want to give an Area a custom image, so that I can recognise it at a glance without reading.
 4. As a developer, I want to drop an image file from my desktop onto an Area, so that setting its image takes one gesture.
 5. As a developer, I want an Area without an image to show generated initials and colour, so that it is identifiable from the moment I create it.
 6. As a developer, I want my Area image to survive me deleting or moving the original file, so that my sidebar never degrades on its own.
 7. As a developer, I want to collapse an Area, so that a whole world of Projects disappears when I am not working on it.
 8. As a developer, I want an Area's collapsed state remembered across restarts, so that I set up my sidebar once instead of every morning.
 9. As a developer, I want to nest an Area inside another Area to any depth, so that `RAR Drop Studio → Commerce` works the same way as folders do.
10. As a developer, I want an Area to hold sub-Areas and Projects side by side, so that I am not forced to invent a sub-Area for a Project that belongs directly to its parent.
11. As a developer, I want to create an Area from a single "+ Area" button, so that there is one obvious way to start.
12. As a developer, I want to name a new Area inline right after creating it, so that creation is a single uninterrupted gesture.
13. As a developer, I want to drag a Project onto an Area, so that filing it is direct manipulation rather than a form.
14. As a developer, I want to drag a Project to the sidebar root, so that I can take it out of its Area.
15. As a developer, I want to drag an Area into another Area, so that I can restructure my hierarchy after the fact.
16. As a developer, I want a drop that lands on a Session, a Slug header or a Worktree header to resolve to the nearest enclosing Area, so that I do not have to aim precisely in a dense tree.
17. As a developer, I want a drop of an Area into its own descendant to be refused, so that I cannot corrupt my hierarchy into a cycle.
18. As a developer, I want a Project to live in exactly one Area, so that I always know where to look for it.
19. As a developer, I want sub-Areas listed before Projects at every level, so that an Area never gets buried mid-list by an inactive week.
20. As a developer, I want to order my Areas by hand, so that they stay in the same place and I can aim at them from memory.
21. As a developer, I want the Projects inside an Area to stay sorted by recency, so that inside a world the question "what did I touch last?" is still answered.
22. As a developer, I want to delete an Area without losing anything, so that reorganising is never destructive.
23. As a developer, I want the contents of a deleted Area to move up one level, so that its sub-Areas and Projects survive as siblings of what contained them.
24. As a developer, I want no confirmation prompt when deleting an Area, so that a reversible action does not interrupt me.
25. As a developer, I want my filing to survive a Project vanishing from disk, so that a rename, a move or a temporary hide does not silently destroy my organisation.
26. As a developer, I want a Project to return to its Area if its path reappears, so that restoring a repo restores my sidebar.
27. As a developer, I want a newly discovered Project to arrive unfiled, so that nothing is guessed on my behalf.
28. As a developer, I want unfiled Projects flat at the top level under the Areas, so that adopting Areas changes nothing until I decide to file something.
29. As a developer, I want an Area with no visible Project to stay on screen in normal view, so that my structure and my drop targets are stable.
30. As a developer searching, I want Areas with no matching descendant to be hidden, so that my results are not buried in empty containers.
31. As a developer searching, I want a collapsed Area holding a match to open automatically, so that search never hides its own results.
32. As a developer, I want that automatic opening to be temporary, so that clearing the search restores the sidebar exactly as I had arranged it.
33. As a developer, I want typing an Area's name to match it, so that I can jump to a whole world the way I already jump to a Project.
34. As a developer, I want an Area matched by name to reveal its whole subtree, so that the match is immediately useful.
35. As a developer, I want the existing filters (starred, running, today, archived) to keep working inside Areas, so that the new level costs me none of the old behaviour.
36. As a developer, I want Worktrees to keep appearing nested inside their Project, so that Areas add a level without disturbing the ones below.
37. As a developer, I want the card view left untouched, so that I keep a flat, sortable index alongside the structured sidebar.
38. As a developer, I want Project collapse to stop defaulting to "everything collapsed", so that the sidebar opens showing what is actually alive.
39. As a developer, I want to rename an Area after creating it, so that my structure can follow a client renaming or a change of mind.
40. As a developer, I want to clear an Area's image, so that I can go back to initials without deleting and recreating the Area.
41. As a developer, I want to name two Areas the same under different parents, so that `Commerce` can exist inside more than one world.
42. As a developer, I want to drop a Project on the empty space below the sidebar list, so that unfiling something has an obvious target.

## Implementation Decisions

### Domain model

* An Area is a pure container: it holds sub-Areas and Projects, and is never itself a Project. Projects are always leaves.
* Nesting is unlimited. Mixed content (sub-Areas and Projects in the same Area) is allowed at every level.
* A Project belongs to at most one Area; an Area to at most one parent Area.
* Membership is explicit and never derived from the filesystem path (ADR 0001). Projects are scan-derived and volatile; assignments are user-authored and durable.
* An assignment whose Project is absent from the current scan is kept, not purged. Orphan assignments are expected.

### Schema

A new migration appends three tables (ADR 0002):

* `areas` — identity, name, parent Area (nullable = root), position within its parent, collapsed flag.
* `project_area` — assignment keyed by project path, referencing an Area. One row per filed Project; no position column, since Projects are ordered by recency.
* `area_avatars` — image BLOB plus mime type, keyed by Area, kept out of `areas` so that reading the tree never carries image bytes. Mirrors `project_avatars`.

`project_avatars` is deliberately not generalised into a polymorphic avatar table.

Deleting an Area re-parents its children to its own parent (or to the root) in the same transaction; nothing cascades.

### Modules

* **New pure module,** `src/vue/area-tree.mjs` — the single home for all Area logic, free of I/O, DOM and Electron. It exposes:
  * `buildSidebarTree({ areas, assignments, projects, filters })` → the ordered tree to render, with per-node computed expansion and visibility.
  * `resolveDrop({ tree, draggedId, targetId })` → the resulting parent Area id, `null` for the root, or a rejection for a cycle.
  * `removeArea(areas, assignments, areaId)` → the state after one-level promotion.

  The `.mjs` extension is required: the package is CommonJS while `src/vue/` is ESM consumed by Vite, and the extension lets `node --test` import it without touching the build. Both halves were verified with a throwaway stub before writing this spec — `npm test` discovers an `.mjs` test file with no configuration change, and the Vite lib build resolves an `.mjs` import from `src/vue/` as-is.
* **Sidebar rendering** — consumes `buildSidebarTree` and renders Area nodes recursively, the way Worktrees are already rendered recursively inside Projects. Area nodes carry the drag handlers; the existing Project, Slug and Session rendering is unchanged below them.
* **Area avatar rendering** — generalises the existing project avatar component (data URL fetched once, cached in the store, initials-and-colour fallback) to also serve Areas.
* **Main process** — thin CRUD over the three tables, exposed as new IPC channels declared in the preload bridge: list the Area tree, create, rename, set image, clear image, move (with the cycle guard re-checked server-side), set collapsed, delete. Image import resizes to ~128px before storing.
* **Card view** — untouched. It builds its own flat list and does not read the Area tree, so scoping Areas to the sidebar requires no opt-out code.

### Ordering and visibility

* At every level, including the root: sub-Areas first in manual order, then Projects sorted by session recency as today.
* Position is relative to the parent. An Area dropped into a new parent is appended after that parent's existing sub-Areas; there is no precise between-rows insertion indicator in this version.
* Collapse becomes a computed value — `filter active ? expanded : persisted` — rather than the component-local mutable state used today. This is what makes search reveal matches without overwriting the user's arrangement, and it is the same change that fixes the dead auto-collapse logic for Projects.
* Under an active search or filter, an Area with no visible descendant is hidden. In normal view it stays visible, even when empty.
* Search matches Area names in addition to Project names, mirroring the existing project-name match: the Area is shown expanded with its whole subtree.

### Drag and drop

| Dragged | Dropped on | Result |
| -- | -- | -- |
| Project | Area | joins the Area |
| Project | root | leaves its Area |
| Area | Area | becomes a sub-Area, appended last |
| Area | root | becomes a root Area |
| Area | its own descendant | rejected |
| Project | Project | resolves to the nearest Area ancestor |
| anything | Session / Slug header / Worktree header | resolves to the nearest Area ancestor |

A drop always resolves upward to the nearest enclosing Area rather than being rejected — in a dense tree, non-target rows are most of the surface. When a row has no Area ancestor — an unfiled Project and everything under it — the resolution lands on the root, which is the same as unfiling. The root drop zone is the empty space below the sidebar list. Image files dropped from the OS onto an Area set its image, reusing the file-drop pattern already used by the terminal.

### Editing an Area

Renaming and image editing happen in a small Area dialog opened from the Area header, following the overlay pattern already used for new-session, resume and add-project. It carries the name field, an image drop zone with preview, a clear-image action and a delete action. Inline naming at creation is a shortcut, not the only path: an Area can always be renamed later from this dialog. Area names are free-form and not unique — two sub-Areas named `Commerce` under different parents are valid and must not be rejected.

### Bug fixed in passing

The Project collapse initialiser currently stores a function in a ref and never invokes it, so the value is always truthy and every Project starts collapsed — the auto-collapse-stale logic is dead. Moving collapse to a computed value fixes this. Consequence to expect: after the fix only stale Projects start collapsed, which is a visible change to the daily sidebar.

## Testing Decisions

A good test here observes only external behaviour: given a set of Areas, assignments, Projects and a filter state, assert the tree that comes out. No test may reach into internals, mount a component, touch SQLite, or start Electron.

**Prior art**: `test/folder-index-state.test.js` and `test/project-collapse.test.mjs` — small pure modules exercised through their exported functions with `node:test` and `node:assert/strict`, black-box. Areas follow the same shape.

**One seam, the highest available**: `src/vue/area-tree.mjs`, tested from `test/area-tree.test.mjs`. All the decision-bearing logic lives there, so a single seam covers the feature. Cases to cover:

* ordering: sub-Areas before Projects at root and at depth; manual Area order respected; Projects by recency inside an Area
* nesting: arbitrary depth; mixed content; unfiled Projects flat at the root under the Areas
* visibility: empty Area visible in normal view, hidden under filter/search
* collapse: persisted state honoured in normal view, ignored under filter, restored after
* search: Project match reveals its ancestors; Area-name match reveals the whole subtree
* drops: into an Area, to the root, Area into Area, resolution to the nearest Area ancestor from a Session / Slug / Worktree / Project row, cycle rejection, self-drop
* deletion: one-level promotion of both sub-Areas and Projects; deleting a root Area
* orphans: an assignment pointing at an absent Project does not appear and does not throw

**Deliberately not covered**, with no new seam introduced: the SQLite CRUD and the migration (no prior art, and the database is opened at import time, so making it testable would mean refactoring database startup), and the Vue components and DOM drag handlers (no component-test infrastructure in the repo; once the decisions are extracted into `area-tree.mjs`, what remains is wiring).

## Out of Scope

* Areas in the card view. If wanted later, the natural addition there is an Area *filter*, not a nested tree — a tree would conflict with its global sort.
* Multi-Area membership, and tags. A Project lives in one Area; cross-cutting labelling is a different concept for a different day.
* Path-derived membership, including any "everything under `~/lab/norauto/` belongs to Norauto" rule (ADR 0001). A future bulk "file every Project under this directory here" action would perform explicit assignment, not install a rule.
* Emoji as an alternative to the custom image.
* Persisting the collapsed state of Projects. Only Areas persist it.
* A precise insertion indicator between two rows while dragging; Areas are appended last in their new parent.
* Degressive indentation for very deep trees. If the 340px sidebar becomes cramped past four levels, that is a visual fix, not a change to the model.

## Further Notes

The Project list is derived from a scan, not from a user-owned table. This is the constraint that shapes the whole feature: Projects appear and disappear on their own, so the durable data is the Area tree and the assignments, and every rule above about orphans, empty Areas and unfiled Projects follows from it.

At the time of writing the author has 42 scanned Projects, with `lab/norauto/*` (6), `lab/raredrop-studio/*` (3) and a long tail of throwaway folders — a realistic size for manual filing, and the reason the initial filing session is a one-off rather than a chore.
