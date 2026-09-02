# Each Feature declares its own legacy Bridge

`public/app.js` is frozen. It drives the Vue layer through 16 `window.vue*` objects exposing 46 methods, plus 12 fields written by name on `window.vueStore`. That surface could stay declared in one central module that imports every Feature's store — which is roughly what `src/vue/main.js` does today. Instead, **each Feature exports its own `bridge.js`**, and `app/` only wires them together.

A central bridge is a module that must know every Feature by name, which is precisely what makes a Feature unmovable: the folder can be dropped elsewhere, but half its contract stays behind. Auto-registration on import would remove the wiring at the cost of an import with side effects, which is worse than the wiring it saves.

The Bridge belongs to the Feature because it *is* the Feature's contract with the legacy renderer, exactly as its props and emits are its contract with the Vue tree.

## Consequences

The bridge surface is an acceptance surface: the 46 method names and the 12 field names were enumerated from `public/app.js` and cannot change. A step that renames one is wrong by construction, and the existing `vue-bridge`, `vue-panel-bridges` and `vue-store-slices` tests are what turn a blank panel at runtime into a CI failure.

Bridges write into Feature stores, never into component refs through template refs. This inversion is what lets a panel be a Dumb Component at all: as long as `window.vuePlans.setPlans(list)` lands in a component's private state, that component is the endpoint of the data flow rather than a receiver of props. The sidebar bridge already works this way; this generalises it.

An aggregate object preserving every current field name stays exposed as `window.vueStore`, so slicing the store costs nothing at the boundary.

`window.ICONS` in `public/icons.js` stays alive for the legacy renderer even once the Vue side has its own icon components. The five duplicated icons are the price of the freeze, not an oversight.
