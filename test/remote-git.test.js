// remote-git.js is the pure core of the remote light Git Snapshot (VIN-159): how a Remote Project
// key (ssh://<hostId>/<path>, ADR 0016) resolves to the argv that runs a git command on its Remote
// Host, in the Project's directory, through the Host's login shell — the same redirection WSL
// accounts do (ADR 0007), carried over SSH with the same BatchMode safety (ADR 0016: no prompt may
// ever block the app). No socket, no Electron — a function of plain values, tested here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { parseRemoteKey, resolveRemoteGitArgs, planRemoteSnapshot } = require('../remote-git');

function host(extra = {}) {
  return { id: 'host-abc', name: 'Mac Mini', sshTarget: 'mac-mini', ...extra };
}

// --- key parsing ------------------------------------------------------------------------------

test('parseRemoteKey splits a Remote Project key into its Host id and the absolute path on the Host', () => {
  assert.deepEqual(
    parseRemoteKey('ssh://host-abc/home/me/proj'),
    { hostId: 'host-abc', remotePath: '/home/me/proj' });
});

test('parseRemoteKey returns null for a local (identity) path, so local git falls straight through', () => {
  assert.equal(parseRemoteKey('/home/me/proj'), null);
  assert.equal(parseRemoteKey('C:\\Users\\me\\proj'), null);
  assert.equal(parseRemoteKey(''), null);
});

// --- redirection ------------------------------------------------------------------------------

test('resolveRemoteGitArgs returns null for a local path — the runner runs git locally, unchanged', () => {
  assert.equal(resolveRemoteGitArgs('/home/me/proj', ['status'], [host()]), null);
});

test('resolveRemoteGitArgs returns null when the Host is unknown, so a removed Host never dials out', () => {
  assert.equal(resolveRemoteGitArgs('ssh://host-gone/home/me/proj', ['status'], [host()]), null);
});

test('resolveRemoteGitArgs addresses the Host with BatchMode=yes and never relaxes host-key checking', () => {
  const { args } = resolveRemoteGitArgs('ssh://host-abc/home/me/proj', ['rev-parse', 'HEAD'], [host()]);
  const joined = args.join(' ');
  assert.match(joined, /BatchMode=yes/);
  assert.doesNotMatch(joined, /accept-new/i);
  assert.doesNotMatch(joined, /StrictHostKeyChecking=no/i);
});

test('resolveRemoteGitArgs runs git through the login shell, cd\'d into the Project dir on the Host', () => {
  const { host: resolved, args } = resolveRemoteGitArgs(
    'ssh://host-abc/home/me/proj', ['rev-parse', '--abbrev-ref', 'HEAD'], [host()]);
  assert.equal(resolved.sshTarget, 'mac-mini');
  // The ssh target is addressed, options terminated by --, and the whole thing runs via $SHELL -lc.
  const dash = args.indexOf('--');
  assert.equal(args[dash + 1], 'mac-mini');
  const remoteCommand = args[args.length - 1];
  assert.match(remoteCommand, /\$SHELL -lc /);
  assert.match(remoteCommand, /cd .*home\/me\/proj/);
  assert.match(remoteCommand, /git/);
  assert.match(remoteCommand, /rev-parse/);
});

// The argv-not-shell guarantee of ADR 0007, carried over SSH: a Project directory holding a space
// is one argument to git, never split by the shell. Verified by actually running the remote command
// through a shell with a fake `git` that prints one line per argument it received — the shell and
// git are the only things mocked, exactly the boundary (CODING_STANDARDS: mock at the boundary).
test('the remote command runs git as argv: a Project dir containing a space is one argument, never split', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-git-'));
  const projDir = path.join(tmp, 'my proj');
  fs.mkdirSync(projDir);
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  const fakeGit = path.join(bin, 'git');
  fs.writeFileSync(fakeGit, '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
  fs.chmodSync(fakeGit, 0o755);
  // A stand-in for the Host's login shell: invoked `$SHELL -lc <inner>`, it runs <inner> with the
  // test's PATH (where the fake git lives) rather than resetting it from a login profile.
  const fakeShell = path.join(bin, 'login-shell');
  fs.writeFileSync(fakeShell, '#!/bin/sh\nexec /bin/sh -c "$2"\n');
  fs.chmodSync(fakeShell, 0o755);

  const { args } = resolveRemoteGitArgs(
    `ssh://host-abc${projDir}`, ['status', '--porcelain'], [host()]);
  const remoteCommand = args[args.length - 1];

  // Emulate ssh: hand the single remote-command string to the Host's shell, with the fake git and
  // the fake login shell on PATH.
  const out = execFileSync('/bin/sh', ['-c', remoteCommand], {
    encoding: 'utf8',
    env: { ...process.env, PATH: bin + ':' + process.env.PATH, SHELL: fakeShell },
  });
  assert.deepEqual(out.trim().split('\n'), ['status', '--porcelain']);
});

test('resolveRemoteGitArgs derives the multiplexing socket from the resolved Host via controlPathFor', () => {
  const seen = [];
  const { args } = resolveRemoteGitArgs('ssh://host-abc/home/me/proj', ['status'], [host()], {
    controlPathFor: h => { seen.push(h); return '/sock/cm-' + h.id; },
  });
  // The resolved Host — not a stub built from the id — is handed to controlPathFor, and the socket
  // path it returns lands in the ssh ControlPath option.
  assert.deepEqual(seen, [host()]);
  assert.match(args.join(' '), /ControlPath=\/sock\/cm-host-abc/);
  assert.match(args.join(' '), /ControlMaster=auto/);
});

// --- stale-while-unreachable policy -----------------------------------------------------------
// planRemoteSnapshot owns the two acceptance-criteria rules for a Remote Project's light badge:
// never dial a Host known Unreachable, and keep the last good Snapshot when a fresh read's git
// didn't answer. The IPC send/cache wiring stays in main.js; the decision is tested here.

const STALE = { branch: 'main', added: 3, deleted: 1 };

test('planRemoteSnapshot dials a Host that is reachable or not yet probed, never one known Unreachable', () => {
  assert.equal(planRemoteSnapshot(STALE, true).dial, true);
  assert.equal(planRemoteSnapshot(STALE, undefined).dial, true); // not yet probed may try
  assert.equal(planRemoteSnapshot(STALE, false).dial, false);    // known down is never dialed
});

test('planRemoteSnapshot keeps the last good Snapshot when the fresh read has no branch (ssh dropped / no git repository)', () => {
  for (const read of [null, undefined, { branch: null, added: null, deleted: null }]) {
    const plan = planRemoteSnapshot(STALE, true, read);
    assert.equal(plan.updated, false);
    assert.equal(plan.snapshot, STALE); // the badge keeps its last value rather than blanking
  }
});

test('planRemoteSnapshot replaces the badge with the fresh branch and diff counts when git answers', () => {
  const plan = planRemoteSnapshot(STALE, true, { branch: 'feat/x', added: 10, deleted: 2, extra: 'ignored' });
  assert.equal(plan.updated, true);
  assert.deepEqual(plan.snapshot, { branch: 'feat/x', added: 10, deleted: 2 });
});

test('planRemoteSnapshot keeps the stale Snapshot even on a fresh read when the Host is Unreachable', () => {
  // base survives with no fresh read at all — the first good Snapshot persists across an outage.
  const plan = planRemoteSnapshot(STALE, false);
  assert.equal(plan.dial, false);
  assert.equal(plan.snapshot, STALE);
});
