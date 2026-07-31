# VIN-75 — progress

Ordered work plan for `docs/specs/areas-spec.md`. One step per iteration.
Tick a box only once the step is implemented, `npm test` is green, and the work is committed.

- [ ] 1. `src/vue/area-tree.mjs` + `test/area-tree.test.mjs` — `buildSidebarTree` (ordering, nesting, unfiled projects at root)
- [ ] 2. `area-tree.mjs` — visibility and collapse under filter/search (empty areas, computed expansion, temporary reveal)
- [ ] 3. `area-tree.mjs` — search: project-name match reveals ancestors, area-name match reveals the whole subtree
- [ ] 4. `area-tree.mjs` — `resolveDrop` (nearest-area resolution, root drops, cycle rejection, self-drop)
- [ ] 5. `area-tree.mjs` — `removeArea` (one-level promotion of sub-areas and projects, orphan assignments)
- [ ] 6. `db.js` — migration adding `areas`, `project_area`, `area_avatars`; CRUD helpers; delete re-parents in one transaction
- [ ] 7. `main.js` + `preload.js` — IPC channels: list tree, create, rename, set/clear image (resize ~128px), move (server-side cycle guard), set collapsed, delete
- [ ] 8. `src/vue/components/SidebarApp.vue` + a new `AreaGroup.vue` — recursive Area nodes above Projects (mirror `ProjectGroup.vue`), consuming `buildSidebarTree`; "+ Area" button with inline naming
- [ ] 9. `src/vue/components/ProjectAvatar.vue` — generalise it to serve Areas too (image, initials + colour fallback)
- [ ] 10. Drag and drop wiring in `SidebarApp.vue` / `AreaGroup.vue` — project→area, area→area, root drop zone below the list, OS image-file drop onto an Area
- [ ] 11. Area dialog in `src/vue/components/DialogsApp.vue` — rename, image drop zone + preview, clear image, delete (no confirmation)
- [ ] 12. `src/vue/project-collapse.mjs` + `ProjectGroup.vue` — Project collapse becomes a computed value; the dead auto-collapse-stale initialiser is fixed
- [ ] 13. Final pass — full `npm test`, `docs/areas-design.md` and `CONTEXT.md` consistent with what shipped

## Notes for the next iteration

<!-- Append blockers, decisions and anything the next agent must know. Keep it short. -->
