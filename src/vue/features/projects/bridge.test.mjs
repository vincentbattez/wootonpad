import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectsBridge } from './bridge.js';

// The projects Feature's Bridge writes into a store object, never into a component ref.
// A plain object stands in for the reactive store — the contract is the writes, not Vue.
function makeStore() {
  return {
    collapsedProjects: {},
    renamingProjectPath: null,
  };
}

test('startRename and stopRename toggle the inline-rename target', () => {
  const store = makeStore();
  const bridge = createProjectsBridge(store);
  bridge.startRename('/p/one');
  assert.equal(store.renamingProjectPath, '/p/one');
  bridge.stopRename();
  assert.equal(store.renamingProjectPath, null);
});

test('setCollapsed writes the collapse flag under the Project path', () => {
  const store = makeStore();
  const bridge = createProjectsBridge(store);
  bridge.setCollapsed('/p/one', true);
  assert.equal(store.collapsedProjects['/p/one'], true);
  bridge.setCollapsed('/p/one', false);
  assert.equal(store.collapsedProjects['/p/one'], false);
  // Other Projects are untouched.
  bridge.setCollapsed('/p/two', true);
  assert.deepEqual(store.collapsedProjects, { '/p/one': false, '/p/two': true });
});
