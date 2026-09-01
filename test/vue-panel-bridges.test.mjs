import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effect, markRaw } from 'vue';
import {
  createPlansBridge,
  createMemoryBridge,
  createAccountsBridge,
  createAccountDropdownBridge,
  createGridBridge,
  createProjectsBridge,
  createJsonlViewerBridge,
  createAppBridge,
} from '../src/vue/bridge.js';
import { plansStore } from '../src/vue/stores/plans.js';
import { memoryStore } from '../src/vue/stores/memory.js';
import { accountsStore } from '../src/vue/stores/accounts.js';
import { accountDropdownStore } from '../src/vue/stores/account-dropdown.js';
import { gridStore } from '../src/vue/stores/grid.js';
import { projectsStore } from '../src/vue/stores/projects.js';
import { jsonlStore } from '../src/vue/stores/jsonl.js';
import { store } from '../src/vue/store.js';

// The panel bridges invert the old template-ref setters: every method writes a
// feature store the panel reads reactively, instead of calling into a component
// through defineExpose. The method names and signatures are the frozen contract
// app.js calls (window.vuePlans, window.vueMemory, …).

test('plans bridge writes the plans list and active plan into the store', () => {
  const bridge = createPlansBridge(plansStore);
  const list = [{ filename: 'a.md' }, { filename: 'b.md' }];
  bridge.setPlans(list);
  assert.deepEqual(plansStore.plans, list);
  bridge.setActive('a.md');
  assert.equal(plansStore.activePlan, 'a.md');
  bridge.clearActive();
  assert.equal(plansStore.activePlan, null);
  bridge.setPlans([]);
});

test('a plans-store write triggers effects that read the store', () => {
  const bridge = createPlansBridge(plansStore);
  let seen;
  const stop = effect(() => { seen = plansStore.activePlan; });
  assert.equal(seen, null);
  bridge.setActive('c.md');
  assert.equal(seen, 'c.md', 'effect reading the store saw the bridge write');
  bridge.clearActive();
  stop.effect.stop();
});

test('memory bridge writes data, filter ids and active file', () => {
  const bridge = createMemoryBridge(memoryStore);
  const data = { global: { files: [{ filePath: '/g' }] }, projects: [] };
  const ids = new Set(['/g']);
  bridge.setMemories(data, ids);
  assert.deepEqual(memoryStore.data, data);
  assert.deepEqual([...memoryStore.filterIds], [...ids]);
  bridge.setFilter(null);
  assert.equal(memoryStore.filterIds, null);
  bridge.setActive('/g');
  assert.equal(memoryStore.activeFile, '/g');
  bridge.clearActive();
  assert.equal(memoryStore.activeFile, null);
});

test('memory setMemories defaults the filter ids to null', () => {
  const bridge = createMemoryBridge(memoryStore);
  bridge.setFilter(new Set(['x']));
  bridge.setMemories({ global: { files: [] }, projects: [] });
  assert.equal(memoryStore.filterIds, null);
});

test('accounts bridge sets the list, active id and usage', () => {
  const bridge = createAccountsBridge(accountsStore);
  const list = [{ id: 'default' }, { id: 'work' }];
  bridge.setAccounts(list, 'work');
  assert.deepEqual(accountsStore.accounts, list);
  assert.equal(accountsStore.activeAccountId, 'work');
  bridge.setActiveAccount('default');
  assert.equal(accountsStore.activeAccountId, 'default');
  bridge.setUsage({ work: { session: 20 } });
  assert.equal(accountsStore.usage.work.session, 20);
});

test('accounts setAccounts leaves the active id untouched when omitted', () => {
  const bridge = createAccountsBridge(accountsStore);
  bridge.setActiveAccount('work');
  bridge.setAccounts([{ id: 'work' }]);
  assert.equal(accountsStore.activeAccountId, 'work', 'an omitted active id is left as-is');
  bridge.setActiveAccount('default');
});

test('accounts setUsage copies the object rather than aliasing it', () => {
  const bridge = createAccountsBridge(accountsStore);
  const input = { a: 1 };
  bridge.setUsage(input);
  assert.notEqual(accountsStore.usage, input);
  assert.deepEqual(accountsStore.usage, input);
});

