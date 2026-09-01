import { markRaw } from 'vue';

// The jsonl Feature's Bridge to the frozen legacy renderer (window.vueJsonlViewer). It
// writes an open request into the feature store rather than calling a component through a
// template ref, so the viewer can be a Container reading the store. `public/app.js` is
// frozen, so this name and signature are the contract. The seq bump makes re-opening the
// same session re-trigger the Container's watcher.
export function createJsonlViewerBridge(store) {
  let seq = 0;
  return {
    // markRaw: read once to render, so deep-proxying the session buys nothing.
    open(session) { store.openRequest = { session: markRaw(session), seq: ++seq }; },
  };
}
