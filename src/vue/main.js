import { createApp } from 'vue';
import { store } from './store.js';
import {
  createSidebarBridge,
  createAccountsBridge,
  createAccountDropdownBridge,
  createGridBridge,
  createProjectsBridge,
  createJsonlViewerBridge,
} from './bridge.js';
import { createNavigationBridge } from './features/navigation/bridge.js';
import { createSettingsBridge } from './features/settings/bridge.js';
import { settingsStore } from './features/settings/store.js';
import { createAgentFilesBridge } from './features/agent-files/bridge.js';
import { agentFilesStore } from './features/agent-files/store.js';
import { accountsStore } from './stores/accounts.js';
import { accountDropdownStore } from './stores/account-dropdown.js';
import { createStatusBarBridge } from './features/status-bar/bridge.js';
import { statusBarStore } from './features/status-bar/store.js';
import { gridStore } from './stores/grid.js';
import { projectsStore } from './stores/projects.js';
import { jsonlStore } from './stores/jsonl.js';
import App from './components/App.vue';
import ViewerContainer from './features/viewer/containers/ViewerContainer.vue';
import { viewerStore } from './features/viewer/store.js';
import { createViewerBridge } from './features/viewer/bridge.js';

// The aggregate store facade app.js mutates by field name.
window.vueStore = store;


window.vueSidebar = createSidebarBridge(store);

// The navigation Feature owns the search, filters and tab surface. app.js reaches
// its search/filter writers as window.vueSidebar.setSearch/.setFilters, so they
// are merged onto the sidebar bridge object; the tab switch is window.vueApp.
const navigationBridge = createNavigationBridge(store);
window.vueSidebar.setSearch = navigationBridge.setSearch;
window.vueSidebar.setFilters = navigationBridge.setFilters;
window.vueApp = { setTab: navigationBridge.setTab };

// Installed before mount so they exist ahead of any app.js call.
// The agent-files Feature owns both plan and memory panels; its Bridge composes the two
// legacy globals app.js still calls by name.
const agentFiles = createAgentFilesBridge(agentFilesStore);
window.vuePlans = agentFiles.plans;
window.vueMemory = agentFiles.memory;
window.vueAccounts = createAccountsBridge(accountsStore);
window.vueAccountDropdown = createAccountDropdownBridge(accountDropdownStore);
window.vueStatusBar = createStatusBarBridge(statusBarStore);
window.vueGrid = createGridBridge(gridStore);
window.vueProjects = createProjectsBridge(projectsStore);
window.vueJsonlViewer = createJsonlViewerBridge(jsonlStore);
window.vueSettings = createSettingsBridge(settingsStore);

// The file panel (public/file-panel.js) mounts its viewer here. The Container is bridged: it
// reacts to the viewer store the Feature's Bridge writes, so file-panel.js drives open/destroy
// through the Bridge rather than through a template ref. getContent stays on the instance —
// the Bridge carries only what the frozen file panel calls.
window.createViewerPanel = function(container, opts = {}) {
  const app = createApp(ViewerContainer, {
    language: opts.language || 'markdown',
    storageKey: opts.storageKey,
    showCopyPath: !!opts.copyPath,
    showCopyContent: !!opts.copyContent,
    onSave: opts.onSave || null,
    onClose: opts.onClose || null,
    bridged: true,
  });
  const instance = app.mount(container);
  const bridge = createViewerBridge(viewerStore);
  return {
    open: (...args) => bridge.open(...args),
    destroy: () => bridge.destroy(),
    getContent: () => instance.getContent(),
  };
};

// Stubs for the panels still installed from App.vue via template refs.
window.vuePlanViewer = {};
window.vueMemoryViewer = {};
window.vueDialogs = {};

// Mount the single root app (synchronous — all onMounted hooks run before returning)
createApp(App).mount('#app-container');
