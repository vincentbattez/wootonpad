const test = require('node:test');
const assert = require('node:assert/strict');

const { createRemoteRemoval } = require('../remote-removal-ipc');

// A fake over every injected boundary: the session cache records which Source id was unregistered,
// each db purge records the prefix/account it was called with, and a fake fs records the dirs it was
// asked to delete. No sqlite, no disk, no Electron.
function harness() {
  const calls = {
    unregistered: [],
    cachePrefix: [],
    cacheAccount: [],
    projectPrefix: [],
    settingsPrefix: [],
    removedDirs: [],
  };
  const removal = createRemoteRemoval({
    sessionCache: { unregisterSource: (id) => calls.unregistered.push(id) },
    deleteRemoteCacheByFolderPrefix: (p) => calls.cachePrefix.push(p),
    deleteCachedSessionsByAccount: (a) => calls.cacheAccount.push(a),
    deleteProjectDataByPathPrefix: (p) => calls.projectPrefix.push(p),
    deleteSettingsByKeyPrefix: (p) => calls.settingsPrefix.push(p),
    mirrorRoot: '/data/remote-mirrors',
    fs: { rmSync: (dir) => calls.removedDirs.push(dir) },
    log: { warn: () => {} },
  });
  return { removal, calls };
}

test('createRemoteRemoval refuses to build without a required boundary', () => {
  assert.throws(() => createRemoteRemoval({ mirrorRoot: '/x' }), /sessionCache is required/);
  assert.throws(() => createRemoteRemoval({
    sessionCache: {}, deleteRemoteCacheByFolderPrefix: () => {}, deleteCachedSessionsByAccount: () => {},
    deleteProjectDataByPathPrefix: () => {}, deleteSettingsByKeyPrefix: () => {},
  }), /mirrorRoot is required/);
});

test('purgeHost evicts the mirror Source, caches, project rows, settings and the mirror dir (AC1)', () => {
  const { removal, calls } = harness();
  removal.purgeHost('host-abc');
  assert.deepEqual(calls.unregistered, ['ssh:host-abc'], 'the live mirror Source is dropped');
  assert.deepEqual(calls.cachePrefix, ['ssh://host-abc/'], 'cached Sessions + search under the Host prefix go');
  assert.deepEqual(calls.projectPrefix, ['ssh://host-abc/'], 'Area filing / git cache / avatars go');
  assert.deepEqual(calls.settingsPrefix, ['project:ssh://host-abc/'], 'per-Project settings go');
  assert.deepEqual(calls.removedDirs, ['/data/remote-mirrors/host-abc'], 'the whole mirror dir (all Accounts) is deleted');
});

test('purgeHost scopes every deletion to the one Host — a sibling Host is untouched', () => {
  const { removal, calls } = harness();
  removal.purgeHost('host-abc');
  for (const p of [...calls.cachePrefix, ...calls.projectPrefix]) assert.match(p, /host-abc/);
  assert.match(calls.settingsPrefix[0], /host-abc/);
  // No account-scoped cache delete on a Host purge: the prefix purge already covers every Account.
  assert.deepEqual(calls.cacheAccount, []);
});

test('a session-cache eviction that throws does not abort the rest of the purge', () => {
  const calls = { cachePrefix: [], removedDirs: [] };
  const removal = createRemoteRemoval({
    sessionCache: { unregisterSource: () => { throw new Error('boom'); } },
    deleteRemoteCacheByFolderPrefix: (p) => calls.cachePrefix.push(p),
    deleteCachedSessionsByAccount: () => {},
    deleteProjectDataByPathPrefix: () => {},
    deleteSettingsByKeyPrefix: () => {},
    mirrorRoot: '/m',
    fs: { rmSync: (d) => calls.removedDirs.push(d) },
    log: { warn: () => {} },
  });
  removal.purgeHost('host-abc');
  assert.deepEqual(calls.cachePrefix, ['ssh://host-abc/'], 'the db purge still ran');
  assert.deepEqual(calls.removedDirs, ['/m/host-abc'], 'the mirror dir was still deleted');
});

test('purgeAccount forgets only that Account cache and its mirror dir, never the Host project data', () => {
  const { removal, calls } = harness();
  removal.purgeAccount('host-abc', 'racc-9');
  assert.deepEqual(calls.cacheAccount, ['ssh:host-abc:racc-9'], 'the Account-scoped Sessions go');
  assert.deepEqual(calls.removedDirs, ['/data/remote-mirrors/host-abc/racc-9'], 'only the Account mirror dir');
  assert.deepEqual(calls.projectPrefix, [], 'the Host keeps its per-Project rows for other Accounts');
  assert.deepEqual(calls.settingsPrefix, [], 'the Host keeps its per-Project settings');
  assert.deepEqual(calls.unregistered, [], 'the Host mirror Source is not dropped');
});

test('purgeAccount is a no-op for the Default Account (never removed) (AC5)', () => {
  const { removal, calls } = harness();
  removal.purgeAccount('host-abc', 'default');
  assert.deepEqual(calls.cacheAccount, []);
  assert.deepEqual(calls.removedDirs, []);
});
