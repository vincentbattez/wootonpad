# Split the Vue front into Features, Pages and Dumb Components

Tracker: VIN-107 — https://linear.app/vincentbattez/issue/VIN-107/atomise-the-vue-front-into-features-pages-and-views
Second pass, after the shipped VIN-92.

## Problem Statement

The renderer's Vue layer is 27 components in one flat folder, 6246 lines, with no boundary
between presentation and behaviour, and no boundary between one screen and the next. As the
developer maintaining WootonPad, this costs on every change:

- **Nothing is reusable.** The same context menu is re-implemented three times (Project row,
  Area row, sidebar filter menu), inline rename four times (Project, Area, Session, Account),
  Area drag-and-drop three times, avatar loading four times. A fix to one is a fix to one.
- **Nothing is movable.** `SessionItem` renders its six action buttons inline, so a Session
  row cannot appear in a grid card without dragging the sidebar's assumptions along.
- **Nothing is testable.** The JSONL viewer holds ~500 lines of HTML-string assembly and the
  Stats panel holds the whole heatmap/streak computation, both trapped inside `.vue` files
  where `node:test` cannot reach them.
- **Nothing is locatable.** The Project Viewer is one 869-line file mixing the Git Snapshot,
  the file tree, the diff overlay, the avatar, the Sessions list and the stats refresh.
- **Every component reaches out globally.** 63 direct `window.api.*` call-sites across 14
  components, plus `window.__sb.*` handed down as `callbacks` prop objects through three
  levels of nesting.

The deepest cause is the bridge shape. `public/app.js` pushes state *into* components
imperatively — `window.vuePlans.setPlans(list)` resolves a template ref and calls a method that
writes the component's private state. As long as each panel owns its own data, no panel can be
a Dumb Component, because it is the endpoint of the data flow rather than a receiver of props.

## Solution

Reorganise the Vue layer by Feature, split every screen out into a Page or a View, and split
presentation from behaviour inside each Feature — down to the individual action button.

- **Dumb Components** take props and emit events. No store, no service, no `window.*`.
  ([ADR 0008](../adr/0008-dumb-components-and-one-container-per-feature-edge.md))
- **One Container per Feature** — the one the outside mounts — imports the service layer;
  inner Containers receive what they need as props.
- **Pages** occupy the sidebar column, **Views** occupy the main surface. Both only assemble.
  ([ADR 0009](../adr/0009-pages-and-views-split-by-surface.md))
- **Each Feature owns its Bridge** to the frozen legacy renderer.
  ([ADR 0010](../adr/0010-each-feature-declares-its-own-legacy-bridge.md))
- **Shared primitives compose through slots**, not through prop lists.
  ([ADR 0011](../adr/0011-compound-components-over-prop-heavy-primitives.md))

The user-visible behaviour of the app does not change at all, and neither does the DOM.

## User Stories

1. As a developer, I want to move a Feature folder elsewhere and have it still work, so that
   its boundary is real rather than aspirational.
2. As a developer fixing the context menu, I want one composable and one component, so that the
   fix lands everywhere instead of in one of three copies.
3. As a developer, I want the Fork Session button to be its own component, used by a
   `SessionActions` component, used by `SessionItem`, so that each level can change alone.
4. As a developer, I want an item component and a list component always separated, so that a
   Session row can be rendered in a sidebar, a grid card, or in isolation.
5. As a developer reading a component, I want its imports to tell me whether it has side
   effects, so that a component importing nothing but Vue is provably safe to reuse.
6. As a developer, I want a test to fail when a Dumb Component imports a store or touches
   `window.`, so that the rule survives six months.
7. As a developer looking for the code behind a screen, I want a `pages/` or `views/` file that
   names it, so that I find it without grepping.
8. As a developer working on the JSONL viewer, I want its rendering in a pure module, so that I
   can assert on the produced markup with `node:test`.
9. As a developer working on Stats, I want the daily map, heatmap cells, chart columns and
   streak computation in a pure module, so that I can test the maths against fixed inputs.
