# Archived Sessions are revealed per Project, not by a global filter

Each Project group owns a pill that reveals its own Archived Sessions. There is no longer a sidebar-wide toggle: `showArchived` is gone from the toolbar, the store, the `get-projects` IPC channel and the cache-to-projects builder, which now always ships Archived Sessions in the payload.

The rejected alternative is the one that was there: **one global filter for the whole sidebar**. It answers the wrong question. A user digging through an archive is asking "what did I set aside in *this* Project", and the global filter forces every other Project to answer too — 631 Archived Sessions surfacing at once to find one. Worse, with the filter off, a Project whose Sessions are all archived disappeared from the sidebar entirely, reachable only by remembering something to search for. Per-Project reveal makes that Project visible again for free: once nothing filters archived rows out of the payload, its Session array is simply non-empty.

Keeping the `showArchived` parameter and ignoring it was also rejected. A parameter that lies, threaded through preload, the IPC handler and the builder, is how the global filter gets reintroduced by accident.

**The archive does not paginate by age.** The main list pages on a combined `count < N && age < cutoff` predicate; reusing it here would leave the archive permanently empty, because an Archived Session is old by definition. The archive therefore pages on count alone, ordered by the Session's `modified` timestamp descending — "the one I was last working on", not "the one I last archived", which is why `session_meta` gains no `archivedAt` column.

## Consequences

The ordering and visibility decision for a Project's whole Session list — both buckets — moved out of `ProjectGroup.vue` into `src/vue/session-list.mjs`, a pure module returning four lists. Extracting the archive alone would have left two seams and let the two buckets' filtering drift apart; this way ~80 lines of previously untested sort-and-page logic sit under `node:test`.

Search now places a matching Archived Session inside its Project's archive, auto-expanded, rather than inline in the main list at full height. One row, one location, regardless of whether the search box is filled.

An Archived Session renders in a compact row — one line, roughly a third the height, hover action reduced to unarchive alone. This is a reversible CSS choice, not an architectural one; the `compact` modifier is deliberately decoupled from the `archived` flag so the density can be reused elsewhere without dragging archive semantics along.

Expansion is component-local and unpersisted, so every archive is collapsed on app start. It is forced open only when a Session that lives in it is the one on screen — a search hit, or the Session open in the pane. The starred, running and today filters do not force it open: every archive in the sidebar unfolding on a filter toggle is the flood this decision removes.

The archive is flat. Slug groups would add an indented container, a header row and their own `+ N more` control, cancelling the compaction the archive exists for.
