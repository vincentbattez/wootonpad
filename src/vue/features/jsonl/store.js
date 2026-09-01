import { reactive } from 'vue';

// The jsonl Feature store. Holds the Message History viewer's open request, written by
// the feature's Bridge and read by the viewer Container. The seq inside the request lets
// re-opening the same session re-trigger the Container's watcher.
export const jsonlStore = reactive({
  openRequest: null, // { session, seq } | null
});
