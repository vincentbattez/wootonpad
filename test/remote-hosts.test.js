const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sshArgs,
  reachStep, toolStep, accountStep, dirStep,
  diagnoseReach, diagnoseTool, diagnoseAccount, diagnoseDir,
  classifyReachability,
  testConnection, testReachability, checkRemoteDir,
  normalizeHost, addHost, addRemoteAccount, removeHost, removeRemoteAccount,
  setActiveRemoteAccount,
} = require('../remote-hosts');

// ── SSH argument safety (no prompt can ever block the app) ───────────
// Every command WootonPad runs on a Host must carry BatchMode=yes, so ssh fails
// rather than waiting on a password or a host-key prompt. The host key is never
// auto-accepted, so StrictHostKeyChecking must not be relaxed to accept-new.

test('every ssh invocation sets BatchMode=yes', () => {
  const args = sshArgs('mac-mini', 'true');
  const i = args.indexOf('BatchMode=yes');
  assert.ok(i > 0 && args[i - 1] === '-o', 'BatchMode=yes passed as an -o option');
});

test('ssh carries a connect timeout so an unreachable host fails fast', () => {
  const args = sshArgs('mac-mini', 'true', { connectTimeout: 7 });
  assert.ok(args.includes('ConnectTimeout=7'));
});

test('ssh never relaxes host-key checking to auto-accept', () => {
  const joined = sshArgs('mac-mini', 'true').join(' ');
  assert.doesNotMatch(joined, /accept-new/i);
  assert.doesNotMatch(joined, /StrictHostKeyChecking=no/i);
});

test('a control path turns on connection multiplexing for cheap probes', () => {
  const args = sshArgs('mac-mini', 'true', { controlPath: '/tmp/wp-mac-mini' });
  assert.ok(args.includes('ControlMaster=auto'));
  assert.ok(args.includes('ControlPath=/tmp/wp-mac-mini'));
  assert.ok(args.some(a => /^ControlPersist=/.test(a)));
});

test('the target comes before the remote command', () => {
  const args = sshArgs('user@host', 'true');
  const t = args.indexOf('user@host');
  const c = args.indexOf('true');
  assert.ok(t >= 0 && c > t, 'target precedes the command');
});

test('options are terminated with -- so a target can never be read as an option', () => {
  const args = sshArgs('user@host', 'true');
  const sep = args.indexOf('--');
  const t = args.indexOf('user@host');
  assert.ok(sep >= 0 && t === sep + 1, '-- sits immediately before the target');
});

test('a sshTarget beginning with a dash is rejected before it is stored', () => {
  assert.throws(
    () => addHost([], { name: 'Evil', sshTarget: '-oProxyCommand=touch /tmp/pwned' }, idgen),
    /Invalid SSH target/,
  );
});

test('a configDir with shell metacharacters is rejected before it is stored', () => {
  let hosts = addHost([], { name: 'Mini', sshTarget: 'mac-mini' }, idgen);
  assert.throws(
    () => addRemoteAccount(hosts, hosts[0].id, { name: 'Evil', configDir: '~/.c"; touch /tmp/pwned; echo "' }, idgen),
    /Invalid config dir/,
  );
});

test('accountStep refuses to build a script around a hostile configDir', () => {
  assert.throws(
    () => accountStep({ id: 'x', name: 'Evil', configDir: '~/.c"; rm -rf ~; echo "' }),
    /Invalid config dir/,
  );
});

test('tmux and claude are probed through a login shell', () => {
  assert.match(toolStep('tmux').command, /\$SHELL -lc/);
  assert.match(toolStep('tmux').command, /command -v tmux/);
  assert.match(toolStep('claude').command, /command -v claude/);
});

// ── Remote directory validation (Add a Remote Project by hand, VIN-157) ──
// A hand-added Remote Project has no folder on the Host, so discovery can't see it. The path the
// user types is validated on the Host as an existing directory before the Project is created.

