import { reactive } from 'vue';

// The Projects panel's state, written through window.vueProjects.
export const projectsStore = reactive({
  projects: [],
  searchQuery: '',
  activeProjectPath: null,
  // projectPath → info object (branch, added, deleted, sizeMb, containers, …)
  projectInfo: {},
  // projectPaths currently being fetched
  loadingPaths: new Set(),
});
