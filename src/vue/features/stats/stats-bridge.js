// window.vueStats: the surface app.js calls to drive the Stats Feature. Both
// methods are store writes — the Container watches the counters and does the IPC —
// so the frozen renderer never reaches into a component through a template ref.
export function createStatsBridge(store) {
  return {
    load() { store.loadRequest++; },
    invalidate() { store.invalidateRequest++; },
  };
}
