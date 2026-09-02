# Dumb Components, and one Container at the edge of each Feature

The Vue layer could keep letting every component reach `window.api` directly — 63 call sites across 14 components today — or it could pass an opaque `callbacks` object down the tree, which is what three levels of the sidebar currently do. We do neither: a **Dumb Component** may import from `vue` and `shared/ui` and nothing else, and exactly **one Container per Feature** — the one the outside world mounts — imports the service layer and turns the emits coming up the tree into calls.

The alternative shapes were considered and rejected. `provide/inject` of an application context would make every Feature declare its dependencies, but `window.api` is an Electron singleton, not a variability worth modelling. Passing dependencies as props all the way from the shell would push tens of props through `AppLayout`. Letting each Container import what it needs is the status quo under a new folder name.

The rule exists to make a Feature **movable**: the folder is dropped elsewhere and works, because everything crossing its boundary is either a prop coming in or an emit going out, resolved at one known door.

## Consequences

"Dumb" is checkable, not a matter of taste: a `node:test` reads every file under `features/*/components/` and fails on an import of a store or a service, or on any occurrence of `window.`. The repo already asserts invariants by reading files this way — the ten style tests do exactly that. ESLint would express the rule more naturally, but the repo has no ESLint at all; when one is added, the rule moves there and the test goes away.

The single-door rule is about imports, not about instances. Feature stores stay module singletons rather than factories: this app mounts one sidebar and one viewer, so a factory would buy nothing and cost an indirection on every access. Movable means "the folder can be moved", not "the Feature can be mounted twice".

Naming carries the distinction so it survives a file listing: `SessionList.vue` next to `SessionListContainer.vue`, `Sb`-prefixed for anything in `shared/ui`. The prefix already exists on `SbButton`, `SbSwitch` and `SbDialog`.

A Dumb Component never invents a CSS class. It receives the class it must render as a prop, because `public/style.css` is global, frozen for the duration of this work, and asserted by ten tests. This makes the split verifiable as a no-op at the DOM level, and it defers every styling question to a later, separate CSS refactor.
