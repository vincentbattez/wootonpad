import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effect } from 'vue';
import { store, slices, sessionsStore, sidebarStore, areasStore, layoutStore, headerStore, avatarsStore } from '../src/vue/store.js';

// The flat store the bridge used to write is cut into feature slices, but the
// aggregate exposed as window.vueStore must keep every field name so the frozen
// public/app.js keeps addressing them.

// Which slice owns which field. The whole point of the split is that this
// mapping exists and is legible.
const OWNERSHIP = {
  sessionsStore: [
    'projects', 'activePtyIds', 'activeSessionId', 'sessionBusyState',
    'attentionSessions', 'responseReadySessions', 'lastActivityTime', 'pendingSessions',
  ],
  sidebarStore: [
    'showStarredOnly', 'showRunningOnly', 'showTodayOnly', 'searchMatchIds',
    'searchMatchProjectPaths', 'collapsedProjects', 'visibleSessionCount',
    'sessionMaxAgeDays', 'searchQuery', 'searchTitlesOnly',
  ],
  areasStore: ['areas', 'areaAssignments', 'renamingAreaId', 'renamingProjectPath'],
  layoutStore: [
    'activeTab', 'sidebarCollapsed', 'loadingStatus', 'accountSwitching',
    'settingsOpen', 'settingsScope', 'settingsProjectPath', 'showStats',
    'showJsonl', 'planViewerOpen', 'memoryViewerOpen', 'gridViewActive', 'gridViewerCount',
  ],
  headerStore: ['headerSession', 'headerPtyTitle', 'headerShellProfile', 'headerAccount', 'headerAccounts'],
  avatarsStore: ['avatarDataUrls', 'areaAvatarDataUrls'],
};

const ALL_FIELDS = Object.values(OWNERSHIP).flat();

test('the aggregate exposes every original store field by name', () => {
  for (const field of ALL_FIELDS) {
    assert.ok(field in store, `store is missing field ${field}`);
  }
  // And exposes nothing extra — a stray field would be an un-owned piece of state.
  assert.deepEqual(new Set(Object.keys(store)), new Set(ALL_FIELDS));
});

test('each field is owned by exactly its slice', () => {
  for (const [sliceName, fields] of Object.entries(OWNERSHIP)) {
    const slice = slices[sliceName];
    for (const field of fields) {
      assert.ok(field in slice, `${sliceName} should own ${field}`);
    }
    // The slice owns only its own fields.
    assert.deepEqual(new Set(Object.keys(slice)), new Set(fields));
  }
});

test('reading through the facade returns the slice value', () => {
  layoutStore.activeTab = 'plans';
  assert.equal(store.activeTab, 'plans');
  layoutStore.activeTab = 'sessions';
});

test('writing through the facade writes to the owning slice', () => {
  store.activeTab = 'stats';
  assert.equal(layoutStore.activeTab, 'stats');
  store.activeTab = 'sessions';

  store.projects = [{ projectPath: '/x' }];
  assert.equal(sessionsStore.projects[0].projectPath, '/x');
  store.projects = [];
});

test('a facade write triggers effects that read the slice', () => {
  let seen;
  const stop = effect(() => { seen = layoutStore.showStats; });
  assert.equal(seen, false);
  store.showStats = true;
  assert.equal(seen, true, 'effect reading the slice saw the facade write');
  store.showStats = false;
  stop.effect.stop();
});

test('a slice write triggers effects that read the facade', () => {
  let seen;
  const stop = effect(() => { seen = store.loadingStatus; });
  assert.equal(seen, '');
  layoutStore.loadingStatus = 'Loading…';
  assert.equal(seen, 'Loading…', 'effect reading the facade saw the slice write');
  layoutStore.loadingStatus = '';
  stop.effect.stop();
});

test('Set fields mutate in place through the facade and stay reactive', () => {
  let size;
  const stop = effect(() => { size = store.attentionSessions.size; });
  assert.equal(size, 0);
  store.attentionSessions.add('s1');
  assert.equal(sessionsStore.attentionSessions.has('s1'), true);
  assert.equal(size, 1, 'mutating the Set through the facade triggered the effect');
  store.attentionSessions.delete('s1');
  stop.effect.stop();
});

test('Map fields mutate in place through the facade and stay reactive', () => {
  let busy;
  const stop = effect(() => { busy = store.sessionBusyState.has('s2'); });
  assert.equal(busy, false);
  store.sessionBusyState.set('s2', true);
  assert.equal(busy, true);
  store.sessionBusyState.delete('s2');
  assert.equal(busy, false);
  stop.effect.stop();
});

test('the named slice exports are the same objects the facade delegates to', () => {
  assert.equal(slices.sessionsStore, sessionsStore);
  assert.equal(slices.sidebarStore, sidebarStore);
  assert.equal(slices.areasStore, areasStore);
  assert.equal(slices.layoutStore, layoutStore);
  assert.equal(slices.headerStore, headerStore);
  assert.equal(slices.avatarsStore, avatarsStore);
});
