import { reactive } from 'vue';

// Sidebar state: the Project collapse overrides and how many Sessions a Project
// shows. The search box and the three Session filters belong to the navigation
// Feature.
export const sidebarStore = reactive({
  // Project collapse overrides: projectPath → bool. Absent = fall back to staleness.
  collapsedProjects: {},

  // Visibility settings
  visibleSessionCount: 10,
  sessionMaxAgeDays: 3,
});