test('account-dropdown bridge sets list, active id, usage and closes', () => {
  const bridge = createAccountDropdownBridge(accountDropdownStore);
  bridge.setAccounts([{ id: 'work' }], 'work', { work: { session: 5 } });
  assert.deepEqual(accountDropdownStore.accounts, [{ id: 'work' }]);
  assert.equal(accountDropdownStore.activeAccountId, 'work');
  assert.equal(accountDropdownStore.usage.work.session, 5);
  accountDropdownStore.open = true;
  bridge.close();
  assert.equal(accountDropdownStore.open, false);
});

test('account-dropdown setAccounts leaves active id and usage untouched when omitted', () => {
  const bridge = createAccountDropdownBridge(accountDropdownStore);
  bridge.setActiveAccount('work');
  bridge.setUsage({ work: 1 });
  bridge.setAccounts([{ id: 'work' }]);
  assert.equal(accountDropdownStore.activeAccountId, 'work');
  assert.deepEqual(accountDropdownStore.usage, { work: 1 });
  bridge.setActiveAccount('default');
});

// The status-bar bridge lives in its own Feature now; its contract is asserted
// in src/vue/features/status-bar/bridge.test.mjs.

// The grid bridge inverts GridCardsApp's addCard/updateCard/removeCard/clearAll
// setters: each mutates the store's card Map, which the component teleports from.
test('grid bridge adds a card into the store map', () => {
  const bridge = createGridBridge(gridStore);
  // Real callers pass DOM elements, which Vue keeps raw; markRaw mirrors that so
  // the stored reference is the one we handed in.
  const header = markRaw({}), footer = markRaw({});
  bridge.addCard('s1', header, footer, { name: 'Sess', project: 'proj', initials: 'SP', color: '#000', running: 1, busy: 0, time: '2m' });
  const card = gridStore.cards.get('s1');
  assert.equal(card.name, 'Sess');
  assert.equal(card.headerEl, header);
  assert.equal(card.footerEl, footer);
  assert.equal(card.running, true);
  assert.equal(card.busy, false);
  assert.equal(card.time, '2m');
  bridge.clearAll();
});

test('grid updateCard mutates an existing card and ignores unknown ids', () => {
  const bridge = createGridBridge(gridStore);
  bridge.addCard('s1', {}, {}, { name: 'A', project: 'p', initials: 'A', color: '#000' });
  bridge.updateCard('s1', true, true, '5m');
  const card = gridStore.cards.get('s1');
  assert.equal(card.running, true);
  assert.equal(card.busy, true);
  assert.equal(card.time, '5m');
  // Unknown id is a no-op, not a throw
  bridge.updateCard('missing', true, false);
  assert.equal(gridStore.cards.has('missing'), false);
  bridge.clearAll();
});

test('grid updateCard leaves time untouched when omitted', () => {
  const bridge = createGridBridge(gridStore);
  bridge.addCard('s1', {}, {}, { name: 'A', project: 'p', initials: 'A', color: '#000', time: '1m' });
  bridge.updateCard('s1', false, false);
  assert.equal(gridStore.cards.get('s1').time, '1m');
  bridge.clearAll();
});

test('grid removeCard and clearAll empty the store map', () => {
  const bridge = createGridBridge(gridStore);
  bridge.addCard('s1', {}, {}, { name: 'A', project: 'p', initials: 'A', color: '#000' });
  bridge.addCard('s2', {}, {}, { name: 'B', project: 'p', initials: 'B', color: '#000' });
  bridge.removeCard('s1');
  assert.equal(gridStore.cards.has('s1'), false);
  assert.equal(gridStore.cards.has('s2'), true);
  bridge.clearAll();
  assert.equal(gridStore.cards.size, 0);
});

test('a grid-store write triggers effects that read the map', () => {
  const bridge = createGridBridge(gridStore);
  let seen;
  const stop = effect(() => { seen = gridStore.cards.size; });
  assert.equal(seen, 0);
  bridge.addCard('s1', {}, {}, { name: 'A', project: 'p', initials: 'A', color: '#000' });
  assert.equal(seen, 1, 'effect reading the map saw the bridge write');
  bridge.clearAll();
  stop.effect.stop();
});

