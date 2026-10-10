const test = require('node:test');
const assert = require('node:assert/strict');

const { createRemoteHostsIpc } = require('../remote-hosts-ipc');

// A fake over every injected boundary: an in-memory settings store, a recorder for renderer pushes,
// a scriptable SSH runner keyed by sshTarget, and a hand-driven timer so the probe interval is
// observable without real time.
function harness({ reachable = {}, dirOut = {}, sessionsOut = {} } = {}) {
  const store = {};
  const sent = [];
  const becameReachable = [];
  let refreshes = 0;
  let tick = null;
  const ipc = createRemoteHostsIpc({
    getSetting: (k) => store[k],
    setSetting: (k, v) => { store[k] = v; },
    send: (...args) => sent.push(args),
    onReachabilityChange: () => { refreshes++; },
    onHostReachable: (host) => { becameReachable.push(host.id); },
    run: async (host, step) => {
      // The dir check (VIN-157) answers from a per-host, per-path table; the live-session list
      // (VIN-161) from a per-host tmux-name list; every other step is the reachability probe, which
      // is a zero exit exactly when the host is reachable.
      if (step && step.id === 'dir') {
        return { code: 0, stdout: (dirOut[host.sshTarget] || {})[step.path] || 'NO_DIR' };
      }
      if (step && /list-sessions/.test(step.command || '')) {
        const out = sessionsOut[host.sshTarget];
        if (out == null) return { code: 1, stdout: '', stderr: 'no server running' };
        return { code: 0, stdout: out };
      }
      return { code: reachable[host.sshTarget] ? 0 : 255 };
    },
    setIntervalFn: (fn) => { tick = fn; return 'timer'; },
    clearIntervalFn: () => { tick = null; },
  });
  return {
    ipc, store, sent, becameReachable,
    refreshCount: () => refreshes,
    runTick: () => tick && tick(), hasTimer: () => tick !== null,
  };
}

test('hosts read back normalised, with a Default Account injected', () => {
  const { ipc, store } = harness();
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  const hosts = ipc.getHosts();
  assert.equal(hosts[0].accounts[0].id, 'default');
});

test('with nothing stored the Host list is empty, not a crash', () => {
  const { ipc } = harness();
  assert.deepEqual(ipc.getHosts(), []);
});

test('adding a Host persists it and probes it at once so its badge is not left Checking', async () => {
  const { ipc, store, sent } = harness({ reachable: { 'mac-mini': true } });
  ipc.addHost({ name: 'Mini', sshTarget: 'mac-mini' });
  assert.equal(store.hosts.length, 1);
  // probeHostsOnce was fired by addHost; let its SSH runs settle, then the flip should be pushed.
  await new Promise(r => setImmediate(r));
  assert.ok(sent.some(([ch]) => ch === 'host-reachability'));
});

test('reachability is pushed only when it flips, not on every probe', async () => {
  const { ipc, store, sent } = harness({ reachable: { 'mac-mini': true } });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.probeHostsOnce();
  await ipc.probeHostsOnce();
  const pushes = sent.filter(([ch]) => ch === 'host-reachability');
  assert.equal(pushes.length, 1, 'only the first probe, which flipped undefined→reachable, pushed');
  assert.deepEqual(pushes[0], ['host-reachability', 'h1', true]);
  assert.deepEqual(ipc.getReachability(), { h1: true });
});

test('a reachability flip refreshes the sidebar so greying lands within one probe interval', async () => {
  const { ipc, store, refreshCount } = harness({ reachable: { 'mac-mini': true } });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.probeHostsOnce();
  assert.equal(refreshCount(), 1, 'the undefined→reachable flip nudged a projects refresh');
  await ipc.probeHostsOnce();
  assert.equal(refreshCount(), 1, 'a steady reachability does not re-fetch projects');
});

test('a Host turning Reachable fires onHostReachable so its live Sessions can be re-attached (VIN-160)', async () => {
  const { ipc, store, becameReachable } = harness({ reachable: { 'mac-mini': true } });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.probeHostsOnce();
  assert.deepEqual(becameReachable, ['h1'], 'the first (undefined→reachable) flip fires it');
  await ipc.probeHostsOnce();
  assert.deepEqual(becameReachable, ['h1'], 'a steady-reachable probe does not re-fire');
});

test('a Host going Unreachable does not fire onHostReachable (VIN-160)', async () => {
  const reachable = { 'mac-mini': true };
  const { ipc, store, becameReachable } = harness({ reachable });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.probeHostsOnce();              // undefined → reachable → fires
  reachable['mac-mini'] = false;
  await ipc.probeHostsOnce();              // reachable → unreachable → must not fire
  reachable['mac-mini'] = true;
  await ipc.probeHostsOnce();              // unreachable → reachable → fires again
  assert.deepEqual(becameReachable, ['h1', 'h1']);
});

