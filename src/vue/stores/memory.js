import { reactive } from 'vue';

// The Agent Files (memory) panel's state, written through window.vueMemory.
export const memoryStore = reactive({
  data: { global: { files: [] }, projects: [] },
  filterIds: null,
  activeFile: null,
});