test('dirStep refuses to build a script around a path with shell metacharacters', () => {
  // The path is spliced into a remote shell test; a double-quote or $() would break out and run on
  // the Host. It is validated in the main process rather than trusted from the sidebar.
  assert.throws(() => dirStep('/home/me"; rm -rf ~; echo "'), /Invalid remote path/);
  assert.throws(() => dirStep('/home/$(touch /tmp/pwned)'), /Invalid remote path/);
});

test('dirStep builds a test that distinguishes a directory, a file and a missing path', () => {
  const step = dirStep('/home/me/work/proj');
  assert.equal(step.id, 'dir');
  assert.match(step.command, /-d "\/home\/me\/work\/proj"/);
  assert.match(step.command, /NO_DIR/);
  assert.match(step.command, /NOT_DIR/);
  assert.match(step.command, /OK/);
});

test('diagnoseDir accepts an existing directory', () => {
  assert.deepEqual(diagnoseDir({ code: 0, stdout: 'OK\n' }, { path: '/p', sshTarget: 'mac-mini' }), { ok: true });
});

test('a missing path is refused with a clear message', () => {
  const d = diagnoseDir({ code: 0, stdout: 'NO_DIR\n' }, { path: '/nope', sshTarget: 'mac-mini' });
  assert.equal(d.ok, false);
  assert.equal(d.step, 'path-missing');
  assert.match(d.message, /\/nope/);
  assert.match(d.message, /mac-mini/);
});

test('a path that is a file, not a directory, is refused with a clear message', () => {
  const d = diagnoseDir({ code: 0, stdout: 'NOT_DIR\n' }, { path: '/etc/hosts', sshTarget: 'mac-mini' });
  assert.equal(d.ok, false);
  assert.equal(d.step, 'path-not-dir');
  assert.match(d.message, /file/i);
});

test('checkRemoteDir reports the SSH failure first when the Host is Unreachable — nothing to validate', async () => {
  // Unreachable Host → the reachability diagnosis, so the caller adds nothing (VIN-157 AC).
  const run = async (step) => (step.id === 'reach' ? { code: 255, stderr: '' } : { code: 0, stdout: 'OK' });
  const d = await checkRemoteDir({ host: { sshTarget: 'mac-mini' }, path: '/home/me/p' }, run);
  assert.equal(d.ok, false);
  assert.equal(d.step, 'ssh');
});

test('checkRemoteDir validates the path on a Reachable Host', async () => {
  const run = async (step) => (step.id === 'reach' ? { code: 0 } : { code: 0, stdout: 'OK' });
  assert.deepEqual(await checkRemoteDir({ host: { sshTarget: 'mac-mini' }, path: '/home/me/p' }, run), { ok: true });

  const miss = async (step) => (step.id === 'reach' ? { code: 0 } : { code: 0, stdout: 'NO_DIR' });
  const d = await checkRemoteDir({ host: { sshTarget: 'mac-mini' }, path: '/home/me/p' }, miss);
  assert.equal(d.step, 'path-missing');
});

// ── Diagnostic mapping (one clear message + fix command per failure) ──

test('a reachable host passes the SSH check', () => {
  assert.deepEqual(diagnoseReach({ code: 0 }, { sshTarget: 'mac-mini' }), { ok: true });
});

test('an unknown host key tells the user to connect once by hand', () => {
  const d = diagnoseReach(
    { code: 255, stderr: 'Host key verification failed.' },
    { sshTarget: 'mac-mini' },
  );
  assert.equal(d.ok, false);
  assert.equal(d.step, 'hostkey');
  assert.equal(d.command, 'ssh mac-mini');
  assert.match(d.message, /host key/i);
});

