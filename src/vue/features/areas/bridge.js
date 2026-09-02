// The areas Feature's Bridge into the areas store. Every method writes the feature store rather
// than a component ref, so a panel reading the store can be a Dumb Component. The Container calls
// the main process and then calls these to mirror the result into the store; unlike the sessions
// Bridge it is not composed onto any frozen window.vue* surface — `public/app.js` never drove
// areas — so it stays an internal contract between the Container and the store.
export function createAreasBridge(store) {
  return {
    // A fresh fetch of the Area tree. An Area created locally while the load was in flight is
    // absent from `fetched`; keep it so it does not vanish the moment the response lands.
    mergeAreas(fetched) {
      const ids = new Set(fetched.map(a => a.id));
      store.areas = [...fetched, ...store.areas.filter(a => !ids.has(a.id))];
    },
    setAssignments(assignments) { store.areaAssignments = assignments; },
    // Delete promotes an Area's children up a level, rewriting both lists at once.
    setTree(areas, assignments) {
      store.areas = areas;
      store.areaAssignments = assignments;
    },
    addArea(area) { store.areas = [...store.areas, area]; },
    renameArea(id, name) {
      const area = store.areas.find(a => a.id === id);
      if (area) area.name = name;
    },
    setCollapsed(id, collapsed) {
      const area = store.areas.find(a => a.id === id);
      if (area) area.collapsed = collapsed;
    },
    moveAreaResult(id, parentId, position) {
      store.areas = store.areas.map(a =>
        a.id === id ? { ...a, parentId: parentId ?? null, position } : a);
    },
    startRename(id) { store.renamingAreaId = id; },
    stopRename() { store.renamingAreaId = null; },
  };
}
