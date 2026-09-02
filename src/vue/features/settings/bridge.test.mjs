import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsBridge } from './bridge.js';

// The settings Feature's Bridge writes into a store object, never into a component ref.
// A plain object stands in for the reactive store — the contract is the writes, not Vue.
function makeStore() {
  return { settingsOpen: false, settingsScope: 'global', settingsProjectPath: null };
}

test('open for the global scope sets the scope and clears the project path', () => {
  const store = makeStore();
  const bridge = createSettingsBridge(store);
  bridge.open('global');
  assert.equal(store.settingsScope, 'global');
  assert.equal(store.settingsProjectPath, null);
  assert.equal(store.settingsOpen, true);
});

test('open for a Project records the scope and path', () => {
  const store = makeStore();
  const bridge = createSettingsBridge(store);
  bridge.open('project', '/repo/app');
  assert.equal(store.settingsScope, 'project');
  assert.equal(store.settingsProjectPath, '/repo/app');
  assert.equal(store.settingsOpen, true);
});

test('open defaults a missing scope to global', () => {
  const store = makeStore();
  const bridge = createSettingsBridge(store);
  bridge.open();
  assert.equal(store.settingsScope, 'global');
  assert.equal(store.settingsProjectPath, null);
});

test('close leaves the scope and path alone and only closes', () => {
  const store = makeStore();
  const bridge = createSettingsBridge(store);
  bridge.open('project', '/repo/app');
  bridge.close();
  assert.equal(store.settingsOpen, false);
  assert.equal(store.settingsScope, 'project');
  assert.equal(store.settingsProjectPath, '/repo/app');
});
