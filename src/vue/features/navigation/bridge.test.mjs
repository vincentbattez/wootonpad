import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effect } from 'vue';
import { createNavigationBridge, switchTab } from './bridge.js';
import { navigationStore } from './store.js';

// The navigation Feature Bridge writes the navigation store the Containers read.
// The method names are the frozen contract: app.js calls window.vueSidebar.setSearch
// / .setFilters and window.vueApp.setTab.

test('setSearch writes both match sets into the store', () => {
  const bridge = createNavigationBridge(navigationStore);
  bridge.setSearch(['a'], ['/p']);
  assert.deepEqual(navigationStore.searchMatchIds, ['a']);
  assert.deepEqual(navigationStore.searchMatchProjectPaths, ['/p']);
  bridge.setSearch(null, null);
});

test('setFilters only writes the keys it is given', () => {
  const bridge = createNavigationBridge(navigationStore);
  navigationStore.showStarredOnly = true;
  bridge.setFilters({ showRunningOnly: true });
  assert.equal(navigationStore.showRunningOnly, true);
  assert.equal(navigationStore.showStarredOnly, true, 'an omitted filter is left untouched');
  navigationStore.showStarredOnly = false;
  navigationStore.showRunningOnly = false;
});

test('a store write triggers effects that read the store', () => {
  const bridge = createNavigationBridge(navigationStore);
  let seen;
  const stop = effect(() => { seen = navigationStore.showTodayOnly; });
  assert.equal(seen, false);
  bridge.setFilters({ showTodayOnly: true });
  assert.equal(seen, true, 'effect reading the store saw the bridge write');
  bridge.setFilters({ showTodayOnly: false });
  stop.effect.stop();
});

test('setTab writes the active tab and clears the search', () => {
  const bridge = createNavigationBridge(navigationStore);
  navigationStore.activeTab = 'sessions';
  navigationStore.searchQuery = 'foo';
  navigationStore.searchMatchIds = new Set(['a']);
  navigationStore.searchMatchProjectPaths = new Set(['/p']);
  bridge.setTab('plans');
  assert.equal(navigationStore.activeTab, 'plans');
  assert.equal(navigationStore.searchQuery, '');
  assert.equal(navigationStore.searchMatchIds, null);
  assert.equal(navigationStore.searchMatchProjectPaths, null);
  navigationStore.activeTab = 'sessions';
});

test('setTab is a no-op when the tab is already active', () => {
  const bridge = createNavigationBridge(navigationStore);
  navigationStore.activeTab = 'plans';
  navigationStore.searchQuery = 'keep';
  bridge.setTab('plans');
  assert.equal(navigationStore.searchQuery, 'keep', 'same-tab setTab does not clear the search');
  navigationStore.activeTab = 'sessions';
  navigationStore.searchQuery = '';
});

test('switchTab notifies app.js of the change through window.__sb', () => {
  const seen = [];
  const prevWindow = globalThis.window;
  globalThis.window = { __sb: { onTabChange: (t) => seen.push(t) } };
  try {
    navigationStore.activeTab = 'sessions';
    switchTab(navigationStore, 'stats');
    assert.deepEqual(seen, ['stats']);
    // Same-tab switch does not notify.
    switchTab(navigationStore, 'stats');
    assert.deepEqual(seen, ['stats']);
  } finally {
    globalThis.window = prevWindow;
    navigationStore.activeTab = 'sessions';
  }
});
