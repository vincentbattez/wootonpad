import { createApp } from 'vue';
import { store } from './store.js';
import {
  createSidebarBridge,
  createPlansBridge,
  createMemoryBridge,
  createAccountsBridge,
  createAccountDropdownBridge,
  createStatusBarBridge,
  createGridBridge,
  createProjectsBridge,
  createJsonlViewerBridge,
  createAppBridge,
} from './bridge.js';
import { plansStore } from './stores/plans.js';
import { memoryStore } from './stores/memory.js';
import { accountsStore } from './stores/accounts.js';
import { accountDropdownStore } from './stores/account-dropdown.js';
import { statusBarStore } from './stores/status-bar.js';
import { gridStore } from './stores/grid.js';
import { projectsStore } from './stores/projects.js';
import { jsonlStore } from './stores/jsonl.js';
import App from './components/App.vue';
import ViewerContentApp from './components/ViewerContentApp.vue';

// Expose the aggregate store facade for direct mutation from app.js. It reads
// and writes through to the feature slices, so every field app.js addresses by
// name still resolves.
window.vueStore = store;

// The store-writing bridge (sidebar tree, PTY sets, filters, header) is declared
// in the single bridge module and mutates the store rather than a component ref.
// It runs synchronously during app.mount(), before any other script executes.
window.vueSidebar = createSidebarBridge(store);

// The panel bridges write into their own feature stores, which the panels read
// reactively — no template-ref setter. Declared here so they exist before any
// app.js call, rather than being filled in App.vue's onMounted.
window.vuePlans = createPlansBridge(plansStore);
window.vueMemory = createMemoryBridge(memoryStore);
window.vueAccounts = createAccountsBridge(accountsStore);
window.vueAccountDropdown = createAccountDropdownBridge(accountDropdownStore);
window.vueStatusBar = createStatusBarBridge(statusBarStore);
window.vueGrid = createGridBridge(gridStore);
window.vueProjects = createProjectsBridge(projectsStore);
window.vueJsonlViewer = createJsonlViewerBridge(jsonlStore);
// The tab switch is store-only, so it lives in the bridge too; App.vue's tab
// buttons delegate to it.
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

// Stubs for the component bridge APIs still installed from App.vue onMounted via
// template refs (their panels are not yet store-backed).
window.vuePlanViewer = {};
window.vueMemoryViewer = {};
window.vueDialogs = {};

// Mount the single root app (synchronous — all onMounted hooks run before returning)
createApp(App).mount('#app-container');
