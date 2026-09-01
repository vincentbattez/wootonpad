import { reactive } from 'vue';

// The Agent Files (memory) panel's state. Standalone feature store: app.js
// pushes it through window.vueMemory and MemoryApp reads it reactively.
export const memoryStore = reactive({
  data: { global: { files: [] }, projects: [] },
  filterIds: null,
  activeFile: null,
});
