# Areas live in dedicated tables, not in the `settings` blob

Per-project user metadata has two precedents in this codebase: `hiddenProjects` as a key inside the JSON blob `settings['global']`, and `project_avatars` as a table holding an image BLOB. Areas follow the table precedent: `areas` (identity, parent, position, collapsed), `project_area` (assignment), and `area_avatars` (image BLOB + mime type), added as a schema migration.

## Consequences

The `settings` blob is read and rewritten whole on every `setSetting`, so it is the wrong home for images and for the collapsed flag, which is written on every click and would race with unrelated settings writes sharing the `global` key.

The image lives in its own table rather than a column of `areas`, so reading the Area tree never drags BLOBs along — the same reason `project_avatars` is separate. `project_avatars` is deliberately not generalised into a polymorphic avatar table: it would force a data migration of existing rows for no gain.
