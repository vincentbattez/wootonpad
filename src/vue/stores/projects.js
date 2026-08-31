import { reactive } from 'vue';

// The Projects panel's state. A standalone feature store: app.js pushes into it
// through the projects bridge (window.vueProjects) and ProjectsApp reads it
// reactively. The per-project git/container info fetched lazily by the bridge
// lands in projectInfo; loadingPaths marks the rows still syncing. Not part of
// the window.vueStore aggregate.
export const projectsStore = reactive({
  projects: [],
  searchQuery: '',
  activeProjectPath: null,
  // projectPath → info object (branch, added, deleted, sizeMb, containers, …)
  projectInfo: {},
  // projectPaths currently being fetched
  loadingPaths: new Set(),
});
