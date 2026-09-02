import { reactive } from 'vue';

// The navigation Feature store: how the user navigates the sidebar — the active
// tab, the sidebar collapse, the search box with its matches, and the three
// mutually-exclusive Session filters. Written by the Feature Bridge, read by its
// Containers. Exposed by name through the aggregate facade so the frozen
// public/app.js keeps addressing window.vueStore.<field>.
export const navigationStore = reactive({
  // Tabs
  activeTab: 'sessions',

  // Sidebar collapse
  sidebarCollapsed: false,

  // Search box
  searchQuery: '',
  searchTitlesOnly: false,
  searchMatchIds: null,
  searchMatchProjectPaths: null,

  // The three mutually-exclusive Session filters
  showStarredOnly: false,
  showRunningOnly: false,
  showTodayOnly: false,
});