test('a changed host key is its own diagnosis with a key-removal fix, not the unknown-key one', () => {
  // ssh prints the CHANGED warning *and* "Host key verification failed"; the changed case must win,
  // and `ssh <target>` would keep refusing, so the fix clears the stale entry instead.
  const d = diagnoseReach(
    {
      code: 255,
      stderr: 'WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!\nHost key verification failed.',
    },
    { sshTarget: 'mac-mini' },
  );
  assert.equal(d.ok, false);
  assert.equal(d.step, 'hostkey-changed');
  assert.notEqual(d.step, 'hostkey');
  assert.equal(d.command, 'ssh-keygen -R mac-mini');
  assert.match(d.message, /changed/i);
});

test('a host-key algorithm mismatch is a plain unreachable failure, not a verification problem', () => {
  const d = diagnoseReach(
    { code: 255, stderr: 'Unable to negotiate with 10.0.0.2 port 22: no matching host key type found.' },
    { sshTarget: 'mac-mini' },
  );
  assert.equal(d.step, 'ssh');
  assert.equal(d.command, 'ssh mac-mini');
});

test('key auth refused is its own message, distinct from host key', () => {
  const d = diagnoseReach(
    { code: 255, stderr: 'user@mac-mini: Permission denied (publickey).' },
    { sshTarget: 'mac-mini' },
  );
  assert.equal(d.ok, false);
  assert.equal(d.step, 'auth');
  assert.notEqual(d.step, 'hostkey');
  assert.match(d.message, /key/i);
});

test('a plain unreachable host maps to the reach failure', () => {
  const d = diagnoseReach(
    { code: 255, stderr: 'ssh: connect to host mac-mini port 22: Operation timed out' },
    { sshTarget: 'mac-mini' },
  );
  assert.equal(d.step, 'ssh');
  assert.equal(d.command, 'ssh mac-mini');
});

test('a missing tmux names tmux and the login-shell check command', () => {
  const d = diagnoseTool({ code: 1, stdout: '' }, { tool: 'tmux', sshTarget: 'mac-mini' });
  assert.equal(d.ok, false);
  assert.equal(d.step, 'tmux');
  assert.match(d.message, /tmux/);
  assert.match(d.command, /command -v tmux/);
});

test('a found tmux prints its path and passes', () => {
  const d = diagnoseTool({ code: 0, stdout: '/opt/homebrew/bin/tmux\n' }, { tool: 'tmux', sshTarget: 'mac-mini' });
  assert.deepEqual(d, { ok: true });
});

test('exit 0 with empty output is still a miss (command -v can lie)', () => {
  const d = diagnoseTool({ code: 0, stdout: '   \n' }, { tool: 'claude', sshTarget: 'mac-mini' });
  assert.equal(d.ok, false);
  assert.equal(d.step, 'claude');
});

test('a missing config dir is distinct from a missing token', () => {
  const acc = { id: 'a1', name: 'Work', configDir: '/home/v/work-claude' };
  const d = diagnoseAccount({ code: 0, stdout: 'NO_DIR\n' }, { account: acc, sshTarget: 'mac-mini' });
  assert.equal(d.ok, false);
  assert.equal(d.step, 'account-dir');
  assert.match(d.message, /Work/);
  assert.match(d.message, /\/home\/v\/work-claude/);
});

test('a missing token points at claude setup-token', () => {
  const acc = { id: 'a1', name: 'Work', configDir: '/home/v/work-claude' };
  const d = diagnoseAccount({ code: 0, stdout: 'NO_TOKEN\n' }, { account: acc, sshTarget: 'mac-mini' });
  assert.equal(d.ok, false);
  assert.equal(d.step, 'account-token');
  assert.match(d.message, /\.oauth-token/);
  assert.match(d.command, /claude setup-token/);
});

test('a ready account passes', () => {
  const acc = { id: 'a1', name: 'Work', configDir: '/home/v/work-claude' };
  assert.deepEqual(
    diagnoseAccount({ code: 0, stdout: 'OK\n' }, { account: acc, sshTarget: 'mac-mini' }),
    { ok: true },
  );
});

// ── Reachability classifier ──────────────────────────────────────────

test('reachability is exactly a zero exit of the probe', () => {
  assert.equal(classifyReachability({ code: 0 }), true);
  assert.equal(classifyReachability({ code: 255 }), false);
  assert.equal(classifyReachability(null), false);
});

