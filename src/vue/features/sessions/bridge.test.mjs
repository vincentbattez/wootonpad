import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionsBridge } from './bridge.js';

// The sessions Feature's Bridge writes into a store object, never into a component ref.
// A plain object stands in for the reactive store — the contract is the writes, not Vue.
function makeStore() {
  return {
    projects: [],
    activePtyIds: new Set(),
    activeSessionId: null,
    sessionBusyState: new Map(),
    attentionSessions: new Set(),
    responseReadySessions: new Set(),
    headerSession: null,
    headerPtyTitle: null,
    headerShellProfile: null,
    headerAccount: null,
  };
}

test('setProjects copies each project into the store', () => {
  const store = makeStore();
  const bridge = createSessionsBridge(store);
  const input = [{ projectPath: '/a' }, { projectPath: '/b' }];
  bridge.setProjects(input);
  assert.equal(store.projects.length, 2);
  // Copied, not aliased: mutating the input must not reach into the store.
  assert.notEqual(store.projects[0], input[0]);
});

test('setActivePtyIds replaces the running set', () => {
  const store = makeStore();
  const bridge = createSessionsBridge(store);
  bridge.setActivePtyIds(['p1', 'p2']);
  assert.deepEqual([...store.activePtyIds], ['p1', 'p2']);
});

test('setResponseReady marks ready and clears busy in one move', () => {
  const store = makeStore();
  const bridge = createSessionsBridge(store);
  bridge.setBusy('s1', true);
  bridge.setResponseReady('s1');
  assert.equal(store.responseReadySessions.has('s1'), true);
  assert.equal(store.sessionBusyState.has('s1'), false);
});

test('clearNotifications clears attention and response-ready together', () => {
  const store = makeStore();
  const bridge = createSessionsBridge(store);
  bridge.addAttention('s2');
  bridge.setResponseReady('s2');
  bridge.clearNotifications('s2');
  assert.equal(store.attentionSessions.has('s2'), false);
  assert.equal(store.responseReadySessions.has('s2'), false);
});

test('the header setters normalise empty values to null', () => {
  const store = makeStore();
  const bridge = createSessionsBridge(store);
  bridge.setHeaderSession({ sessionId: 's3' });
  bridge.setHeaderPtyTitle('');
  bridge.setHeaderShellProfile('zsh');
  bridge.setHeaderAccount(undefined);
  assert.deepEqual(store.headerSession, { sessionId: 's3' });
  assert.equal(store.headerPtyTitle, null);
  assert.equal(store.headerShellProfile, 'zsh');
  assert.equal(store.headerAccount, null);
});

test('clearHeader empties every header field', () => {
  const store = makeStore();
  const bridge = createSessionsBridge(store);
  bridge.setHeaderSession({ sessionId: 's4' });
  bridge.setHeaderPtyTitle('build');
  bridge.setHeaderShellProfile('bash');
  bridge.setHeaderAccount('work');
  bridge.clearHeader();
  assert.equal(store.headerSession, null);
  assert.equal(store.headerPtyTitle, null);
  assert.equal(store.headerShellProfile, null);
  assert.equal(store.headerAccount, null);
});