10. As a developer adding a setting, I want a single settings-field component encoding the
    "inherit from global / override per Project" pattern, so that I add one entry instead of
    repeating the same markup a thirtieth time.
11. As a developer adding a dialog, I want it in its own Feature, so that I stop editing a
    file holding five unrelated dialogs.
12. As a developer refactoring a panel, I want it to receive data from a store rather than from
    an imperative setter, so that I can render it in isolation with fixed data.
13. As a developer, I want `public/app.js` untouched, so that the blast radius stays inside
    `src/vue/`.
14. As a developer, I want the bridge surface asserted by a test, so that a rename is caught by
    CI rather than by a blank panel at runtime.
15. As a developer, I want characterization end-to-end tests written before the refactor
    starts, so that "no behaviour changed" is proved rather than claimed.
16. As a developer, I want one Feature migrated end to end first, so that the shape is
    validated before it is replicated eleven times.
17. As a developer, I want each step independently mergeable, so that the work can be paused
    without leaving the tree half-migrated.
18. As a developer, I want the icons out of the component files, so that reading a row is not
    scrolling past SVG path data.
19. As a developer, I want the `callbacks` prop objects gone, so that a component's contract is
    its props and its emits.
20. As a developer, I want the CSS class names preserved exactly, so that the global stylesheet
    and its ten style tests keep passing without edits.
21. As a developer, I want the glossary's vocabulary in folder and file names, so that `areas`,
    `projects`, `sessions` and `slugs` mean what CONTEXT.md says they mean.
22. As a developer, I want a new Feature's home to be obvious, so that the next panel lands in a
    folder rather than at the root of `components/`.

## Implementation Decisions

### Target layout

Under `src/vue/`:

- `app/` — `AppLayout.vue` (Dumb, slots: sidebar / main / status) and `AppShell.vue`
  (Container), plus the wiring of every Feature Bridge.
- `pages/` — one file per sidebar tab. Assembles Containers, holds no logic.
- `views/` — one file per main surface: JSONL, Project Viewer, Stats, Plan/Memory, Grid.
- `shared/ui/` — `Sb`-prefixed Primitives.
- `shared/composables/` — context menu, inline rename, drop target, flash confirmation,
  debounced search.
- `shared/services/` — one wrapper over `window.api`, one over `window.__sb`.
- `shared/lib/` — icons and formatting helpers.
- `features/<feature>/` — `components/` (Dumb), `containers/`, `composables/`, `store.js`,
  `bridge.js`, pure `.mjs` modules, and their tests colocated.

Twelve Features: `sessions`, `projects`, `areas`, `accounts`, `agent-files` (plans + memory
merged), `stats`, `settings`, `jsonl`, `viewer`, `grid`, `status-bar`, `navigation` (search,
filters, collapse, tabs). `project-viewer` is a View, not a Feature.

Dialogs and popovers move into their Feature; only `SbDialog` and the dialog store stay shared.
`SessionHeader` goes to `sessions`, `AccountDropdown` to `accounts`, `GridCards` to `grid` —
a Teleport is a mounting detail, not ownership.

### Atomicity

A component is split out when it carries a contract nameable in the glossary. The six Session
actions do — `ForkSessionButton`, `StopSessionButton`, `ArchiveSessionButton`,
`ViewMessagesButton`, `LaunchConfigButton`, `PinSessionToggle` — assembled by `SessionActions`,
itself used by `SessionItem`, itself rendered by `SessionList`. The status dot and the meta line
do not, and stay inline. Item and list are always two components.

### Shared vs Feature

A file whose name or props contain a glossary term (Session, Area, Project, Slug) belongs to
its Feature. Everything else is a Primitive. This is the whole rule, and it is deliberately
biased towards a large `shared/ui`.

Primitives: `SbButton`*, `SbIconButton`, `SbSwitch`*, `SbDialog`*, `SbInput`, `SbBadge`,
`SbStatusDot`, `SbSpinner`, `SbEmptyState`, `SbListItem`*, `SbEditableLabel`, `SbContextMenu` +
`SbMenuItem`, `SbAvatar`, `SbTreeNode`*, `SbCollapsibleGroup`, `SbToolbar`,
`SbSegmentedControl` (tabs, `PermissionModeGrid`*), `SbSearchField`, `SbList`. (* already exists
under another name.) No `SbRow` — a six-slot generic row is `SessionItem` in disguise. No
`SbTooltip` — `data-tooltip` is a CSS concern.