// ── Test-connection orchestration (stop at first failure, in order) ───

function runnerFrom(outcomes) {
  // outcomes keyed by step id; accounts share the 'account' key as a queue.
  const accountQueue = (outcomes.account || []).slice();
  return async (step) => {
    if (step.id === 'account') return accountQueue.shift();
    return outcomes[step.id];
  };
}

const HOST = { id: 'h1', name: 'Mini', sshTarget: 'mac-mini' };

test('all checks passing yields ok, and the probe reaches every account', async () => {
  const accounts = [
    { id: 'default', name: 'Default', configDir: '~/.claude' },
    { id: 'a1', name: 'Work', configDir: '/w' },
  ];
  const run = runnerFrom({
    reach: { code: 0 },
    tmux: { code: 0, stdout: '/bin/tmux' },
    claude: { code: 0, stdout: '/bin/claude' },
    account: [{ code: 0, stdout: 'OK' }, { code: 0, stdout: 'OK' }],
  });
  const res = await testConnection({ host: HOST, accounts }, run);
  assert.equal(res.ok, true);
});

test('the sequence stops at the first failure and never runs later checks', async () => {
  let claudeRan = false;
  const run = async (step) => {
    if (step.id === 'reach') return { code: 0 };
    if (step.id === 'tmux') return { code: 1, stdout: '' };
    if (step.id === 'claude') { claudeRan = true; return { code: 0, stdout: '/x' }; }
    return { code: 0, stdout: 'OK' };
  };
  const res = await testConnection({ host: HOST, accounts: [] }, run);
  assert.equal(res.ok, false);
  assert.equal(res.step, 'tmux');
  assert.equal(claudeRan, false, 'claude is not probed once tmux has failed');
});

test('account checks stop at the first bad account', async () => {
  const accounts = [
    { id: 'default', name: 'Default', configDir: '~/.claude' },
    { id: 'a1', name: 'Work', configDir: '/w' },
  ];
  const run = runnerFrom({
    reach: { code: 0 },
    tmux: { code: 0, stdout: '/bin/tmux' },
    claude: { code: 0, stdout: '/bin/claude' },
    account: [{ code: 0, stdout: 'OK' }, { code: 0, stdout: 'NO_TOKEN' }],
  });
  const res = await testConnection({ host: HOST, accounts }, run);
  assert.equal(res.ok, false);
  assert.equal(res.step, 'account-token');
  assert.match(res.message, /Work/);
});

// ── Reachability-only probe (a Plain Terminal's failure path, VIN-156) ──
// A Plain Terminal uses no tmux, no claude and no Account token, so its failure is diagnosed by
// reachability alone — never the Session prerequisites — so the surfaced message matches the launch.

test('testReachability — a reachable Host is ok and no prerequisite step is probed', async () => {
  const probed = [];
  const run = async (step) => { probed.push(step.id); return step.id === 'reach' ? { code: 0 } : { code: 0, stdout: 'OK' }; };
  const res = await testReachability({ host: HOST }, run);
  assert.equal(res.ok, true);
  assert.deepEqual(probed, ['reach'], 'only the reach step runs — never tmux, claude or an account');
});

test('testReachability — an unreachable Host surfaces its reachability diagnosis, not a tmux/token fix', async () => {
  const run = async () => ({ code: 255, stderr: 'ssh: connect to host mac-mini port 22: Connection refused' });
  const res = await testReachability({ host: HOST }, run);
  assert.equal(res.ok, false);
  assert.equal(res.step, 'ssh');
  assert.match(res.message, /Can't reach mac-mini/);
  assert.ok(!/tmux|claude|\.oauth-token/.test(res.message), 'a Plain Terminal never sees a Session-prerequisite fix');
});

// ── Host store transforms (persistence shape, Default Account invariant) ──

let n = 0;
const idgen = () => `gen-${++n}`;

test('a new host is born with a Default Account and nothing else', () => {
  n = 0;
  const hosts = addHost([], { name: '  Mini  ', sshTarget: ' mac-mini ' }, idgen);
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].name, 'Mini');
  assert.equal(hosts[0].sshTarget, 'mac-mini');
  assert.equal(hosts[0].accounts.length, 1);
  assert.equal(hosts[0].accounts[0].id, 'default');
});

