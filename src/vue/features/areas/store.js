import { reactive } from 'vue';

// The areas Feature store. The user-authored tree above Projects in the sidebar — the Areas
// themselves and the Project→Area assignments — plus the inline rename targets for an Area and
// for a Project's sidebar label. The Feature's Bridge writes here; a Dumb Component reads it
// only through the Container.
export const areasStore = reactive({
  areas: [],
  areaAssignments: [],
  renamingAreaId: null,
  // Path of the Project whose sidebar label is being edited inline.
  renamingProjectPath: null,
});
