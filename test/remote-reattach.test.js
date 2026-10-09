// remote-reattach.js is the adapter that picks remote Sessions back up (VIN-160): it lists the live
// tmux sessions on a Reachable Host and spawns a headless ssh PTY to re-attach each, and when such a
// PTY dies it decides whether Claude really exited or the link just dropped. Every boundary (the SSH
// runner, the PTY spawn, the Session store, the reachability and Host lookups, the PTY wiring and the
// exit finalize) is injected, so the whole lifecycle is exercised here with fakes and no Electron,
// no socket and no ssh binary. The command shapes and the exit classification it leans on are
// remote-launch's, tested there; this proves the adapter wires them to the right effects.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRemoteReattach } = require('../remote-reattach');

const HOST = { id: 'h1', name: 'Mini', sshTarget: 'mac-mini' };

// A faithful-enough double over every injected boundary: an in-memory Session store, a scriptable
// SSH runner keyed by which remote command it sees (list / has-session / pane-title), a PTY spawn
// that hands back inert handles, and recorders for the PTY wiring, the exit finalize and the Dot seed.
function setup({ hosts = [HOST], reachability = {}, sshResponder } = {}) {
  const activeSessions = new Map();
  const sshCalls = [];
  const spawned = [];
  const wired = [];
  const finalized = [];
  const seeded = [];

  const sshRun = async (host, step) => {
    const command = step.command;
    sshCalls.push({ sshTarget: host.sshTarget, command });
    if (sshResponder) return sshResponder(command, host);
    if (command.includes('list-sessions')) return { code: 0, stdout: '' };
    return { code: 0, stdout: '' };
  };

  const reattach = createRemoteReattach({
    activeSessions,
    pty: { spawn: (_file, _args, _opts) => { const p = { id: spawned.length }; spawned.push(p); return p; } },
    sshRun,
    getReachability: () => reachability,
    getHosts: () => hosts,
    wirePtyHandlers: (ptyProcess, session, sessionId) => wired.push({ ptyProcess, session, sessionId }),
    finalizePtyExit: (session, sessionId, code, signal) => finalized.push({ session, sessionId, code, signal }),
    seedBusyFromTitle: (session, sessionId, title) => seeded.push({ session, sessionId, title }),
    getCachedFolder: () => 'some-project',
    cleanPtyEnv: {},
    mirrorRoot: '/data/remote-mirrors',
    log: { info() {}, warn() {}, debug() {} },
  });

  return { reattach, activeSessions, sshCalls, spawned, wired, finalized, seeded, reachability };
}

const settle = () => new Promise(r => setImmediate(r));

test('a Reachable Host\'s live tmux Sessions are each re-attached in the background', async () => {
  const { reattach, activeSessions, spawned, wired } = setup({
    sshResponder: (command) => command.includes('list-sessions')
      ? { code: 0, stdout: 'wp-a\nwp-b\n' }
      : { code: 0, stdout: '' },
  });
  reattach.reattachRemoteSessions(HOST);
  await settle(); await settle();

  assert.deepEqual([...activeSessions.keys()].sort(), ['a', 'b']);
  assert.equal(spawned.length, 2, 'one headless ssh PTY per live Session');
  assert.deepEqual(wired.map(w => w.sessionId).sort(), ['a', 'b']);
  for (const s of activeSessions.values()) {
    assert.equal(s.remote, true);
    assert.equal(s.rendererAttached, false, 'a background re-attach has no renderer');
    assert.equal(s._reattached, true, 'marked re-attached so a pre-connect death reads as a drop');
  }
});

test('a Session already live on the Host is not re-attached a second time', async () => {
  const { reattach, activeSessions, spawned } = setup({
    sshResponder: (command) => command.includes('list-sessions')
      ? { code: 0, stdout: 'wp-a\nwp-b\n' }
      : { code: 0, stdout: '' },
  });
  activeSessions.set('a', { remote: true, hostId: 'h1', remoteTmuxId: 'a' });
  reattach.reattachRemoteSessions(HOST);
  await settle(); await settle();

  assert.equal(spawned.length, 1, 'only the not-yet-attached Session b is spawned');
  assert.ok(activeSessions.has('b'));
});

test('no tmux server on the Host (nothing ever launched) re-attaches nothing', async () => {
  const { reattach, activeSessions, spawned } = setup({
    sshResponder: () => ({ code: 1, stdout: '', stderr: 'no server running' }),
  });
  reattach.reattachRemoteSessions(HOST);
  await settle(); await settle();
  assert.equal(activeSessions.size, 0);
  assert.equal(spawned.length, 0);
});

test('a background re-attach seeds the State Dot from the Session\'s pane title', async () => {
  const { reattach, seeded } = setup({
    sshResponder: (command) => {
      if (command.includes('list-sessions')) return { code: 0, stdout: 'wp-a\n' };
      if (command.includes('display-message')) return { code: 0, stdout: '  ✶ Working…  \n' };
      return { code: 0, stdout: '' };
    },
  });
  reattach.reattachRemoteSessions(HOST);
  await settle(); await settle(); await settle();
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].sessionId, 'a');
  assert.equal(seeded[0].title, '✶ Working…', 'the pane title is trimmed and handed to the Dot seed');
});

