import { reactive } from 'vue';

// The projects Feature store. The sidebar's Project rows own two pieces of view state: which
// Projects are collapsed (keyed by path, persisted across restarts through the main process) and
// which Project's sidebar label is being renamed inline. The Feature's Bridge writes here; a Dumb
// Component reads it only through the Container. The Projects *panel* (window.vueProjects) keeps its
// own store in stores/projects.js — a different surface, untouched by this Feature.
export const projectsStore = reactive({
  // projectPath → collapsed flag. Held in the store, not a component ref, because a filter can
  // unmount and remount a Project row and the collapse must survive it.
  collapsedProjects: {},
  // Path of the Project whose sidebar label is being edited inline, or null.
  renamingProjectPath: null,
});
