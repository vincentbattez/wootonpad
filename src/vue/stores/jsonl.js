import { reactive } from 'vue';

// The Message History (JSONL) viewer's open request, written through
// window.vueJsonlViewer.
export const jsonlStore = reactive({
  openRequest: null, // { session, seq } | null
});
