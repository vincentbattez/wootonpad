# Shared primitives compose through slots, not through prop lists

A `shared/ui` primitive can absorb variation two ways: grow a prop for each case, or expose slots and sub-components the caller arranges. We take the second. `SbListItem` and its kin are **Compound Components**: the parent provides a context, the sub-components inject it, and the caller composes them.

A sub-component exists only when it consumes the parent's context. When there is nothing to share, the answer is a named slot — inventing `SessionItemTitle` to place a string is atomisation without a contract. And a sub-component is never used outside its parent: `SbListItemTitle` outside an `SbListItem` is a semantic lie, and the alternative for standalone text is a typography component, not a borrowed sub-component.

The context is injected without a default, and the sub-component throws when it is missing. The violation then fails on first render — visible in the end-to-end suite — rather than being asserted by a test that only proves a line of code exists.

## Consequences

A list is always two components: one that renders an item, one that `v-for`s over items. This holds even where the list does nothing else, because it is the seam that lets the item be rendered anywhere — in a sidebar row, in a grid card, in isolation.

There is no typography layer yet. Every one of its variants would render nothing but the class its caller passed, because `public/style.css` still owns the sizes and colours. It arrives with the CSS refactor, once utility classes exist to back it.

A primitive rendering only passthrough attributes — `SbIconButton` is close to that — is worth having anyway as the accroche point for the styling and accessibility rules that a later CSS pass will attach to every icon button at once. That is a bet on the CSS refactor, and it is the weakest link in this decision.
