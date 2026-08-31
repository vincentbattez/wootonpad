import { reactive } from 'vue';

// The Message History (JSONL) viewer's open request. A standalone feature store:
// app.js pushes a session to view through the jsonl bridge (window.vueJsonlViewer)
// and JsonlViewerApp watches the request and renders it. Not part of the
// window.vueStore aggregate.
//
// openRequest carries a monotonic seq so re-opening the same session still
// triggers the component's watcher (a net-zero payload change would otherwise be
// suppressed).
export const jsonlStore = reactive({
  openRequest: null, // { session, seq } | null
});
