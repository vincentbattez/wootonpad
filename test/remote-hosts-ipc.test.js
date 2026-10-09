const test = require('node:test');
const assert = require('node:assert/strict');

const { createRemoteHostsIpc } = require('../remote-hosts-ipc');

// A fake over every injected boundary: an in-memory settings store, a recorder for renderer pushes,
// a scriptable SSH runner keyed by sshTarget, and a hand-driven timer so the probe interval is
// observable without real time.
function harness({ reachable = {} } = {}) {
  const store = {};
  const sent = [];
  let refreshes = 0;
  let tick = null;
  const ipc = createRemoteHostsIpc({
    getSetting: (k) => store[k],
    setSetting: (k, v) => { store[k] = v; },
    send: (...args) => sent.push(args),
    onReachabilityChange: () => { refreshes++; },
    run: async (host) => ({ code: reachable[host.sshTarget] ? 0 : 255 }),
    setIntervalFn: (fn) => { tick = fn; return 'timer'; },
    clearIntervalFn: () => { tick = null; },
  });
  return {
    ipc, store, sent,
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

test('createRemoteHostsIpc refuses to build without an onReachabilityChange callback', () => {
  assert.throws(() => createRemoteHostsIpc({ getSetting: () => {}, setSetting: () => {}, send: () => {} }),
    /onReachabilityChange/);
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

test('testing an unknown Host answers a not-found diagnosis rather than throwing', async () => {
  const { ipc } = harness();
  const res = await ipc.testConnection('nope');
  assert.equal(res.ok, false);
  assert.equal(res.step, 'unknown');
});
