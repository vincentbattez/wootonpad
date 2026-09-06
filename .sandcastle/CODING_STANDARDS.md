# Coding Standards

The reviewer agent loads this file during code review, so a rule written here is enforced without costing tokens during implementation. Rules are project-specific: what is obvious from the code, or already enforced by tooling, does not belong here.

---

Use the vocabulary of `CONTEXT.md` in names, comments, commit messages and test titles — Area, Project, Session, Slug, Worktree, Git Snapshot, Run Terminal, Run Command. The glossary also lists the words to _avoid_ (group, folder, repo, chat, dev server…); a rejected synonym in an identifier is a finding, because two words for one concept is how a domain model rots.

---

Respect the ADRs in `docs/adr/` for the area you touch. They are decisions, not suggestions: code that contradicts one is wrong even when it works. If a change genuinely needs a different decision, it comes with a new ADR, not with a silent exception.

---

A Dumb Component under `src/vue/features/*/components/` imports from `vue` and `shared/ui` and nothing else. No store, no service, no `window.`. Data comes in as props, intent goes out as emits, and exactly one Container per Feature — the one the outside world mounts — resolves them into calls.

```js
// BAD: a component reaching for the Electron singleton
const onOpen = () => window.api.openProject(props.projectPath);

// GOOD: the component states intent, the Container decides
const emit = defineEmits(['open']);
const onOpen = () => emit('open', props.projectPath);
```

---

A Dumb Component never invents a CSS class. It receives the class it must render as a prop. `public/style.css` is global and asserted by the style tests; a class born inside a component is a styling decision escaping the sheet.

---

Each Feature exports its own `bridge.js` for the legacy renderer; `app/` only wires the bridges together. A central module that imports every Feature by name is what makes a Feature unmovable. Bridges write into Feature stores, never into component refs through template refs.

The `window.vue*` method names and `window.vueStore` field names are an acceptance surface enumerated from `public/app.js`, which is frozen. Renaming one is wrong by construction.

---

Shared primitives in `src/vue/shared/ui` compose through slots and sub-components, not through prop lists. A sub-component exists only when it consumes the parent's injected context; when there is nothing to share, the answer is a named slot. The context is injected without a default and the sub-component throws when it is missing, so a misuse fails on first render rather than in a test that only proves a line exists.

Anything in `shared/ui` carries the `Sb` prefix. A Container is named after its component: `SessionList.vue` next to `SessionListContainer.vue`.

---

A **Page** is a panel inside the sidebar column, a **View** is a surface inside `#main`. Both assemble Containers and hold no logic of their own. The boundary test: a screen owns a surface, a Feature owns a piece of the domain — a screen that owns no entity is never a Feature.

---

No raw colour outside the token layer of `public/style.css` — the `:root` blocks up to the "End of Design System Tokens" banner. Everything below references a token, so both modes and the five neutral tones stay exhaustive. The ten style tests read the sheet and enforce this; a change that needs a new colour adds a token, it does not inline a hex.

---

Electron's process split is a security boundary, not a layering convenience. The renderer never gets `ipcRenderer`, `require` or a Node primitive: `preload.js` exposes a named, argument-checked method on `window.api`, and `main.js` answers it in an `ipcMain.handle`. A new capability lands as all three — handler, preload method, caller — in the same change, or it is half a feature.

Anything crossing the bridge is data the renderer could have forged. Validate paths and ids in the main process; never trust a path because the sidebar sent it.

---

Keep new logic out of `main.js`. It is 100 KB and growing, and every module extracted from it (`db.js`, `project-git.js`, `session-cache.js`, `run-command.js`…) is testable precisely because it left. A new concern arrives as its own module with its own test, and `main.js` only wires it to IPC.

---

Modules that decide are pure; modules that touch the world are thin. The decision layer — tree ordering, path derivation, session transitions, parsing — takes plain values and returns plain values, free of I/O, DOM and Electron, so a `node:test` can exercise it directly. Shelling out, reading disk and calling Electron live in the adapter around it.

```js
// BAD: the ordering rule can only be reached through a database and an app window
function renderSidebar() { const rows = db.prepare(...).all(); /* sort, filter, mount */ }

// GOOD: the rule is a function of its inputs, the caller supplies them
export function buildSidebarTree({ areas, assignments, projects, filters }) { … }
```

---

Optional parameters and defaulted options are scrutinised hard — they are a bug factory by omission, and the caller that forgets one gets silence instead of an error. Prefer a required argument, and prefer correctness over backwards compatibility.

---

Follow the module system of the file's neighbourhood: CommonJS `require` in the Electron main process and its modules at the repo root, ESM in `src/vue`. Mixing them in one folder is a finding; `.mjs` is what marks a root-level module as ESM.

---

Public-facing functions crossing a module boundary carry a one-line JSDoc when the name alone doesn't carry the contract. Inside a module, comments explain intent or a non-obvious decision — never paraphrase the code. A comment that restates the line under it is deleted, not kept.

---

## Testing

Tests verify behaviour through public interfaces. Code can change entirely; a test should only break when behaviour did. A test name states _what_ the system does, in domain vocabulary and in full sentences — `'areas render before the ungrouped projects at the root'`, not `'test buildSidebarTree 2'`.

Suite is `node:test` + `node:assert/strict`, one file per module under `test/`, run with `npm test`.

Mock at system boundaries only — the filesystem, git, Electron, time, randomness. Never mock our own modules: if a unit can't be tested without stubbing an internal collaborator, the seam is in the wrong place. `project-git.test.js` next to `project-git-real.test.js` is the shape — the decision logic tested on inputs, the adapter tested against a real repo.

An invariant that a linter would catch is asserted by a test that reads the files, as the style and dumb-component tests do. The repo has no ESLint; until it does, this is where a rule lives.

Write vertical slices: one failing test, one implementation, repeat. Never all tests first — bulk tests verify imagined behaviour and go insensitive to real change. Never refactor while red.

---

## Architecture

Prefer deep modules: a small interface hiding a substantial implementation. Ask of every new export whether the interface can lose a method or a parameter, and whether more of the complexity can move inside.

Be deterministic by default, and reach for an agent, an LLM or a heuristic only on the exception path, scoped to the failure. When a deterministic route exists — a topological sort, a git command, a parse — it is the happy path, and the fallback is what handles the case it can't.
