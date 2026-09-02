import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasUsage, usageRows, usageChips, usageSeverity } from './usage.mjs';

// The account-usage read model behind the panel bars and the dropdown chips, asserted against
// fixed usage entries with no mounting and no DOM.

test('hasUsage is false without a figure, or when the entry is unusable', () => {
  assert.equal(hasUsage(undefined), false);
  assert.equal(hasUsage({}), false);
  assert.equal(hasUsage({ session: 20, _error: true }), false);
  assert.equal(hasUsage({ session: 20, _rateLimited: true }), false);
  assert.equal(hasUsage({ session: 20 }), true);
  assert.equal(hasUsage({ weekAll: 5 }), true);
});

test('usageRows yields the present rows, each with its percentage and reset countdown', () => {
  assert.deepEqual(usageRows({}), []);
  assert.deepEqual(usageRows({ session: 40, sessionResetIn: '2h' }), [
    { key: 'session', label: '5h', pct: 40, resetIn: '2h' },
  ]);
  const both = usageRows({ session: 40, weekAll: 12, weekAllResetIn: '3d' });
  assert.deepEqual(both.map(r => r.key), ['session', 'weekAll']);
  assert.equal(both[1].pct, 12);
  assert.equal(both[1].resetIn, '3d');
});

test('usageSeverity is the panel caller\'s 70 / 90 rule, off the shared meter Primitive', () => {
  assert.equal(usageSeverity(0), '');
  assert.equal(usageSeverity(69), '');
  assert.equal(usageSeverity(70), 'warn');
  assert.equal(usageSeverity(89), 'warn');
  assert.equal(usageSeverity(90), 'danger');
  assert.equal(usageSeverity(150), 'danger');
});

test('usageChips shows the 5-hour figure only, and nothing when unusable', () => {
  assert.deepEqual(usageChips({ session: 33 }), ['33% 5h']);
  assert.deepEqual(usageChips({ weekAll: 5 }), []);
  assert.deepEqual(usageChips({ session: 33, _rateLimited: true }), []);
  assert.deepEqual(usageChips(null), []);
});
