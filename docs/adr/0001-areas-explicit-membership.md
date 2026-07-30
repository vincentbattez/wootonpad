# Area membership is explicit, never derived from the filesystem

Projects are not user-authored records: they are derived from a scan of `~/.claude/projects/<encoded-path>/`, so a Project can appear or vanish on its own. Areas group Projects into a user-defined tree, and membership is stored as an explicit assignment (`projectPath` → Area) rather than inferred from a path prefix such as `~/lab/norauto/`.

## Considered Options

A path-prefix rule would auto-file whole directories at once, and the existing project layout is prefix-shaped (`lab/norauto/*`, `lab/raredrop-studio/*`). It was rejected because the Area tree is semantic, not structural: an Area like `RAR Drop Studio → Commerce` has no counterpart on disk, so manual assignment would be needed anyway — and a resolution engine (most-specific-prefix wins, conflicting rules, re-evaluation on every scan) would sit on top of it for no added reach.

## Consequences

Assignments outlive the scan: when a Project disappears (repo deleted, renamed, moved, or hidden via `hiddenProjects`), its assignment row is kept, so the Project returns to its Area if the same path reappears. Orphan rows are expected and harmless. Newly scanned Projects always start unassigned and sit flat at the sidebar root.

A future "file every project under this directory here" action stays compatible: it performs bulk explicit assignment and does not reintroduce derived membership.
