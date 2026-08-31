import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effect } from 'vue';
import {
  createPlansBridge,
  createMemoryBridge,
  createAccountsBridge,
  createAccountDropdownBridge,
  createStatusBarBridge,
} from '../src/vue/bridge.js';
import { plansStore } from '../src/vue/stores/plans.js';
import { memoryStore } from '../src/vue/stores/memory.js';
import { accountsStore } from '../src/vue/stores/accounts.js';
import { accountDropdownStore } from '../src/vue/stores/account-dropdown.js';
import { statusBarStore } from '../src/vue/stores/status-bar.js';

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

test('status-bar bridge writes info immediately', () => {
  const bridge = createStatusBarBridge(statusBarStore);
  bridge.setInfo('3 sessions');
  assert.equal(statusBarStore.info, '3 sessions');
});

test('status-bar setActivity writes text and marks the done class', () => {
  const bridge = createStatusBarBridge(statusBarStore);
  bridge.setActivity('working', 'progress');
  assert.equal(statusBarStore.activity, 'working');
  assert.equal(statusBarStore.activityClass, '');
  bridge.setActivity('finished', 'done');
  assert.equal(statusBarStore.activity, 'finished');
  assert.equal(statusBarStore.activityClass, 'status-done');
});

test('status-bar setUpdater writes the updater text', () => {
  const bridge = createStatusBarBridge(statusBarStore);
  bridge.setUpdater('Downloading update…');
  assert.equal(statusBarStore.updater, 'Downloading update…');
});
