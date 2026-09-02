# Pages and Views are split by the surface they occupy

WootonPad has no router: the six sidebar tabs and the six full-screen panels are `v-show` blocks inside one 37 KB `App.vue`. Naming every screen a "page" would flatten two genuinely different things — a **Page** is a panel inside the narrow sidebar column, a **View** is a surface inside `#main`. Both obey the same rule: they assemble Containers and hold no logic of their own.

The split is by surface rather than by feature because the surface is the constraint that actually differs. A Page is authored against a 260 px column and coexists with five siblings kept in the DOM; a View is a full-height overlay whose header, toolbar and scroll behaviour belong to it. Putting `SessionsPage` and `JsonlView` in the same folder would say those two are interchangeable, which no one who has read them believes.

`project-viewer` — 869 lines today — becomes a **View**, not a Feature. It owns no entity: it assembles the Git Snapshot, file tree, avatar and stats Containers that belong to `projects`, `sessions` and `stats`. That is the test for the boundary: a screen owns a surface, a Feature owns a piece of the domain.

## Consequences

`App.vue` disappears, replaced by `AppLayout` — a Dumb Component whose slots are the sidebar, the main surface and the status bar — and `AppShell`, the Container that fills them. The top of the tree then obeys the same rule as the bottom.

The `v-show` blocks and their element IDs survive verbatim. `public/app.js` queries `#sidebar-content`, `#terminals` and `#terminal-header` by ID, and `v-show` is what keeps those nodes alive for it. Switching to `v-if`, or to real mount/unmount, would save memory and trade it against a class of invisible regression; it is a separate, measurable ticket.

`plans` and `memory` merge into one Feature, `agent-files`: they already share `ListItem` and the whole markdown viewer, and they differ only in which folder they read.

A Teleport is a mounting detail, not a claim of ownership. `StatusBar`, `AccountDropdown` and `GridCards` are teleported by the shell into legacy containers, and each still belongs to its own Feature.
