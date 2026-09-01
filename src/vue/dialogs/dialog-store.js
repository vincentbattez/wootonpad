import { reactive } from 'vue';

// The shared dialog store: it holds which dialogs are open and the data each one was handed.
// A null slice means the dialog is closed. Every dialog reads its own slice reactively and owns
// its form state; opening and closing go through the functions below rather than a component ref.
export const dialogStore = reactive({
  popover: null,        // { project, anchorEl, cbs }
  newSession: null,     // { project, effective, onStart }
  resumeSession: null,  // { session, effective, onResume }
  addProject: null,     // { onAdd }
  area: null,           // { id, name, cbs }
});

export function openPopover(project, anchorEl, cbs) {
  dialogStore.popover = { project, anchorEl, cbs: cbs || {} };
}
export function closePopover() { dialogStore.popover = null; }

export function openNewSession(project, effective, onStart) {
  dialogStore.newSession = { project, effective, onStart };
}
export function closeNewSession() { dialogStore.newSession = null; }

export function openResumeSession(session, effective, onResume) {
  dialogStore.resumeSession = { session, effective, onResume };
}
export function closeResumeSession() { dialogStore.resumeSession = null; }

export function openAddProject(onAdd) {
  dialogStore.addProject = { onAdd };
}
export function closeAddProject() { dialogStore.addProject = null; }

export function openAreaDialog(area, cbs) {
  dialogStore.area = { id: area.id, name: area.name, cbs: cbs || {} };
}
export function closeAreaDialog() { dialogStore.area = null; }
