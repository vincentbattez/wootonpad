import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSidebarBridge } from '../src/vue/bridge.js';
import { store, sessionsStore, headerStore } from '../src/vue/store.js';

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
  assert.equal(sessionsStore.projects.length, 2);
  // Copied, not aliased: mutating the input must not reach into the store.
  assert.notEqual(sessionsStore.projects[0], input[0]);
  bridge.setProjects([]);
});

test('setProjects copies each Session row so an in-place legacy update reaches the next render', () => {
  const bridge = createSidebarBridge(store);
  // app.js dedup() keeps one object per Session and Object.assign()s fresh rows onto it.
  const row = { sessionId: 's1', contextUsage: null, messageCount: 1 };
  const input = [{ projectPath: '/a', sessions: [row] }];
  bridge.setProjects(input);
  const first = sessionsStore.projects[0].sessions[0];
  assert.notEqual(first, row);
  assert.equal(first.contextUsage, null);

  Object.assign(row, { contextUsage: { inputTokens: 5 }, messageCount: 2 });
  bridge.setProjects(input);
  const second = sessionsStore.projects[0].sessions[0];
  // A new identity per refresh is what makes SessionItem re-render with the fresh row.
  assert.notEqual(second, first);
  assert.deepEqual(second.contextUsage, { inputTokens: 5 });
  assert.equal(second.messageCount, 2);
  bridge.setProjects([]);
});

test('setActivePtyIds replaces the running set', () => {
  const bridge = createSidebarBridge(store);
  bridge.setActivePtyIds(['p1', 'p2']);
  assert.deepEqual([...sessionsStore.activePtyIds], ['p1', 'p2']);
  bridge.setActivePtyIds([]);
});

test('setBusy adds and removes from the busy map', () => {
  const bridge = createSidebarBridge(store);
  bridge.setBusy('s1', true);
  assert.equal(sessionsStore.sessionBusyState.get('s1'), true);
  bridge.setBusy('s1', false);
  assert.equal(sessionsStore.sessionBusyState.has('s1'), false);
});

test('setResponseReady marks ready and clears busy', () => {
  const bridge = createSidebarBridge(store);
  bridge.setBusy('s3', true);
  bridge.setResponseReady('s3');
  assert.equal(sessionsStore.responseReadySessions.has('s3'), true);
  assert.equal(sessionsStore.sessionBusyState.has('s3'), false);
  bridge.clearNotifications('s3');
});

test('clearNotifications clears attention and response-ready', () => {
  const bridge = createSidebarBridge(store);
  bridge.addAttention('s4');
  bridge.setResponseReady('s4');
  bridge.clearNotifications('s4');
  assert.equal(sessionsStore.attentionSessions.has('s4'), false);
  assert.equal(sessionsStore.responseReadySessions.has('s4'), false);
});

test('the header setters coerce falsy to null and clearHeader resets them', () => {
  const bridge = createSidebarBridge(store);
  bridge.setHeaderSession({ id: 's' });
  bridge.setHeaderPtyTitle('');
  bridge.setHeaderAccount('acme');
  assert.deepEqual(headerStore.headerSession, { id: 's' });
  assert.equal(headerStore.headerPtyTitle, null);
  assert.equal(headerStore.headerAccount, 'acme');
  bridge.clearHeader();
  assert.equal(headerStore.headerSession, null);
  assert.equal(headerStore.headerAccount, null);
});