test('reviving a dropped Session reuses its object and keeps its buffer', async () => {
  const { reattach, activeSessions, spawned, wired } = setup();
  const dropped = { remote: true, hostId: 'h1', remoteTmuxId: 'a', dropped: true, exited: false,
    outputBuffer: ['old output'], pty: null };
  activeSessions.set('a', dropped);

  reattach.reattachRemoteSession(HOST, 'a');
  await settle();

  assert.equal(activeSessions.get('a'), dropped, 'the same Session object is revived, not replaced');
  assert.equal(dropped.dropped, false);
  assert.equal(dropped._reattached, true, 'a revived Session is now an attach, so a drop is not an exit');
  assert.deepEqual(dropped.outputBuffer, ['old output'], 'the buffered last State survives revival');
  assert.equal(spawned.length, 1);
  assert.equal(wired[0].session, dropped);
});

test('reviving a re-keyed dropped Session targets the far-side tmux by remoteTmuxId, not the map key', async () => {
  // After a fork/plan-accept re-key the Session lives under its realSessionId while its tmux still
  // carries the original name (the rename was pending or failed). Attach and seed must address the
  // tmux that exists — wp-<remoteTmuxId> — not wp-<map key>, or revival silently fails (VIN-160).
  const { reattach, activeSessions, sshCalls } = setup({
    sshResponder: (command) =>
      command.includes('display-message') ? { code: 0, stdout: '  ✶ Working…  \n' } : { code: 0, stdout: '' },
  });
  const dropped = { remote: true, hostId: 'h1', remoteTmuxId: 'old', realSessionId: 'new',
    dropped: true, exited: false, outputBuffer: [], pty: null };
  activeSessions.set('new', dropped);

  reattach.reattachRemoteSession(HOST, 'new');
  await settle(); await settle();

  const paneProbe = sshCalls.find(c => c.command.includes('display-message'));
  assert.ok(paneProbe, 'the pane-title probe is attempted');
  assert.ok(paneProbe.command.includes('wp-old'), 'the pane-title probe targets the original tmux name');
  assert.ok(!paneProbe.command.includes('wp-new'), 'and not the re-keyed map key');
});

test('an already-live Session is left alone when asked to re-attach it', () => {
  const { reattach, activeSessions, spawned } = setup();
  const live = { remote: true, hostId: 'h1', remoteTmuxId: 'a', dropped: false, exited: false };
  activeSessions.set('a', live);
  reattach.reattachRemoteSession(HOST, 'a');
  assert.equal(spawned.length, 0, 'a live Session is not re-spawned');
});

test('an Unreachable Host makes a dead PTY a dropped link, never an exit', async () => {
  const { reattach, finalized } = setup({ reachability: { h1: false } });
  const session = { remote: true, hostId: 'h1', remoteTmuxId: 'a' };
  reattach.handleRemotePtyExit(session, 'a', 1, null);
  await settle();
  assert.equal(session.dropped, true);
  assert.equal(session.pty, null);
  assert.equal(finalized.length, 0, 'a dropped link is never finalized as exited');
});

test('a reachable Host whose tmux session still lives is a dropped client, not Claude', async () => {
  const { reattach, finalized } = setup({
    reachability: {},
    sshResponder: (command) => command.includes('has-session') ? { code: 0, stdout: '' } : { code: 0, stdout: '' },
  });
  const session = { remote: true, hostId: 'h1', remoteTmuxId: 'a' };
  reattach.handleRemotePtyExit(session, 'a', 1, null);
  await settle(); await settle();
  assert.equal(session.dropped, true);
  assert.equal(finalized.length, 0);
});

test('a reachable Host whose tmux session is gone is Claude\'s real exit', async () => {
  const { reattach, finalized } = setup({
    reachability: {},
    sshResponder: (command) => command.includes('has-session') ? { code: 1, stdout: '' } : { code: 0, stdout: '' },
  });
  const session = { remote: true, hostId: 'h1', remoteTmuxId: 'a' };
  reattach.handleRemotePtyExit(session, 'a', 0, null);
  await settle(); await settle();
  assert.equal(finalized.length, 1, 'a real exit finalizes exactly as a local one');
  assert.equal(finalized[0].sessionId, 'a');
});

test('the Host resolves from the store for one consistent shape; a removed Host keeps the Session stale', async () => {
  const { reattach, finalized, sshCalls } = setup({ hosts: [], reachability: {} });
  const session = { remote: true, hostId: 'gone', remoteTmuxId: 'a' };
  reattach.handleRemotePtyExit(session, 'a', 1, null);
  await settle();
  assert.equal(session.dropped, true, 'a Host no longer in the store leaves the Session dropped, not exited');
  assert.equal(finalized.length, 0);
  assert.ok(!sshCalls.some(c => c.command.includes('has-session')), 'no probe is attempted against a removed Host');
});
