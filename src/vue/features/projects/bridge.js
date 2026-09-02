// The projects Feature's Bridge into the projects store. Every method writes the feature store
// rather than a component ref, so the Project row that reads the store can be a Dumb Component. The
// Container calls the main process (rename, collapse) and then calls these to mirror the result into
// the store. Unlike the sessions Bridge it is not composed onto any frozen window.vue* surface —
// public/app.js never drove the sidebar Project rows — so it stays an internal contract between the
// Container and the store.
export function createProjectsBridge(store) {
  return {
    // The inline-rename target: the menu's Rename opens it, submit or cancel clears it.
    startRename(path) { store.renamingProjectPath = path; },
    stopRename() { store.renamingProjectPath = null; },
    // A Project's collapse flag, written per path. The Container persists it to the main process
    // separately; this only mirrors it so the sidebar folds at once.
    setCollapsed(path, collapsed) { store.collapsedProjects[path] = collapsed; },
  };
}