`SbList` does nothing but `v-for` and `key`. `ViewerContentApp` splits into a Dumb editor
Primitive and a `viewer` Container holding CodeMirror, file watching and IPC.

### Icons

Strings move to `shared/lib/icons.js`, except the eight icons of the pilot Feature, which
become components under `shared/ui/icons/`. The remaining ~30 follow Feature by Feature, so a
transcription regression is bounded to eight files at a time. `window.ICONS` stays for the
legacy renderer.

### Naming

`SessionList.vue` / `SessionListContainer.vue` / `SessionsPage.vue` / `JsonlView.vue`, and the
`Sb` prefix for everything in `shared/ui`. The `App` suffix is dropped.

### CSS

No component carries a `<style>` block. Class names are preserved verbatim and passed as props;
a Primitive adds none of its own. The CSS refactor is a separate piece of work, and so is
ESLint.

## Testing Decisions

### Primary seam: the existing Playwright end-to-end suite

Characterization specs are written **before** any code moves and must pass unchanged at every
step: tab switching; search and the three mutually exclusive sidebar filters; sidebar rendering
of Areas, Ungrouped Projects, Worktrees, Slugs, Sessions and the archive; opening the Plan,
Agent File, Stats and JSONL viewers; the Settings panel including a per-Project override; the
four dialogs; inline rename on a Project, an Area and a Session.

One further spec asserts the bridge contract from inside the renderer: all 46 methods present
and callable, all 12 store fields present.

### Secondary seam: `node:test`

Already the repo's seam for the Area tree, Session list, avatar and Project staleness modules.
Extended to the newly extracted JSONL rendering and Stats computation modules, and to one new
structural test: every file under `features/*/components/` is read and must not import a store
or a service, nor contain `window.`. `node --test` discovers colocated `*.test.mjs`, so no
script change is needed.

Tests inside the refactor's scope move next to their code; the 22 tests outside it stay in
`test/` until a separate cleanup.

### Seam deliberately not introduced

Component-level mounting with a test-utils library and a DOM shim: a third seam, a new
dependency, coupled to the very props this work reshapes. Storybook likewise — the design-system
discipline is applied without the tool.

### Ordering

1. Characterization specs.
2. Pilot: `sessions`, end to end — atomic components, one Container at the edge, its Bridge, its
   eight icon components, its colocated tests, and the Dumb-import test. Done when the whole
   suite is green and `public/app.js` is unchanged.
3. Review the shape, then the remaining eleven Features, each independently mergeable.
4. `app/`, `pages/` and `views/` last, once the Features they assemble exist.

## Out of Scope

- `public/app.js`, `terminal-manager.js`, `grid-view.js`, `file-panel.js` and the rest of the
  legacy renderer. Frozen.
- The global stylesheet: no class renames, no scoped styles, no visual change.
- A typography layer — it needs utility classes that do not exist yet.
- ESLint, Storybook, TypeScript, and any state-management library.
- `v-show` → `v-if`, and real mount/unmount routing.
- Any change to the main process, IPC channels, the preload bridge, or the database.
- New features or behaviour changes. A bug found during the refactor is reported, not fixed.
- The landing page under `src/landing/`.

## Further Notes

The `window.vueStore` field list and the 46-method bridge surface were enumerated from
`public/app.js`; they are the acceptance surface, and any step that changes one is wrong by
construction.

The absence of scoped styles is load-bearing in both directions: it makes moving `.vue` files
free with respect to the ten style tests, and it makes Dumb Components dependent on global class
names that must survive the split verbatim.

`sessions` is the pilot because it carries the example that motivated the work — the Fork
button — and because everything cross-cutting it needs (rename, context menu, avatar, icon
button) is written once there and reused eleven times after.
