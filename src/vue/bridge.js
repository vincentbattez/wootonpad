import { markRaw } from 'vue';

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

// window.vueGrid: the Session-overview cards. Each method mutates the store's
// card Map; GridCardsApp teleports each card into the header/footer element the
// vanilla grid renderer built. The old defineExpose setters are gone.
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

// window.vueProjects: the Projects panel. The per-project info queue — a lazy
// fetch of git/container info that setProjects used to kick inside the component
// — lives here now, so ProjectsApp is a pure reader of the store. The queue and
// its rAF batching are guarded so the bridge is inert when window.api or
// requestAnimationFrame are absent (as under node:test).
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

  // Batch reactive info writes into one rAF flush to avoid per-project churn;
  // fall back to a synchronous flush where rAF is unavailable (node:test).
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

// window.vueJsonlViewer: the Message History viewer. `open(session)` used to be
// a defineExpose method reached through a template ref; it now writes an open
// request the component watches and renders. The seq bump makes re-opening the
// same session re-trigger the watcher.
export function createJsonlViewerBridge(store) {
  let seq = 0;
  return {
    // markRaw the session: the component reads it once to render, so there is no
    // gain in deep-proxying it, and it keeps the stored reference identical to the
    // one handed in.
    open(session) { store.openRequest = { session: markRaw(session), seq: ++seq }; },
  };
}

// window.vueApp: the sidebar tab switch. It used to be a closure over App.vue's
// onMounted; it now lives here and writes the aggregate store's tab and search
// fields directly — the same fields the sidebar/header render from — and pings
// the vanilla search host. App.vue's tab buttons delegate to this so there is
// one code path.
export function createAppBridge(store) {
  return {
    setTab(tabId) {
      if (tabId === store.activeTab) return;
      store.activeTab = tabId;
      // Clear search on tab switch
      store.searchQuery = '';
      store.searchMatchIds = null;
      store.searchMatchProjectPaths = null;
      if (typeof window !== 'undefined') window.__sb?.onTabChange?.(tabId);
    },
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
