const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hostKeyPrefix, keyBelongsToHost, settingKeyBelongsToHost, partitionHostKeys, describeRemoval,
} = require('../remote-removal');

// ── The prefix every Remote Project / folder key of a Host shares ──────────
// A Remote Project key is ssh://<hostId>/<path> and a cache folder key is ssh://<hostId>/<folder>
// (session-source.js), so both are forgotten by the one prefix ssh://<hostId>/.

test('hostKeyPrefix is ssh://<hostId>/', () => {
  assert.equal(hostKeyPrefix('host-abc'), 'ssh://host-abc/');
});

test('a Remote Project key and a folder key of the Host both belong to it', () => {
  assert.ok(keyBelongsToHost('ssh://host-abc/home/me/app', 'host-abc'));
  assert.ok(keyBelongsToHost('ssh://host-abc/-home-me-app', 'host-abc'));
});

test('a key of another Host, or a local key, does not belong', () => {
  assert.equal(keyBelongsToHost('ssh://host-xyz/home/me/app', 'host-abc'), false);
  assert.equal(keyBelongsToHost('/home/me/local', 'host-abc'), false);
  assert.equal(keyBelongsToHost(null, 'host-abc'), false);
});

test('a per-Project settings key of the Host is project:ssh://<hostId>/…', () => {
  assert.ok(settingKeyBelongsToHost('project:ssh://host-abc/home/me/app', 'host-abc'));
  assert.equal(settingKeyBelongsToHost('project:/home/me/local', 'host-abc'), false);
  assert.equal(settingKeyBelongsToHost('global', 'host-abc'), false);
});

test('partitionHostKeys splits an array into kept and removed by Host ownership', () => {
  const arr = ['ssh://host-abc/a', '/local/b', 'ssh://host-xyz/c', 'ssh://host-abc/d'];
  const { kept, removed } = partitionHostKeys(arr, 'host-abc');
  assert.deepEqual(kept, ['/local/b', 'ssh://host-xyz/c']);
  assert.deepEqual(removed, ['ssh://host-abc/a', 'ssh://host-abc/d']);
});

test('partitionHostKeys reads the key out of a record via keyOf', () => {
  const arr = [{ projectPath: 'ssh://host-abc/a' }, { projectPath: '/local/b' }];
  const { kept, removed } = partitionHostKeys(arr, 'host-abc', r => r.projectPath);
  assert.deepEqual(kept, [{ projectPath: '/local/b' }]);
  assert.deepEqual(removed, [{ projectPath: 'ssh://host-abc/a' }]);
});

// ── The confirmation (AC3) ─────────────────────────────────────────────────
// Names how many Sessions are live on the Host, and that removal never stops them. When the Host is
// Unreachable the count is unknown, and the message says so rather than guessing.

test('a reachable Host with live Sessions names the count and that they survive', () => {
  const msg = describeRemoval({ hostName: 'Mini', liveCount: 2, reachable: true });
  assert.match(msg, /Remove the Remote Host "Mini"\?/);
  assert.match(msg, /2 Sessions are still running on Mini/);
  assert.match(msg, /will not be stopped/);
  // It promises the forget is client-only and reversible.
  assert.match(msg, /The Host itself is untouched/);
});

test('one live Session is phrased in the singular', () => {
  const msg = describeRemoval({ hostName: 'Mini', liveCount: 1, reachable: true });
  assert.match(msg, /1 Session is still running on Mini/);
});

test('a reachable Host with no live Sessions says so', () => {
  const msg = describeRemoval({ hostName: 'Mini', liveCount: 0, reachable: true });
  assert.match(msg, /No Sessions are running on Mini/);
});

test('an Unreachable Host reports the count as unknown, not zero (AC3)', () => {
  const msg = describeRemoval({ hostName: 'Mini', liveCount: null, reachable: false });
  assert.match(msg, /Unreachable/);
  assert.match(msg, /can't tell how many Sessions/i);
  assert.doesNotMatch(msg, /No Sessions are running/);
});

test('a not-yet-probed Host (reachable undefined) is also unknown, never zero', () => {
  const msg = describeRemoval({ hostName: 'Mini', liveCount: null, reachable: undefined });
  assert.match(msg, /can't tell how many Sessions/i);
});

test('removing an Account names the Account and that the Host keeps its other data', () => {
  const msg = describeRemoval({ hostName: 'Mini', accountName: 'Work', liveCount: 0, reachable: true });
  assert.match(msg, /Remove the Account "Work" from Mini\?/);
  assert.match(msg, /The Account on the Host is untouched/);
});
