import { reactive } from 'vue';

// Sidebar state: how many Sessions a Project shows. The Project collapse overrides moved to the
// projects Feature store; the search box and the three Session filters belong to the navigation
// Feature.
export const sidebarStore = reactive({
  // Visibility settings
  visibleSessionCount: 10,
  sessionMaxAgeDays: 3,
});
