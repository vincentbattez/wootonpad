import { createApp } from 'vue';
import { store } from './store.js';
import { createSidebarBridge } from './bridge.js';
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

// Stubs for component bridge APIs — App.vue onMounted fills these in
window.vuePlans = {};
window.vueMemory = {};
window.vueAccounts = {};
window.vueProjects = {};
window.vuePlanViewer = {};
window.vueMemoryViewer = {};
window.vueStatusBar = {};
window.vueAccountDropdown = {};
window.vueGrid = {};
window.vueDialogs = {};

// Mount the single root app (synchronous — all onMounted hooks run before returning)
createApp(App).mount('#app-container');
