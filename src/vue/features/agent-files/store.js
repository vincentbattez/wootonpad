import { reactive } from 'vue';

// The agent-files Feature store. Plans and memory are one Feature because they already share
// the same row and the same markdown viewer; their two panels read separate slices of this
// store, which the Feature's Bridge writes. The frozen renderer drives it through
// window.vuePlans and window.vueMemory — the two globals the Bridge composes.
export const agentFilesStore = reactive({
  // Plans: the list under ~/.claude/plans/ and which one is open.
  plans: [],
  activePlan: null,

  // Memory (Agent Files): the { global, projects } tree, the active-file highlight and the
  // search filter (a Set of matching filePaths, or null for "no filter").
  memory: { global: { files: [] }, projects: [] },
  memoryFilterIds: null,
  activeMemoryFile: null,
});
