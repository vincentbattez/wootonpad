import { test } from 'node:test';
import assert from 'node:assert/strict';
import { switcherGroups, activeHostAccountId, isGrouped, switcherChips } from './switcher.mjs';

// VIN-158: the account switcher lists Accounts grouped by Host, with a check on each Host's active
// Account. The grouping and the "which Account is active on this Host" rule are pure, so they are
// asserted here against hand-written expectations rather than read off a rendered dropdown.

const LOCAL = [{ id: 'default', name: 'Default' }, { id: 'acc-2', name: 'Work' }];

test('with no Remote Hosts the switcher stays a flat local list — no grouping, no noise', () => {
  assert.equal(isGrouped([]), false);
});

test('any Remote Host turns on Host grouping', () => {
  assert.equal(isGrouped([{ id: 'h1', name: 'Mini', accounts: [] }]), true);
});

test('the Local Host is always the first group, carrying the local accounts and active id', () => {
  const groups = switcherGroups({ accounts: LOCAL, activeAccountId: 'acc-2', hosts: [] });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].hostId, null);
  assert.equal(groups[0].name, 'Local Host');
  assert.deepEqual(groups[0].accounts, LOCAL);
  assert.equal(groups[0].activeAccountId, 'acc-2');
});

test('each Remote Host becomes its own group after the Local Host, in order', () => {
  const hosts = [
    { id: 'h1', name: 'Mini', accounts: [{ id: 'default', name: 'Default' }], activeAccountId: 'default' },
    { id: 'h2', name: 'Box', accounts: [{ id: 'default', name: 'Default' }, { id: 'rb', name: 'Build' }], activeAccountId: 'rb' },
  ];
  const groups = switcherGroups({ accounts: LOCAL, activeAccountId: 'default', hosts });
  assert.deepEqual(groups.map(g => g.hostId), [null, 'h1', 'h2']);
  assert.deepEqual(groups.map(g => g.name), ['Local Host', 'Mini', 'Box']);
  assert.equal(groups[2].activeAccountId, 'rb', "the Host's own active Account drives its check");
});

test("a Host's active Account falls back to the Default Account when none is marked", () => {
  assert.equal(activeHostAccountId({ accounts: [{ id: 'default' }] }), 'default');
});

test("a stale activeAccountId that names no Account of the Host falls back to Default, not a dangling check", () => {
  assert.equal(activeHostAccountId({ accounts: [{ id: 'default' }], activeAccountId: 'rb-gone' }), 'default');
});

test('a Host honours its activeAccountId when it names a real Account', () => {
  assert.equal(activeHostAccountId({ accounts: [{ id: 'default' }, { id: 'rb' }], activeAccountId: 'rb' }), 'rb');
});

test('a Remote Account shows "—" for usage — usage is out of v1 for Remote Hosts', () => {
  assert.deepEqual(switcherChips({ session: 42 }, true), ['—'], 'remote usage is a dash, not a figure');
});

test('a Local Account shows its real usage chips', () => {
  assert.deepEqual(switcherChips({ session: 42 }, false), ['42% 5h']);
  assert.deepEqual(switcherChips(null, false), [], 'no usage, no chips');
});
