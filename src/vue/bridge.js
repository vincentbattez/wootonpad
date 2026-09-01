import { markRaw } from 'vue';
import { api } from './shared/services/api.js';
import { sb } from './shared/services/sb.js';
import { createSessionsBridge } from './features/sessions/bridge.js';

// window.vueGrid: the Session-overview cards, owned by the grid Feature's Bridge. Re-exported
// so main.js and the bridge-contract spec keep one import site.
export { createGridBridge } from './features/grid/bridge.js';

// The renderer-to-Vue surface `public/app.js` calls. Every method writes a feature
// store rather than a component ref; app.js is frozen, so these names and signatures
// are the contract. The project viewer, stats and the plan/memory viewers still keep
// their template-ref setters in App.vue.

// window.vueSidebar: the Session/Project tree, the live PTY sets and the terminal-header
// context (all owned by the sessions Feature's Bridge) plus the navigation filters and
// search. Composed here so the legacy global stays one object with one method set.
export function createSidebarBridge(store) {
  return {
    store,
    ...createSessionsBridge(store),
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

// window.vueProjects: the Projects panel, plus the lazy per-project git/container
// info queue. Guarded so the bridge stays inert without window.api or rAF.
export function createProjectsBridge(store) {
  let queueGen = 0;
  let pendingInfoUpdates = {};
  let flushScheduled = false;

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

// window.vueJsonlViewer: the Message History viewer. The seq bump makes re-opening
// the same session re-trigger the component's watcher.
export function createJsonlViewerBridge(store) {
  let seq = 0;
  return {
    // markRaw: read once to render, so deep-proxying buys nothing.
    open(session) { store.openRequest = { session: markRaw(session), seq: ++seq }; },
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
  if (typeof window !== 'undefined') sb.onTabChange?.(tabId);
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
