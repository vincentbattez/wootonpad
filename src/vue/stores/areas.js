import { reactive } from 'vue';

// Areas: the user-authored tree above Projects in the sidebar, plus the inline
// rename targets for an Area and for a Project's sidebar label.
export const areas = reactive({
  areas: [],
  areaAssignments: [],
  renamingAreaId: null,
  // Path of the Project whose sidebar label is being edited inline.
  renamingProjectPath: null,
});
