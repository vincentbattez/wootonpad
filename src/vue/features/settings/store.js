import { reactive } from 'vue';

// The settings Feature store. It owns the panel's own state: whether the panel is open,
// whether it edits the global defaults or a single Project's overrides, and which Project.
// The feature's Bridge writes here; the edge Container reads it and a Dumb Component never
// touches it directly.
export const settingsStore = reactive({
  settingsOpen: false,
  settingsScope: 'global',       // 'global' | 'project'
  settingsProjectPath: null,
});
