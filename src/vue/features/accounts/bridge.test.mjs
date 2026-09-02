import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountsBridge, createAccountDropdownBridge } from './bridge.js';

// The accounts Feature's Bridge writes into a store object, never into a component ref. A plain
// object stands in for the reactive store — the contract is the writes, not Vue. These are the
// method names and signatures the frozen renderer calls on window.vueAccounts and
// window.vueAccountDropdown.

test('accounts bridge sets the list, active id and usage', () => {
  const store = { accounts: [], activeAccountId: 'default', usage: {} };
  const bridge = createAccountsBridge(store);
  const list = [{ id: 'default' }, { id: 'work' }];
  bridge.setAccounts(list, 'work');
  assert.deepEqual(store.accounts, list);
  assert.equal(store.activeAccountId, 'work');
  bridge.setActiveAccount('default');
  assert.equal(store.activeAccountId, 'default');
  bridge.setUsage({ work: { session: 20 } });
  assert.equal(store.usage.work.session, 20);
});

test('accounts setAccounts leaves the active id untouched when omitted', () => {
  const store = { accounts: [], activeAccountId: 'work', usage: {} };
  const bridge = createAccountsBridge(store);
  bridge.setAccounts([{ id: 'work' }]);
  assert.equal(store.activeAccountId, 'work', 'an omitted active id is left as-is');
});

test('accounts setUsage copies the object rather than aliasing it', () => {
  const store = { accounts: [], activeAccountId: 'default', usage: {} };
  const bridge = createAccountsBridge(store);
  const input = { a: 1 };
  bridge.setUsage(input);
  assert.notEqual(store.usage, input);
  assert.deepEqual(store.usage, input);
});

test('account-dropdown bridge sets list, active id, usage and closes', () => {
  const store = { accounts: [], activeAccountId: 'default', usage: {}, open: false };
  const bridge = createAccountDropdownBridge(store);
  bridge.setAccounts([{ id: 'work' }], 'work', { work: { session: 5 } });
  assert.deepEqual(store.accounts, [{ id: 'work' }]);
  assert.equal(store.activeAccountId, 'work');
  assert.equal(store.usage.work.session, 5);
  store.open = true;
  bridge.close();
  assert.equal(store.open, false);
});

test('account-dropdown setAccounts leaves active id and usage untouched when omitted', () => {
  const store = { accounts: [], activeAccountId: 'default', usage: {}, open: false };
  const bridge = createAccountDropdownBridge(store);
  bridge.setActiveAccount('work');
  bridge.setUsage({ work: 1 });
  bridge.setAccounts([{ id: 'work' }]);
  assert.equal(store.activeAccountId, 'work');
  assert.deepEqual(store.usage, { work: 1 });
});
