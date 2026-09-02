import { createApp } from 'vue';
import AppShell from './app/AppShell.vue';
import ViewerContainer from './features/viewer/containers/ViewerContainer.vue';
import { viewerStore } from './features/viewer/store.js';
import { createViewerBridge } from './features/viewer/bridge.js';

// The renderer entry point. It mounts the shell and nothing else: every Feature Bridge
// is now wired inside the AppShell Container, so this module hardcodes no Feature
// internals beyond mounting (ADR 0010).

// The file panel (public/file-panel.js) mounts its own viewer here. The Container is bridged: it
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

// Mount the single root app (synchronous — all onMounted hooks run before returning).
// The shell wires every Bridge during setup, so the window.vue* surface exists before
// public/app.js runs.
createApp(AppShell).mount('#app-container');
