import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effect } from 'vue';
import { store, slices, sessionsStore, settingsStore, sidebarStore, areasStore, projectsStore, layoutStore, headerStore, avatarsStore, navigationStore } from '../src/vue/store.js';

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
  settingsStore: ['settingsOpen', 'settingsScope', 'settingsProjectPath'],
  sidebarStore: [
    'visibleSessionCount', 'sessionMaxAgeDays',
  ],
  areasStore: ['areas', 'areaAssignments', 'renamingAreaId'],
  projectsStore: ['collapsedProjects', 'renamingProjectPath'],
  layoutStore: [
    'loadingStatus', 'accountSwitching', 'showStats',
    'showJsonl', 'planViewerOpen', 'memoryViewerOpen', 'gridViewActive', 'gridViewerCount',
  ],
  headerStore: ['headerSession', 'headerPtyTitle', 'headerShellProfile', 'headerAccount', 'headerAccounts', 'headerContext'],
  avatarsStore: ['avatarDataUrls', 'areaAvatarDataUrls'],
  navigationStore: [
    'activeTab', 'sidebarCollapsed', 'searchQuery', 'searchTitlesOnly',
    'searchMatchIds', 'searchMatchProjectPaths',
    'showStarredOnly', 'showRunningOnly', 'showTodayOnly',
  ],
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
  navigationStore.activeTab = 'plans';
  assert.equal(store.activeTab, 'plans');
  navigationStore.activeTab = 'sessions';
});

test('writing through the facade writes to the owning slice', () => {
  store.activeTab = 'stats';
  assert.equal(navigationStore.activeTab, 'stats');
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
  assert.equal(slices.settingsStore, settingsStore);
  assert.equal(slices.sidebarStore, sidebarStore);
  assert.equal(slices.areasStore, areasStore);
  assert.equal(slices.projectsStore, projectsStore);
  assert.equal(slices.layoutStore, layoutStore);
  assert.equal(slices.headerStore, headerStore);
  assert.equal(slices.avatarsStore, avatarsStore);
  assert.equal(slices.navigationStore, navigationStore);
});