test('createRemoteHostsIpc refuses to build without an onReachabilityChange callback', () => {
  assert.throws(() => createRemoteHostsIpc({ getSetting: () => {}, setSetting: () => {}, send: () => {} }),
    /onReachabilityChange/);
});

test('createRemoteHostsIpc refuses to build without an onHostReachable callback', () => {
  assert.throws(() => createRemoteHostsIpc({
    getSetting: () => {}, setSetting: () => {}, send: () => {}, onReachabilityChange: () => {},
  }), /onHostReachable/);
});

test('startHostProbe is idempotent and stopHostProbe releases the timer', () => {
  const { ipc, hasTimer } = harness();
  ipc.startHostProbe();
  assert.ok(hasTimer(), 'a timer is scheduled');
  ipc.startHostProbe(); // a second call must not schedule a second timer
  ipc.stopHostProbe();
  assert.equal(hasTimer(), false, 'the timer is cleared on stop');
});

test('removing a Host forgets its remembered reachability', async () => {
  const { ipc, store } = harness({ reachable: { 'mac-mini': true } });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.probeHostsOnce();
  assert.deepEqual(ipc.getReachability(), { h1: true });
  ipc.removeHost('h1');
  assert.deepEqual(ipc.getReachability(), {});
});

// ── Counting live Sessions for the removal confirmation (VIN-161, AC3) ──
// The confirmation names how many Sessions are live on the Host; the count rides the live tmux list
// on the Host's socket when it is Reachable, and is unknown when it is not.

test('counting live Sessions on a Reachable Host parses the live tmux list', async () => {
  const { ipc, store } = harness({
    reachable: { 'mac-mini': true },
    sessionsOut: { 'mac-mini': 'wp-aaa\nwp-bbb\nmisc-not-ours\nwp-ccc\n' },
  });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.probeHostsOnce(); // so the Host is known Reachable
  const res = await ipc.countRemoteSessions('h1');
  assert.deepEqual(res, { reachable: true, count: 3 }, 'only wp-<id> names count; foreign names are skipped');
});

test('a Reachable Host with no tmux server counts zero, not unknown', async () => {
  const { ipc, store } = harness({ reachable: { 'mac-mini': true }, sessionsOut: {} });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.probeHostsOnce();
  const res = await ipc.countRemoteSessions('h1');
  assert.deepEqual(res, { reachable: true, count: 0 });
});

test('an Unreachable Host reports the count as unknown and never lists over SSH (AC3)', async () => {
  const { ipc, store } = harness({ reachable: { 'mac-mini': false } });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.probeHostsOnce();
  const res = await ipc.countRemoteSessions('h1');
  assert.equal(res.count, null, 'unknown, not zero');
  assert.equal(res.reachable, false);
});

test('a not-yet-probed Host counts as unknown (reachability undefined)', async () => {
  const { ipc, store } = harness();
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  const res = await ipc.countRemoteSessions('h1');
  assert.equal(res.count, null);
});

test('counting an unknown Host answers unknown rather than throwing', async () => {
  const { ipc } = harness();
  const res = await ipc.countRemoteSessions('nope');
  assert.equal(res.count, null);
});

test('removing a Host also forgets its hidden Remote Projects (AC1)', () => {
  const { ipc, store } = harness();
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  store.global = {
    remoteProjects: [{ hostId: 'h1', projectPath: 'ssh://h1/a' }],
    hiddenProjects: ['ssh://h1/a', 'ssh://h2/b', '/local/c'],
  };
  ipc.removeHost('h1');
  assert.deepEqual(store.global.hiddenProjects, ['ssh://h2/b', '/local/c'],
    'only this Host\'s hidden keys are dropped; a sibling Host and a local Project survive');
  assert.deepEqual(store.global.remoteProjects, []);
});

test('testing an unknown Host answers a not-found diagnosis rather than throwing', async () => {
  const { ipc } = harness();
  const res = await ipc.testConnection('nope');
  assert.equal(res.ok, false);
  assert.equal(res.step, 'unknown');
});

// ── Add a Remote Project by hand (VIN-157) ──────────────────────────────
// Validate a hand-typed path on the Host as an existing directory, then persist the Remote Project
// so it shows in the sidebar (keyed ssh://<hostId>/<path>) and survives restart and mirror sync.

