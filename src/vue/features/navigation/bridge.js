// The navigation Feature Bridge. Every method writes the navigation store the
// Feature's Containers read reactively. public/app.js is frozen, so these names
// and signatures are the contract: it calls window.vueSidebar.setSearch /
// .setFilters (merged onto the sidebar bridge object in main.js) and
// window.vueApp.setTab.
export function createNavigationBridge(store) {
  return {
    // window.vueSidebar.setSearch: the ids/paths that matched the last search.
    setSearch(matchIds, matchProjectPaths) {
      store.searchMatchIds = matchIds;
      store.searchMatchProjectPaths = matchProjectPaths;
    },
    // window.vueSidebar.setFilters: only the keys it is handed are written.
    setFilters({ showStarredOnly, showRunningOnly, showTodayOnly }) {
      if (showStarredOnly !== undefined) store.showStarredOnly = showStarredOnly;
      if (showRunningOnly !== undefined) store.showRunningOnly = showRunningOnly;
      if (showTodayOnly !== undefined) store.showTodayOnly = showTodayOnly;
    },
    // window.vueApp.setTab: switch tab, which also clears the search.
    setTab(tabId) { switchTab(store, tabId); },
  };
}

// Switching tab clears the search. Exported so the tab Container and the Bridge
// share one code path.
export function switchTab(store, tabId) {
  if (tabId === store.activeTab) return;
  store.activeTab = tabId;
  store.searchQuery = '';
  store.searchMatchIds = null;
  store.searchMatchProjectPaths = null;
  if (typeof window !== 'undefined') window.__sb?.onTabChange?.(tabId);
}
