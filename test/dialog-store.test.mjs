import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dialogStore,
  openNewSession, closeNewSession,
  openResumeSession, closeResumeSession,
  openAddProject, closeAddProject,
  openAreaDialog, closeAreaDialog,
  openPopover, closePopover,
  topDialogFor,
} from '../src/vue/dialogs/dialog-store.js';

// The store carries the open state and the data handed to each dialog. Null means closed.
// Each open() writes exactly one slice; close() clears it and nothing else.

function assertAllClosed() {
  assert.equal(dialogStore.popover, null);
  assert.equal(dialogStore.newSession, null);
  assert.equal(dialogStore.resumeSession, null);
  assert.equal(dialogStore.addProject, null);
  assert.equal(dialogStore.area, null);
}

test('every dialog starts closed', () => {
  assertAllClosed();
});

test('new Session carries its project, effective options and start callback', () => {
  const project = { projectPath: '/p' };
  const effective = { permissionMode: 'plan' };
  const onStart = () => {};
  openNewSession(project, effective, onStart);
  assert.deepEqual(dialogStore.newSession.project, project);
  assert.deepEqual(dialogStore.newSession.effective, effective);
  assert.equal(dialogStore.newSession.onStart, onStart);
  closeNewSession();
  assertAllClosed();
});

test('resume Session carries its session, effective options and resume callback', () => {
  const session = { sessionId: 'abc' };
  const effective = { chrome: true };
  const onResume = () => {};
  openResumeSession(session, effective, onResume);
  assert.deepEqual(dialogStore.resumeSession.session, session);
  assert.deepEqual(dialogStore.resumeSession.effective, effective);
  assert.equal(dialogStore.resumeSession.onResume, onResume);
  closeResumeSession();
  assertAllClosed();
});

test('add Project carries its add callback', () => {
  const onAdd = () => {};
  openAddProject(onAdd);
  assert.equal(dialogStore.addProject.onAdd, onAdd);
  closeAddProject();
  assertAllClosed();
});

test('the Area dialog carries the area id, name and its callbacks', () => {
  const cbs = { onRename() {}, onDelete() {} };
  openAreaDialog({ id: 7, name: 'Backend', extra: 'ignored' }, cbs);
  assert.equal(dialogStore.area.id, 7);
  assert.equal(dialogStore.area.name, 'Backend');
  assert.deepEqual(dialogStore.area.cbs, cbs);
  closeAreaDialog();
  assertAllClosed();
});

test('the popover carries its project, anchor and callbacks, defaulting callbacks to an object', () => {
  const project = { projectPath: '/p' };
  const anchor = {};
  openPopover(project, anchor);
  assert.deepEqual(dialogStore.popover.project, project);
  assert.deepEqual(dialogStore.popover.anchorEl, anchor);
  assert.deepEqual(dialogStore.popover.cbs, {});
  closePopover();
  assertAllClosed();
});

// Only the topmost dialog answers a keystroke, in the order the single document
// listener used to walk. Enter skips the popover, which has no primary action.
test('Escape goes to the topmost open dialog', () => {
  openAreaDialog({ id: 'a', name: 'A' });
  assert.equal(topDialogFor('Escape'), 'area');
  openResumeSession({}, {}, () => {});
  assert.equal(topDialogFor('Escape'), 'resumeSession');
  openPopover({}, null, {});
  assert.equal(topDialogFor('Escape'), 'popover');
  closePopover();
  closeResumeSession();
  closeAreaDialog();
});

test('Enter skips the popover and reaches the dialog underneath', () => {
  openNewSession({}, {}, () => {});
  openPopover({}, null, {});
  assert.equal(topDialogFor('Escape'), 'popover');
  assert.equal(topDialogFor('Enter'), 'newSession');
  closePopover();
  closeNewSession();
});

test('no open dialog answers either key', () => {
  assertAllClosed();
  assert.equal(topDialogFor('Escape'), null);
  assert.equal(topDialogFor('Enter'), null);
});
