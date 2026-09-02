import { reactive } from 'vue';

// App layout: which main-area panel is visible, plus a couple of transient
// sidebar flags. The active tab and the sidebar collapse belong to the
// navigation Feature. These fields are Vue-owned — do not touch via innerHTML/style.
export const layoutStore = reactive({
  loadingStatus: '',
  accountSwitching: false,

  // Main area panel visibility
  showStats: false,
  showJsonl: false,
  planViewerOpen: false,
  memoryViewerOpen: false,
  gridViewActive: false,
  gridViewerCount: '',
});
