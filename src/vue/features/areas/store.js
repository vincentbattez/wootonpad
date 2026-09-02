import { reactive } from 'vue';

// The areas Feature store. The user-authored tree above Projects in the sidebar — the Areas
// themselves and the Project→Area assignments — plus the inline rename target for an Area. The
// Project's own inline-rename target moved to the projects Feature store. The Feature's Bridge
// writes here; a Dumb Component reads it only through the Container.
export const areasStore = reactive({
  areas: [],
  areaAssignments: [],
  renamingAreaId: null,
});
