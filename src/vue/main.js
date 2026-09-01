import { createApp } from 'vue';
import { store } from './store.js';
import {
  createSidebarBridge,
  createPlansBridge,
  createMemoryBridge,
  createAccountsBridge,
  createAccountDropdownBridge,
  createGridBridge,
  createProjectsBridge,
  createJsonlViewerBridge,
  createAppBridge,
} from './bridge.js';
import { plansStore } from './stores/plans.js';
import { memoryStore } from './stores/memory.js';
import { accountsStore } from './stores/accounts.js';
import { accountDropdownStore } from './stores/account-dropdown.js';
import { createStatusBarBridge } from './features/status-bar/bridge.js';
import { statusBarStore } from './features/status-bar/store.js';
import { gridStore } from './stores/grid.js';
import { projectsStore } from './stores/projects.js';
import { jsonlStore } from './stores/jsonl.js';
import App from './components/App.vue';
import ViewerContentApp from './components/ViewerContentApp.vue';

// The aggregate store facade app.js mutates by field name.
window.vueStore = store;


window.vueSidebar = createSidebarBridge(store);

// Installed before mount so they exist ahead of any app.js call.
window.vuePlans = createPlansBridge(plansStore);
window.vueMemory = createMemoryBridge(memoryStore);
window.vueAccounts = createAccountsBridge(accountsStore);
window.vueAccountDropdown = createAccountDropdownBridge(accountDropdownStore);
window.vueStatusBar = createStatusBarBridge(statusBarStore);
window.vueGrid = createGridBridge(gridStore);
window.vueProjects = createProjectsBridge(projectsStore);
window.vueJsonlViewer = createJsonlViewerBridge(jsonlStore);
window.vueApp = createAppBridge(store);

// Factory for mounting ViewerContentApp into a plain DOM container (used by file-panel.js)
window.createViewerPanel = function(container, opts = {}) {
  const app = createApp(ViewerContentApp, {
    language: opts.language || 'markdown',
    storageKey: opts.storageKey,
    showCopyPath: !!opts.copyPath,
    showCopyContent: !!opts.copyContent,
    onSave: opts.onSave || null,
    onClose: opts.onClose || null,
  });
  const instance = app.mount(container);
  return {
    open: (...args) => instance.open(...args),
    destroy: () => instance.destroy(),
    getContent: () => instance.getContent(),
  };
};

// Stubs for the panels still installed from App.vue via template refs.
window.vuePlanViewer = {};
window.vueMemoryViewer = {};
window.vueDialogs = {};

// Mount the single root app (synchronous — all onMounted hooks run before returning)
createApp(App).mount('#app-container');
