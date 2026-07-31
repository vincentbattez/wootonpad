# VIN-75 — progress

Ordered work plan for `docs/specs/areas-spec.md`. One step per iteration.
Tick a box only once the step is implemented, `npm test` is green, and the work is committed.

VIN-77 already shipped the first slice on `main` (commit `c91c65b`): the pure module
`src/vue/area-tree.mjs` with `buildSidebarTree`, `test/area-tree.test.mjs`, the migration adding
`areas` / `project_area` / `area_avatars`, the `get-areas` / `create-area` / `rename-area` IPC
channels, and `src/vue/components/AreaGroup.vue` with the "+ Area" button and inline naming.
Read those files before writing anything — every step below extends them rather than starting over.

- [ ] 1. `area-tree.mjs` — `resolveDrop({ tree, draggedId, targetId })`: nearest-Area resolution from a Session / Slug / Worktree / Project row, root drops, cycle rejection, self-drop
- [ ] 2. `area-tree.mjs` — `removeArea(areas, assignments, areaId)`: one-level promotion of sub-Areas and Projects, orphan assignments preserved
- [ ] 3. `area-tree.mjs` — search matches Area names and reveals the whole subtree. The temporary reveal itself is already done (`collapsed: filterActive ? false : area.collapsed`); only name matching is missing
- [ ] 4. `db.js` — CRUD for the rest: set collapsed, move (parent + position), delete with re-parenting in one transaction, avatar read/write/clear
- [ ] 5. `main.js` + `preload.js` — IPC channels for the above: `set-area-collapsed`, `move-area`, `assign-project-area`, `delete-area`, `get-area-avatar`, `set-area-avatar`, `clear-area-avatar`. Re-check the cycle guard server-side; resize imported images to ~128px
- [ ] 6. `src/vue/components/ProjectAvatar.vue` — generalise it to serve Areas too (image, initials + colour fallback), cached in the store like the project avatar
- [ ] 7. `AreaGroup.vue` + `SidebarApp.vue` — drag and drop wiring: Project→Area, Area→Area, root drop zone in the empty space below the list, OS image-file drop onto an Area
- [ ] 8. `src/vue/components/DialogsApp.vue` — Area dialog: rename, image drop zone with preview, clear image, delete without confirmation
- [ ] 9. Final pass — full `npm test`, and `docs/areas-design.md` + `CONTEXT.md` consistent with what shipped

## Notes for the next iteration

<!-- Append blockers, decisions and anything the next agent must know. Keep it short. -->