test('normalizeHost injects a Default Account when one is absent', () => {
  const h = normalizeHost({ id: 'h', name: 'X', sshTarget: 't', accounts: [] });
  assert.equal(h.accounts[0].id, 'default');
});

test('adding a remote account appends it under the host', () => {
  n = 0;
  let hosts = addHost([], { name: 'Mini', sshTarget: 'mac-mini' }, idgen);
  const hostId = hosts[0].id;
  hosts = addRemoteAccount(hosts, hostId, { name: 'Work', configDir: '/w' }, idgen);
  const accs = hosts[0].accounts;
  assert.equal(accs.length, 2);
  assert.equal(accs[1].name, 'Work');
  assert.equal(accs[1].configDir, '/w');
});

test('the Default Account cannot be removed', () => {
  n = 0;
  let hosts = addHost([], { name: 'Mini', sshTarget: 'mac-mini' }, idgen);
  const hostId = hosts[0].id;
  const after = removeRemoteAccount(hosts, hostId, 'default');
  assert.deepEqual(after, hosts);
});

test('a non-default account can be removed', () => {
  n = 0;
  let hosts = addHost([], { name: 'Mini', sshTarget: 'mac-mini' }, idgen);
  const hostId = hosts[0].id;
  hosts = addRemoteAccount(hosts, hostId, { name: 'Work', configDir: '/w' }, idgen);
  const accId = hosts[0].accounts[1].id;
  hosts = removeRemoteAccount(hosts, hostId, accId);
  assert.equal(hosts[0].accounts.length, 1);
});

test('removing a host drops it whole', () => {
  n = 0;
  let hosts = addHost([], { name: 'Mini', sshTarget: 'mac-mini' }, idgen);
  hosts = removeHost(hosts, hosts[0].id);
  assert.deepEqual(hosts, []);
});

// ── Active Account per Host (VIN-158) ────────────────────────────────
// One active Account per Host (CONTEXT.md). The switcher marks a Host's Account active; the
// transform records it on that Host alone, and only ever names an Account the Host really has.

test('setting a Host active Account records it on that Host alone', () => {
  let hosts = addHost([], { name: 'Mini', sshTarget: 'mac-mini' }, idgen);
  hosts = addHost(hosts, { name: 'Box', sshTarget: 'box' }, idgen);
  const [mini, box] = hosts;
  hosts = addRemoteAccount(hosts, mini.id, { name: 'Work', configDir: '/w' }, idgen);
  const workId = hosts[0].accounts[1].id;

  hosts = setActiveRemoteAccount(hosts, mini.id, workId);

  assert.equal(hosts[0].activeAccountId, workId, 'the picked Host advances');
  assert.equal(hosts[1].activeAccountId, undefined, 'the other Host is untouched');
  assert.deepEqual(hosts[1], box, 'the other Host object is unchanged');
});

test('a Host active Account that names no real Account of the Host is refused', () => {
  let hosts = addHost([], { name: 'Mini', sshTarget: 'mac-mini' }, idgen);
  const before = hosts;
  hosts = setActiveRemoteAccount(hosts, hosts[0].id, 'racc-ghost');
  assert.deepEqual(hosts, before, 'an unknown Account id leaves the list untouched');
});

test('setting the active Account of an unknown Host is a no-op', () => {
  let hosts = addHost([], { name: 'Mini', sshTarget: 'mac-mini' }, idgen);
  const before = hosts;
  hosts = setActiveRemoteAccount(hosts, 'host-ghost', 'default');
  assert.deepEqual(hosts, before);
});
