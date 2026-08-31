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

// window.vuePlans: the Plans list and which plan is open. PlansApp reads the
// store these write; the old defineExpose setters are gone.
export function createPlansBridge(store) {
  return {
    setPlans(list) { store.plans = list; },
    setActive(filename) { store.activePlan = filename; },
    clearActive() { store.activePlan = null; },
  };
}

// window.vueMemory: the Agent Files tree, the active-file highlight and the
// search filter. MemoryApp reads the store reactively.
export function createMemoryBridge(store) {
  return {
    setMemories(data, ids = null) {
      store.data = data;
      store.filterIds = ids;
    },
    setFilter(ids) { store.filterIds = ids; },
    setActive(filePath) { store.activeFile = filePath; },
    clearActive() { store.activeFile = null; },
  };
}

// window.vueAccounts: the Accounts panel list, its active account and usage.
// The WSL-home discovery that setAccounts used to trigger is now a watcher in
// AccountsApp, so this stays a pure store write.
export function createAccountsBridge(store) {
  return {
    setAccounts(list, activeId) {
      store.accounts = list;
      if (activeId !== undefined) store.activeAccountId = activeId;
    },
    setActiveAccount(id) { store.activeAccountId = id; },
    setUsage(usage) { store.usage = { ...usage }; },
  };
}

// window.vueAccountDropdown: the sidebar account switcher. `close()` writes the
// store's open flag, which the component renders from.
export function createAccountDropdownBridge(store) {
  return {
    setAccounts(list, activeId, usage) {
      store.accounts = list;
      if (activeId !== undefined) store.activeAccountId = activeId;
      if (usage !== undefined) store.usage = usage;
    },
    setActiveAccount(id) { store.activeAccountId = id; },
    setUsage(usage) { store.usage = { ...usage }; },
    close() { store.open = false; },
  };
}

// window.vueStatusBar: the three status-bar slots. The auto-clear timers that
// lived in the component's setters live here now, so the component is a pure
// reader of the store.
export function createStatusBarBridge(store) {
  let activityTimer = null;
  let updaterTimer = null;
  return {
    setInfo(text) { store.info = text; },
    setActivity(text, type) {
      if (activityTimer) clearTimeout(activityTimer);
      store.activity = text;
      store.activityClass = type === 'done' ? 'status-done' : '';
      if (!text || type === 'done') {
        activityTimer = setTimeout(() => {
          store.activity = '';
          store.activityClass = '';
        }, type === 'done' ? 3000 : 0);
      }
    },
    setUpdater(text, duration) {
      if (updaterTimer) clearTimeout(updaterTimer);
      store.updater = text;
      if (duration) {
        updaterTimer = setTimeout(() => { store.updater = ''; }, duration);
      }
    },
  };
}
