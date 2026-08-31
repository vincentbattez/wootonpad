// The single bridge module: it declares the renderer-to-Vue surface that
// `public/app.js` calls, and every method writes into the feature stores
// rather than into a component through a template ref. `public/app.js` is
// frozen, so these names and signatures are the contract.
//
// The sidebar and header setters already worked this way before the split —
// they wrote to the flat store — so gathering them here generalises an existing
// pattern rather than inventing one. The remaining panel bridges (Plans,
// Accounts, Projects, …) are still installed from App.vue via template refs and
// move here as each panel learns to read its slice reactively.

// window.vueSidebar: the Session/Project tree, the live PTY sets, the filters,
// the search matches and the terminal-header context. Every method mutates the
// store the sidebar and header components render from.
export function createSidebarBridge(store) {
  return {
    store,
    setProjects(projects) { store.projects = projects.map(p => ({ ...p })); },
    setActivePtyIds(ids) { store.activePtyIds = new Set(ids); },
    setActiveSession(id) { store.activeSessionId = id; },
    setBusy(sessionId, busy) {
      if (busy) store.sessionBusyState.set(sessionId, true);
      else store.sessionBusyState.delete(sessionId);
    },
    addAttention(sessionId) { store.attentionSessions.add(sessionId); },
    setResponseReady(sessionId) {
      store.responseReadySessions.add(sessionId);
      store.sessionBusyState.delete(sessionId);
    },
    clearNotifications(sessionId) {
      store.attentionSessions.delete(sessionId);
      store.responseReadySessions.delete(sessionId);
    },
    setFilters({ showStarredOnly, showRunningOnly, showTodayOnly }) {
      if (showStarredOnly !== undefined) store.showStarredOnly = showStarredOnly;
      if (showRunningOnly !== undefined) store.showRunningOnly = showRunningOnly;
      if (showTodayOnly !== undefined) store.showTodayOnly = showTodayOnly;
    },
    setSearch(matchIds, matchProjectPaths) {
      store.searchMatchIds = matchIds;
      store.searchMatchProjectPaths = matchProjectPaths;
    },
    setVisibility(count, ageDays) {
      store.visibleSessionCount = count;
      store.sessionMaxAgeDays = ageDays;
    },
    setHeaderSession(session) { store.headerSession = session; },
    setHeaderPtyTitle(title) { store.headerPtyTitle = title || null; },
    setHeaderShellProfile(profile) { store.headerShellProfile = profile || null; },
    setHeaderAccount(name) { store.headerAccount = name || null; },
    clearHeader() {
      store.headerSession = null;
      store.headerPtyTitle = null;
      store.headerShellProfile = null;
      store.headerAccount = null;
    },
  };
}
