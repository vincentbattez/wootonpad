import { reactive } from 'vue';

// Sidebar state: the three Session filters, the search query and its matches,
// the Project collapse overrides and how many Sessions a Project shows.
export const sidebarStore = reactive({
  // Filter state
  showStarredOnly: false,
  showRunningOnly: false,
  showTodayOnly: false,
  searchMatchIds: null,
  searchMatchProjectPaths: null,

  // Project collapse overrides: projectPath → bool. Absent = fall back to staleness.
  collapsedProjects: {},

  // Visibility settings
  visibleSessionCount: 10,
  sessionMaxAgeDays: 3,

  // Search box
  searchQuery: '',
  searchTitlesOnly: false,
});
