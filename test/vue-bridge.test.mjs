import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSidebarBridge } from '../src/vue/bridge.js';
import { store, sessions, sidebar, header } from '../src/vue/store.js';

// The single bridge module writes into the store slices, not into a component
// through a template ref. These assert the store-writing surface app.js calls.

test('createSidebarBridge exposes the store it writes to', () => {
  const bridge = createSidebarBridge(store);
  assert.equal(bridge.store, store);
});

test('setProjects copies each project into the sessions slice', () => {
  const bridge = createSidebarBridge(store);
  const input = [{ projectPath: '/a' }, { projectPath: '/b' }];
  bridge.setProjects(input);
  assert.equal(sessions.projects.length, 2);
  // Copied, not aliased: mutating the input must not reach into the store.
  assert.notEqual(sessions.projects[0], input[0]);
  bridge.setProjects([]);
});

test('setActivePtyIds replaces the running set', () => {
  const bridge = createSidebarBridge(store);
  bridge.setActivePtyIds(['p1', 'p2']);
  assert.deepEqual([...sessions.activePtyIds], ['p1', 'p2']);
  bridge.setActivePtyIds([]);
});

test('setBusy adds and removes from the busy map', () => {
  const bridge = createSidebarBridge(store);
  bridge.setBusy('s1', true);
  assert.equal(sessions.sessionBusyState.get('s1'), true);
  bridge.setBusy('s1', false);
  assert.equal(sessions.sessionBusyState.has('s1'), false);
});

test('setResponseReady marks ready and clears busy', () => {
  const bridge = createSidebarBridge(store);
  bridge.setBusy('s3', true);
  bridge.setResponseReady('s3');
  assert.equal(sessions.responseReadySessions.has('s3'), true);
  assert.equal(sessions.sessionBusyState.has('s3'), false);
  bridge.clearNotifications('s3');
});

test('clearNotifications clears attention and response-ready', () => {
  const bridge = createSidebarBridge(store);
  bridge.addAttention('s4');
  bridge.setResponseReady('s4');
  bridge.clearNotifications('s4');
  assert.equal(sessions.attentionSessions.has('s4'), false);
  assert.equal(sessions.responseReadySessions.has('s4'), false);
});

test('setFilters only writes the keys it is given', () => {
  const bridge = createSidebarBridge(store);
  sidebar.showStarredOnly = true;
  bridge.setFilters({ showRunningOnly: true });
  assert.equal(sidebar.showRunningOnly, true);
  assert.equal(sidebar.showStarredOnly, true, 'an omitted filter is left untouched');
  sidebar.showStarredOnly = false;
  sidebar.showRunningOnly = false;
});

test('setSearch writes both match sets', () => {
  const bridge = createSidebarBridge(store);
  bridge.setSearch(['a'], ['/p']);
  assert.deepEqual(sidebar.searchMatchIds, ['a']);
  assert.deepEqual(sidebar.searchMatchProjectPaths, ['/p']);
  bridge.setSearch(null, null);
});

test('the header setters coerce falsy to null and clearHeader resets them', () => {
  const bridge = createSidebarBridge(store);
  bridge.setHeaderSession({ id: 's' });
  bridge.setHeaderPtyTitle('');
  bridge.setHeaderAccount('acme');
  assert.deepEqual(header.headerSession, { id: 's' });
  assert.equal(header.headerPtyTitle, null);
  assert.equal(header.headerAccount, 'acme');
  bridge.clearHeader();
  assert.equal(header.headerSession, null);
  assert.equal(header.headerAccount, null);
});
