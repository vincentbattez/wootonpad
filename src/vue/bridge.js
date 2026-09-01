// The jsonl Feature owns its Bridge; re-exported here so main.js keeps one bridge import.
export { createJsonlViewerBridge } from './features/jsonl/bridge.js';

// The renderer-to-Vue surface `public/app.js` calls. Every method writes a feature
// store rather than a component ref; app.js is frozen, so these names and signatures
// are the contract. The project viewer, stats and the plan/memory viewers still keep
// their template-ref setters in App.vue.

// window.vueSidebar: the Session/Project tree, the live PTY sets, the filters,
// the search matches and the terminal-header context.
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

// window.vuePlans: the Plans list and which plan is open.
export function createPlansBridge(store) {
  return {
    setPlans(list) { store.plans = list; },
    setActive(filename) { store.activePlan = filename; },
    clearActive() { store.activePlan = null; },
  };
}

// window.vueMemory: the Agent Files tree, the active-file highlight and the search filter.
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

// window.vueAccountDropdown: the sidebar account switcher.
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

// window.vueGrid: the Session-overview cards. GridCardsApp teleports each card into
// the header/footer element the vanilla grid renderer built.
export function createGridBridge(store) {
  return {
    addCard(sessionId, headerEl, footerEl, { name, project, initials, color, running, busy, time }) {
      store.cards.set(sessionId, { headerEl, footerEl, name, project, initials, color, running: !!running, busy: !!busy, time: time || '' });
    },
    updateCard(sessionId, running, busy, time) {
      const card = store.cards.get(sessionId);
      if (!card) return;
      card.running = !!running;
      card.busy = !!busy;
      if (time !== undefined) card.time = time;
    },
    removeCard(sessionId) { store.cards.delete(sessionId); },
    clearAll() { store.cards.clear(); },
  };
}

// window.vueProjects: the Projects panel, plus the lazy per-project git/container
// info queue. Guarded so the bridge stays inert without window.api or rAF.
export function createProjectsBridge(store) {
  let queueGen = 0;
  let pendingInfoUpdates = {};
  let flushScheduled = false;

  const api = typeof window !== 'undefined' ? window.api : undefined;

  function flush() {
    flushScheduled = false;
    for (const [path, info] of Object.entries(pendingInfoUpdates)) {
      store.projectInfo[path] = store.projectInfo[path] ? { ...store.projectInfo[path], ...info } : info;
      store.loadingPaths.delete(path);
    }
    pendingInfoUpdates = {};
  }

  // Batch reactive info writes into one rAF flush to avoid per-project churn.
  function scheduleInfoFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else flush();
  }

  async function runInfoQueue(gen, list) {
    if (!api?.getProjectInfo) return;
    for (const project of list) {
      if (queueGen !== gen) break;
      if (store.projectInfo[project.projectPath]) continue; // already loaded
      store.loadingPaths.add(project.projectPath);
      try {
        const info = await api.getProjectInfo(project.projectPath);
        if (queueGen !== gen) break;
        if (info) {
          pendingInfoUpdates[project.projectPath] = info;
          scheduleInfoFlush();
        } else {
          store.loadingPaths.delete(project.projectPath);
        }
      } catch {
        store.loadingPaths.delete(project.projectPath);
      }
    }
  }

  // Main-process push events: a row starts syncing, or its info arrives.
  api?.onProjectInfoLoading?.((path) => { store.loadingPaths.add(path); });
  api?.onProjectInfoUpdated?.((path, info) => {
    if (info) {
      pendingInfoUpdates[path] = info;
      scheduleInfoFlush();
    } else {
      store.loadingPaths.delete(path);
    }
  });

  return {
    setProjects(list) {
      store.projects = list;
      queueGen++;
      runInfoQueue(queueGen, list);
    },
    setSearch(q) { store.searchQuery = q || ''; },
    clearActive() { store.activeProjectPath = null; },
    updateProjectInfo(path, info) {
      if (info) {
        pendingInfoUpdates[path] = info;
        scheduleInfoFlush();
      }
    },
  };
}

// Switching tab clears the search. Exported so App.vue's tab buttons and
// window.vueApp share one code path.
export function switchTab(store, tabId) {
  if (tabId === store.activeTab) return;
  store.activeTab = tabId;
  store.searchQuery = '';
  store.searchMatchIds = null;
  store.searchMatchProjectPaths = null;
  if (typeof window !== 'undefined') window.__sb?.onTabChange?.(tabId);
}

// window.vueApp: the sidebar tab switch.
export function createAppBridge(store) {
  return {
    setTab(tabId) { switchTab(store, tabId); },
  };
}

// window.vueStatusBar: the three status-bar slots and their auto-clear timers.
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