test('adding an existing remote directory persists the Project keyed ssh://<hostId>/<path>', async () => {
  const { ipc, store } = harness({
    reachable: { 'mac-mini': true },
    dirOut: { 'mac-mini': { '/home/me/work/proj': 'OK' } },
  });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  const res = await ipc.addRemoteProject('h1', '/home/me/work/proj');
  assert.equal(res.ok, true);
  assert.equal(res.projectPath, 'ssh://h1/home/me/work/proj');
  assert.deepEqual(store.global.remoteProjects, [{ hostId: 'h1', projectPath: 'ssh://h1/home/me/work/proj' }]);
});

test('a non-existent path is refused with a clear message and nothing is persisted', async () => {
  const { ipc, store } = harness({
    reachable: { 'mac-mini': true },
    dirOut: { 'mac-mini': {} }, // every unseen path answers NO_DIR
  });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  const res = await ipc.addRemoteProject('h1', '/does/not/exist');
  assert.equal(res.ok, undefined);
  assert.match(res.error, /doesn't exist/);
  assert.equal(store.global, undefined, 'nothing persisted on a refused add');
});

test('an Unreachable Host is refused and nothing is persisted', async () => {
  const { ipc, store } = harness({ reachable: { 'mac-mini': false } });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  const res = await ipc.addRemoteProject('h1', '/home/me/work/proj');
  assert.equal(res.ok, undefined);
  assert.ok(res.error, 'a clear error is returned');
  assert.equal(store.global, undefined, 'nothing persisted');
});

test('adding against an unknown Host answers an error, not a throw', async () => {
  const { ipc } = harness();
  const res = await ipc.addRemoteProject('ghost', '/home/me/p');
  assert.equal(res.ok, undefined);
  assert.match(res.error, /not found/i);
});

test('re-adding a hidden Remote Project un-hides it, like a local one', async () => {
  const { ipc, store } = harness({
    reachable: { 'mac-mini': true },
    dirOut: { 'mac-mini': { '/home/me/work/proj': 'OK' } },
  });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  const key = 'ssh://h1/home/me/work/proj';
  store.global = { hiddenProjects: [key, '/some/other'] };
  await ipc.addRemoteProject('h1', '/home/me/work/proj');
  assert.deepEqual(store.global.hiddenProjects, ['/some/other'], 'the re-added Project is un-hidden');
});

test('adding the same Remote Project twice does not duplicate the record', async () => {
  const { ipc, store } = harness({
    reachable: { 'mac-mini': true },
    dirOut: { 'mac-mini': { '/home/me/work/proj': 'OK' } },
  });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.addRemoteProject('h1', '/home/me/work/proj');
  await ipc.addRemoteProject('h1', '/home/me/work/proj');
  assert.equal(store.global.remoteProjects.length, 1);
});

test('removing a Host drops its hand-added Remote Projects so no ghost row survives', async () => {
  const { ipc, store } = harness({
    reachable: { 'mac-mini': true },
    dirOut: { 'mac-mini': { '/home/me/work/proj': 'OK' } },
  });
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [] }];
  await ipc.addRemoteProject('h1', '/home/me/work/proj');
  ipc.removeHost('h1');
  assert.deepEqual(store.global.remoteProjects, []);
});

// ── Active Account per Host (VIN-158) ───────────────────────────────────
// The switcher picks a Host's active Account; the adapter persists it on that Host and returns the
// fresh list, so the choice survives a restart (it is in the 'hosts' setting) and the mirror re-points.

test('setting a Host active Account persists it and returns the fresh list', () => {
  const { ipc, store } = harness();
  store.hosts = [{
    id: 'h1', name: 'Mini', sshTarget: 'mac-mini',
    accounts: [{ id: 'default', configDir: '~/.claude' }, { id: 'racc-9', name: 'Work', configDir: '~/.work' }],
  }];
  const hosts = ipc.setRemoteActiveAccount('h1', 'racc-9');
  assert.equal(hosts[0].activeAccountId, 'racc-9', 'the returned list carries the choice');
  assert.equal(store.hosts[0].activeAccountId, 'racc-9', 'it is persisted for the next restart');
});

test('setting an Account the Host does not have leaves the stored list unchanged', () => {
  const { ipc, store } = harness();
  store.hosts = [{ id: 'h1', name: 'Mini', sshTarget: 'mac-mini', accounts: [{ id: 'default', configDir: '~/.claude' }] }];
  const hosts = ipc.setRemoteActiveAccount('h1', 'racc-ghost');
  assert.equal(hosts[0].activeAccountId, undefined);
  assert.equal(store.hosts[0].activeAccountId, undefined);
});