// The projects bridge inverts ProjectsApp's setProjects/setSearch/clearActive/
// updateProjectInfo setters. It writes the projects feature store; the
// per-project info fetch (a side effect of setProjects) lives here now, guarded
// so it is a no-op when window.api is absent (as in this test environment).
test('projects bridge writes the project list', () => {
  const bridge = createProjectsBridge(projectsStore);
  const list = [{ projectPath: '/a', sessions: [] }, { projectPath: '/b', sessions: [] }];
  bridge.setProjects(list);
  assert.deepEqual(projectsStore.projects, list);
});

test('projects setSearch coerces null to an empty string', () => {
  const bridge = createProjectsBridge(projectsStore);
  bridge.setSearch('foo');
  assert.equal(projectsStore.searchQuery, 'foo');
  bridge.setSearch(null);
  assert.equal(projectsStore.searchQuery, '');
});

test('projects clearActive nulls the active path', () => {
  const bridge = createProjectsBridge(projectsStore);
  projectsStore.activeProjectPath = '/a';
  bridge.clearActive();
  assert.equal(projectsStore.activeProjectPath, null);
});

// The jsonl-viewer bridge inverts JsonlViewerApp's defineExpose({ open }): it
// writes an open request into the store, which the component watches and renders,
// instead of the bridge calling a template-ref method.
test('jsonl-viewer bridge writes the session as an open request', () => {
  const bridge = createJsonlViewerBridge(jsonlStore);
  const session = { sessionId: 'abc', name: 'Sess' };
  bridge.open(session);
  assert.equal(jsonlStore.openRequest.session, session);
  jsonlStore.openRequest = null;
});

test('jsonl-viewer open bumps the seq so re-opening the same session re-triggers', () => {
  const bridge = createJsonlViewerBridge(jsonlStore);
  const session = { sessionId: 'abc' };
  bridge.open(session);
  const first = jsonlStore.openRequest.seq;
  bridge.open(session);
  assert.equal(jsonlStore.openRequest.seq, first + 1, 'seq advances on each open');
  jsonlStore.openRequest = null;
});

test('a jsonl-store write triggers effects that read the request', () => {
  const bridge = createJsonlViewerBridge(jsonlStore);
  let seen = 0;
  const stop = effect(() => { seen = jsonlStore.openRequest?.seq ?? 0; });
  assert.equal(seen, 0);
  bridge.open({ sessionId: 'x' });
  assert.equal(seen, jsonlStore.openRequest.seq, 'effect reading the request saw the bridge write');
  jsonlStore.openRequest = null;
  stop.effect.stop();
});

// The app bridge inverts window.vueApp.setTab off App.vue's onMounted closure:
// it writes the active tab into the aggregate store and clears the search, the
// same store fields the sidebar and header components render from.
test('app bridge setTab writes the active tab and clears the search', () => {
  const bridge = createAppBridge(store);
  store.activeTab = 'sessions';
  store.searchQuery = 'foo';
  store.searchMatchIds = new Set(['a']);
  store.searchMatchProjectPaths = new Set(['/p']);
  bridge.setTab('plans');
  assert.equal(store.activeTab, 'plans');
  assert.equal(store.searchQuery, '');
  assert.equal(store.searchMatchIds, null);
  assert.equal(store.searchMatchProjectPaths, null);
  store.activeTab = 'sessions';
});

test('app bridge setTab is a no-op when the tab is already active', () => {
  const bridge = createAppBridge(store);
  store.activeTab = 'plans';
  store.searchQuery = 'keep';
  bridge.setTab('plans');
  assert.equal(store.searchQuery, 'keep', 'same-tab setTab does not clear the search');
  store.activeTab = 'sessions';
  store.searchQuery = '';
});

test('projects updateProjectInfo merges info into the store', () => {
  const bridge = createProjectsBridge(projectsStore);
  bridge.updateProjectInfo('/a', { branch: 'main', added: 3 });
  assert.equal(projectsStore.projectInfo['/a'].branch, 'main');
  bridge.updateProjectInfo('/a', { added: 5 });
  assert.equal(projectsStore.projectInfo['/a'].branch, 'main', 'existing keys survive a merge');
  assert.equal(projectsStore.projectInfo['/a'].added, 5);
  delete projectsStore.projectInfo['/a'];
});
