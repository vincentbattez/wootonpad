import { reactive } from 'vue';

// Which dialogs are open and the data each was handed; a null slice means closed.
export const dialogStore = reactive({
  popover: null,        // { project, anchorEl, cbs }
  newSession: null,     // { project, effective, onStart }
  resumeSession: null,  // { session, effective, onResume }
  addProject: null,     // { onAdd }
  area: null,           // { id, name, cbs }
});

// Only the topmost open dialog answers a keystroke. Enter skips the popover,
// which has no primary action, so it reaches the dialog underneath.
const ESCAPE_ORDER = ['popover', 'newSession', 'resumeSession', 'addProject', 'area'];
const ENTER_ORDER = ['newSession', 'resumeSession', 'addProject', 'area'];

export function topDialogFor(key) {
  const order = key === 'Enter' ? ENTER_ORDER : ESCAPE_ORDER;
  return order.find(name => dialogStore[name]) || null;
}

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
