import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAreasBridge } from './bridge.js';

// The areas Feature's Bridge writes into a store object, never into a component ref.
// A plain object stands in for the reactive store — the contract is the writes, not Vue.
function makeStore() {
  return {
    areas: [],
    areaAssignments: [],
    renamingAreaId: null,
    renamingProjectPath: null,
  };
}

test('mergeAreas keeps a locally-created Area the fetch did not yet know about', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  // An Area created while the load was in flight — absent from the fetched set — must survive.
  store.areas = [{ id: 'local', name: 'New Area' }];
  bridge.mergeAreas([{ id: 'a', name: 'Backend' }, { id: 'b', name: 'Infra' }]);
  assert.deepEqual(store.areas.map(a => a.id), ['a', 'b', 'local']);
});

test('mergeAreas drops a stale local copy the fetch now owns', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  store.areas = [{ id: 'a', name: 'stale' }];
  bridge.mergeAreas([{ id: 'a', name: 'fresh' }]);
  assert.deepEqual(store.areas, [{ id: 'a', name: 'fresh' }]);
});

test('setAssignments replaces the whole assignment list', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  bridge.setAssignments([{ projectPath: '/p', areaId: 'a' }]);
  assert.deepEqual(store.areaAssignments, [{ projectPath: '/p', areaId: 'a' }]);
});

test('setTree replaces areas and assignments together', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  bridge.setTree([{ id: 'a' }], [{ projectPath: '/p', areaId: 'a' }]);
  assert.deepEqual(store.areas, [{ id: 'a' }]);
  assert.deepEqual(store.areaAssignments, [{ projectPath: '/p', areaId: 'a' }]);
});

test('addArea appends the created Area', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  store.areas = [{ id: 'a' }];
  bridge.addArea({ id: 'b', name: 'New Area' });
  assert.deepEqual(store.areas.map(a => a.id), ['a', 'b']);
});

test('renameArea rewrites just the matching Area name', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  store.areas = [{ id: 'a', name: 'old' }, { id: 'b', name: 'keep' }];
  bridge.renameArea('a', 'new');
  assert.deepEqual(store.areas.map(a => a.name), ['new', 'keep']);
});

test('renameArea is a no-op when the id is unknown', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  store.areas = [{ id: 'a', name: 'old' }];
  bridge.renameArea('missing', 'new');
  assert.equal(store.areas[0].name, 'old');
});

test('setCollapsed writes the collapse flag onto the matching Area', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  store.areas = [{ id: 'a', collapsed: 0 }];
  bridge.setCollapsed('a', 1);
  assert.equal(store.areas[0].collapsed, 1);
});

test('moveAreaResult re-parents and re-positions just the moved Area', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  store.areas = [{ id: 'a', parentId: null, position: 0 }, { id: 'b', parentId: null, position: 1 }];
  bridge.moveAreaResult('b', 'a', 3);
  assert.deepEqual(store.areas.find(a => a.id === 'b'), { id: 'b', parentId: 'a', position: 3 });
  // The other Area is untouched.
  assert.deepEqual(store.areas.find(a => a.id === 'a'), { id: 'a', parentId: null, position: 0 });
});

test('startRename and stopRename toggle the inline-rename target', () => {
  const store = makeStore();
  const bridge = createAreasBridge(store);
  bridge.startRename('a');
  assert.equal(store.renamingAreaId, 'a');
  bridge.stopRename();
  assert.equal(store.renamingAreaId, null);
});
