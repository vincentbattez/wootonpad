import { api } from './shared/services/api.js';
import { createSessionsBridge } from './features/sessions/bridge.js';

// window.vueGrid: the Session-overview cards, owned by the grid Feature's Bridge. Re-exported
// so main.js and the bridge-contract spec keep one import site.
export { createGridBridge } from './features/grid/bridge.js';

// The jsonl Feature owns its Bridge; re-exported here so main.js keeps one bridge import.
export { createJsonlViewerBridge } from './features/jsonl/bridge.js';

// The renderer-to-Vue surface `public/app.js` calls. Every method writes a feature
// store rather than a component ref; app.js is frozen, so these names and signatures
// are the contract. The project viewer, stats and the plan/memory viewers still keep
// their template-ref setters in App.vue.

// window.vueSidebar: the Session/Project tree, the live PTY sets and the
// terminal-header context, all owned by the sessions Feature's Bridge and spread
// in here. The filters and search matches it also carries are written by the
// navigation Feature Bridge (merged onto this object in main.js), since
// public/app.js addresses them as window.vueSidebar.setFilters/setSearch.
export function createSidebarBridge(store) {
  return {
    store,
    ...createSessionsBridge(store),
    setVisibility(count, ageDays) {
      store.visibleSessionCount = count;
      store.sessionMaxAgeDays = ageDays;
    },
  };
}

// The Plans and Memory panels moved to the agent-files Feature; window.vuePlans and
// window.vueMemory are composed there (see features/agent-files/bridge.js).

// The accounts panel and the sidebar switcher declare their Bridges in the accounts Feature
// (features/accounts/bridge.js), composed into window.vueAccounts / window.vueAccountDropdown
// in main.js, so the folder can move with its whole contract.

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

