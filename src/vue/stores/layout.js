import { reactive } from 'vue';

// App layout: the active tab, the sidebar collapse, and which main-area panel
// is visible. These fields are Vue-owned — do not touch via innerHTML/style.
export const layoutStore = reactive({
  activeTab: 'sessions',
  sidebarCollapsed: false,
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
