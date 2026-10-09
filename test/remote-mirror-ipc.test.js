// remote-mirror-ipc.js is the adapter around the pure remote-mirror core (VIN-154): it drives the
// poll loop that rsyncs each Reachable Host's active Account down to a local mirror and registers
// that mirror as a session-cache Source. Every boundary (the Host store, the live reachability map,
// the session cache, the rsync runner, the timer) is injected, so the whole lifecycle is exercised
// here with fakes and no Electron, no socket and no rsync binary.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRemoteMirrorIpc } = require('../remote-mirror-ipc');

const MIRROR_ROOT = '/data/remote-mirrors';

function host(id, extra = {}) {
  return { id, name: id, sshTarget: id, accounts: [{ id: 'default', configDir: '~/.claude' }], ...extra };
}

// A faithful-enough double of the session-cache Source registry: it records registrations,
// unregistrations and re-index requests, keyed by source id.
function fakeCache() {
  const registered = new Map();
  const calls = { populate: [], unregister: [] };
  return {
    calls, registered,
    registerSource: (s) => { registered.set(s.id, s); return s; },
    unregisterSource: (id) => { registered.delete(id); calls.unregister.push(id); },
    populateCacheViaWorker: (id) => { calls.populate.push(id); },
  };
}

function setup({ hosts = [], reachability = {}, rsync, onIndexed } = {}) {
  const cache = fakeCache();
  const runRsync = rsync || (async () => ({ code: 0, stdout: 'proj/abc.jsonl\n' }));
  const rsyncCalls = [];
  const ipc = createRemoteMirrorIpc({
    getHosts: () => hosts,
    getReachability: () => reachability,
    sessionCache: cache,
    mirrorRoot: MIRROR_ROOT,
    runRsync: async (d) => { rsyncCalls.push(d); return runRsync(d); },
    log: { warn() {} },
    onIndexed,
  });
  return { ipc, cache, rsyncCalls };
}

test('a Reachable Host registers a Source, rsyncs it, and re-indexes after a changed sync', async () => {
  const { ipc, cache, rsyncCalls } = setup({ hosts: [host('h1')], reachability: { h1: true } });
  await ipc.syncOnce();

  assert.deepEqual([...cache.registered.keys()], ['ssh:h1']);
  assert.equal(rsyncCalls.length, 1);
  assert.equal(rsyncCalls[0].hostId, 'h1');
  assert.deepEqual(cache.calls.populate, ['ssh:h1']);
});

test('a changed sync notifies onIndexed with the Source descriptor, so fork detection can run (VIN-155)', async () => {
  const indexed = [];
  const { ipc } = setup({ hosts: [host('h1')], reachability: { h1: true }, onIndexed: (d) => indexed.push(d) });
  await ipc.syncOnce();
  assert.equal(indexed.length, 1);
  assert.equal(indexed[0].id, 'ssh:h1');
  assert.equal(indexed[0].hostId, 'h1');
});

test('a no-op rsync does not notify onIndexed (nothing new to detect)', async () => {
  const indexed = [];
  const { ipc } = setup({
    hosts: [host('h1')], reachability: { h1: true },
    rsync: async () => ({ code: 0, stdout: './\n' }),
    onIndexed: (d) => indexed.push(d),
  });
  await ipc.syncOnce();
  assert.deepEqual(indexed, []);
});

test('a no-op rsync registers the Source but does not re-index', async () => {
  const { ipc, cache } = setup({
    hosts: [host('h1')], reachability: { h1: true },
    rsync: async () => ({ code: 0, stdout: './\n' }), // nothing transferred
  });
  await ipc.syncOnce();
  assert.deepEqual([...cache.registered.keys()], ['ssh:h1']);
  assert.deepEqual(cache.calls.populate, []);
});

test('an Unreachable Host keeps its Source (cache kept) but is not rsynced', async () => {
  const { ipc, cache, rsyncCalls } = setup({ hosts: [host('h1')], reachability: { h1: false } });
  await ipc.syncOnce();

  // The Source stays registered — nothing is evicted when a Host goes down (CONTEXT.md).
  assert.deepEqual([...cache.registered.keys()], ['ssh:h1']);
  assert.equal(rsyncCalls.length, 0, 'the mirror stops while Unreachable');
  assert.deepEqual(cache.calls.populate, []);
});

test('reachable-again resumes the mirror: the kept Source is rsynced and re-indexed', async () => {
  const reachability = { h1: false };
  const cache = fakeCache();
  const rsyncCalls = [];
  const ipc = createRemoteMirrorIpc({
    getHosts: () => [host('h1')],
    getReachability: () => reachability,
    sessionCache: cache,
    mirrorRoot: MIRROR_ROOT,
    runRsync: async (d) => { rsyncCalls.push(d); return { code: 0, stdout: 'p/a.jsonl\n' }; },
    log: { warn() {} },
  });

  await ipc.syncOnce();                    // down: registered, not synced
  assert.equal(rsyncCalls.length, 0);
  reachability.h1 = true;
  await ipc.syncOnce();                    // up: synced + indexed, no re-register
  assert.equal(rsyncCalls.length, 1);
  assert.deepEqual(cache.calls.populate, ['ssh:h1']);
  assert.equal(cache.calls.unregister.length, 0, 'the Source was kept across the outage');
});

test('a removed Host has its Source unregistered (its cache evicted)', async () => {
  let hosts = [host('h1')];
  const cache = fakeCache();
  const ipc = createRemoteMirrorIpc({
    getHosts: () => hosts,
    getReachability: () => ({ h1: true }),
    sessionCache: cache,
    mirrorRoot: MIRROR_ROOT,
    runRsync: async () => ({ code: 0, stdout: '' }),
    log: { warn() {} },
  });

  await ipc.syncOnce();
  assert.deepEqual([...cache.registered.keys()], ['ssh:h1']);
  hosts = []; // the user removed the Host
  await ipc.syncOnce();
  assert.deepEqual([...cache.registered.keys()], []);
  assert.deepEqual(cache.calls.unregister, ['ssh:h1']);
});

test('a failed rsync (non-zero exit) does not re-index', async () => {
  const { ipc, cache } = setup({
    hosts: [host('h1')], reachability: { h1: true },
    rsync: async () => ({ code: 255, stdout: '', stderr: 'ssh: connect timed out' }),
  });
  await ipc.syncOnce();
  assert.deepEqual([...cache.registered.keys()], ['ssh:h1']);
  assert.deepEqual(cache.calls.populate, []);
});

test('start runs an immediate sync then schedules the poll; stop releases the timer', async () => {
  let scheduled = null, cleared = false;
  const cache = fakeCache();
  const ipc = createRemoteMirrorIpc({
    getHosts: () => [host('h1')],
    getReachability: () => ({ h1: true }),
    sessionCache: cache,
    mirrorRoot: MIRROR_ROOT,
    runRsync: async () => ({ code: 0, stdout: '' }),
    log: { warn() {} },
    setIntervalFn: (fn, ms) => { scheduled = { fn, ms }; return 42; },
    clearIntervalFn: (t) => { cleared = (t === 42); },
  });
  ipc.start();
  assert.ok(scheduled && scheduled.ms > 0, 'the poll is scheduled');
  ipc.stop();
  assert.equal(cleared, true);
});
