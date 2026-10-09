const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sshArgs,
  reachStep, toolStep, accountStep,
  diagnoseReach, diagnoseTool, diagnoseAccount,
  classifyReachability,
  testConnection,
  normalizeHost, addHost, addRemoteAccount, removeHost, removeRemoteAccount,
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

test('tmux and claude are probed through a login shell', () => {
  assert.match(toolStep('tmux').command, /\$SHELL -lc/);
  assert.match(toolStep('tmux').command, /command -v tmux/);
  assert.match(toolStep('claude').command, /command -v claude/);
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
