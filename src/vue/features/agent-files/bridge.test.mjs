import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentFilesBridge } from './bridge.js';

// The agent-files Feature's Bridge writes into a store object, never into a component ref.
// A plain object stands in for the reactive store — the contract is the writes, not Vue.
// It carries the frozen renderer's two globals (window.vuePlans, window.vueMemory) as one
// object per surface, so the legacy method sets stay byte-identical while one Feature owns them.
function makeStore() {
  return {
    plans: [],
    activePlan: null,
    memory: { global: { files: [] }, projects: [] },
    memoryFilterIds: null,
    activeMemoryFile: null,
  };
}

test('plans.setPlans replaces the list', () => {
  const store = makeStore();
  const { plans } = createAgentFilesBridge(store);
  plans.setPlans([{ filename: 'a.md' }, { filename: 'b.md' }]);
  assert.equal(store.plans.length, 2);
});

test('plans.setActive and clearActive move the highlight', () => {
  const store = makeStore();
  const { plans } = createAgentFilesBridge(store);
  plans.setActive('a.md');
  assert.equal(store.activePlan, 'a.md');
  plans.clearActive();
  assert.equal(store.activePlan, null);
});

test('memory.setMemories writes the tree and resets the filter', () => {
  const store = makeStore();
  const { memory } = createAgentFilesBridge(store);
  store.memoryFilterIds = new Set(['stale']);
  const data = { global: { files: [{ filePath: '/g' }] }, projects: [] };
  memory.setMemories(data);
  assert.equal(store.memory, data);
  assert.equal(store.memoryFilterIds, null);
});

test('memory.setMemories keeps a passed filter', () => {
  const store = makeStore();
  const { memory } = createAgentFilesBridge(store);
  const ids = new Set(['/g']);
  memory.setMemories({ global: { files: [] }, projects: [] }, ids);
  assert.equal(store.memoryFilterIds, ids);
});

test('memory.setFilter, setActive and clearActive move filter and highlight', () => {
  const store = makeStore();
  const { memory } = createAgentFilesBridge(store);
  const ids = new Set(['/a']);
  memory.setFilter(ids);
  assert.equal(store.memoryFilterIds, ids);
  memory.setActive('/a');
  assert.equal(store.activeMemoryFile, '/a');
  memory.clearActive();
  assert.equal(store.activeMemoryFile, null);
});
