// remote-hosts.js — the pure core of Remote Hosts (VIN-153).
//
// A Host is a machine WootonPad runs Sessions on (CONTEXT.md, Hosts). This module owns the two
// things about a Remote Host that are hard to get right and worth testing away from Electron and
// the network: how a command is addressed to the Host over SSH so no prompt can ever block the
// app, and how a failed prerequisite becomes one clear message with the exact command to fix it.
//
// Nothing here opens a socket. The caller injects a `run(step)` that executes a step's command on
// the Host and returns { code, stdout, stderr }; everything else is a pure function of its result.
// See docs/adr/0016 for why ssh + tmux, BatchMode=yes, and a per-Account .oauth-token.

// ── SSH addressing ───────────────────────────────────────────────────
// BatchMode=yes is the whole safety story: ssh fails instead of waiting on a password or a
// host-key prompt, so neither can ever block the app. The host key is deliberately NOT relaxed to
// accept-new — accepting an unknown key is the user's call to make once, by hand (ADR 0016).

const DEFAULT_CONNECT_TIMEOUT = 10; // seconds
const CONTROL_PERSIST = 60; // seconds a multiplexed master lingers, so probes are cheap

function sshOptions({ connectTimeout = DEFAULT_CONNECT_TIMEOUT, controlPath } = {}) {
  const opts = [`BatchMode=yes`, `ConnectTimeout=${connectTimeout}`];
  if (controlPath) {
    opts.push('ControlMaster=auto', `ControlPath=${controlPath}`, `ControlPersist=${CONTROL_PERSIST}`);
  }
  return opts;
}

// A Host's sshTarget is an ssh_config alias or user@host. It becomes argv for `ssh`, so a value
// beginning with a dash (e.g. `-oProxyCommand=…`) would be read by ssh as an option and run an
// arbitrary command on THIS machine. We validate it in the main process rather than trust what the
// sidebar sent (CODING_STANDARDS), and sshArgs still terminates options with `--` as a second wall.
const SSH_TARGET_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
function assertSafeSshTarget(sshTarget) {
  if (!SSH_TARGET_RE.test(sshTarget)) {
    throw new Error(
      `Invalid SSH target "${sshTarget}": expected an ssh_config alias or user@host — letters, `
      + `digits, dot, dash, underscore and @, never a leading dash.`);
  }
}

// The argv for `ssh`, target before command, every option behind its own -o. A literal `--`
// terminates option parsing before the target, so a target can never be mistaken for an option.
function sshArgs(sshTarget, remoteCommand, opts = {}) {
  const args = [];
  for (const o of sshOptions(opts)) args.push('-o', o);
  args.push('--', sshTarget);
  if (remoteCommand) args.push(remoteCommand);
  return args;
}

// Wrap a command so it runs through a login shell: a non-interactive SSH session has no Homebrew
// PATH, so `tmux` and `claude` are only found via `$SHELL -lc` (ADR 0016).
function singleQuote(s) {
  return `'` + String(s).split(`'`).join(`'\\''`) + `'`;
}
function loginShell(inner) {
  return `$SHELL -lc ${singleQuote(inner)}`;
}

// ── Prerequisite steps ───────────────────────────────────────────────
// Each step is { id, command }: the command the injected runner executes on the Host.

function reachStep() {
  return { id: 'reach', command: 'true' };
}
function toolStep(tool) {
  return { id: tool, command: loginShell(`command -v ${tool}`) };
}
// A configDir is interpolated into a double-quoted remote shell script, so a double-quote (or any
// shell metacharacter) in it would break out and run on the Host. We restrict it to a plain path
// before it ever reaches the script — validated in the main process, not trusted from the sidebar
// (CODING_STANDARDS) — so the expansion below stays inert.
const CONFIG_DIR_RE = /^[A-Za-z0-9._/~-]+$/;
function assertSafeConfigDir(configDir) {
  if (!CONFIG_DIR_RE.test(configDir)) {
    throw new Error(
      `Invalid config dir "${configDir}": expected a path of letters, digits, dot, dash, `
      + `underscore, slash and ~ — shell metacharacters are rejected.`);
  }
}

// The Account check reports which prerequisite is missing in one round trip, so the diagnosis can
// tell a missing config dir from a missing token. $HOME expands inside the double quotes; a
// leading ~ is rewritten so the Default Account's ~/.claude resolves on the Host.
function remoteConfigDir(account) {
  const dir = account.configDir || '~/.claude';
  return dir.startsWith('~') ? '$HOME' + dir.slice(1) : dir;
}
function accountStep(account) {
  assertSafeConfigDir(account.configDir || '~/.claude');
  const d = remoteConfigDir(account);
  const script =
    `if [ ! -d "${d}" ]; then echo NO_DIR; ` +
    `elif [ ! -f "${d}/.oauth-token" ]; then echo NO_TOKEN; ` +
    `else echo OK; fi`;
  return { id: 'account', account, command: script };
}

// ── Diagnostics ──────────────────────────────────────────────────────
// A failure is { ok:false, step, message, command } — the step that broke, what the user sees, and
// the exact command they should run to fix it. Success is { ok:true }.

function fail(step, message, command) {
  return { ok: false, step, message, command };
}

function diagnoseReach(result, { sshTarget }) {
  if (result && result.code === 0) return { ok: true };
  const stderr = (result && result.stderr) || '';
  const connect = `ssh ${sshTarget}`;
  if (/host key verification failed/i.test(stderr)
    || /remote host identification has changed/i.test(stderr)
    || /no matching host key/i.test(stderr)) {
    return fail('hostkey',
      `The host key for ${sshTarget} isn't known yet — WootonPad never accepts one for you. `
      + `Connect once by hand to review and accept it, then test again.`,
      connect);
  }
  if (/permission denied/i.test(stderr)) {
    return fail('auth',
      `${sshTarget} refused key authentication. Make sure your SSH key is authorised there `
      + `(e.g. ssh-copy-id ${sshTarget}); WootonPad never sends a password.`,
      connect);
  }
  return fail('ssh',
    `Can't reach ${sshTarget} over SSH. Check it's powered on and reachable with: ssh ${sshTarget}`,
    connect);
}

function diagnoseTool(result, { tool, sshTarget }) {
  if (result && result.code === 0 && String(result.stdout || '').trim()) return { ok: true };
  return fail(tool,
    `${tool} isn't available through a login shell on ${sshTarget}. Install it there and make sure `
    + `it's on the login PATH.`,
    `ssh ${sshTarget} ${singleQuote(loginShell(`command -v ${tool}`))}`);
}

function diagnoseAccount(result, { account, sshTarget }) {
  const out = String((result && result.stdout) || '').trim();
  const dir = account.configDir || '~/.claude';
  if (out === 'OK') return { ok: true };
  if (out === 'NO_DIR') {
    return fail('account-dir',
      `Account "${account.name}": its config dir ${dir} doesn't exist on ${sshTarget}. `
      + `Create it or correct the path.`,
      `ssh ${sshTarget} ${singleQuote(`mkdir -p ${dir}`)}`);
  }
  if (out === 'NO_TOKEN') {
    return fail('account-token',
      `Account "${account.name}": no .oauth-token in ${dir} on ${sshTarget}. Generate one with `
      + `\`claude setup-token\` and save it as ${dir}/.oauth-token — CLAUDE_CODE_OAUTH_TOKEN would `
      + `otherwise override the config dir.`,
      `ssh ${sshTarget} ${singleQuote(loginShell('claude setup-token'))}`);
  }
  return fail('account',
    `Couldn't check account "${account.name}" on ${sshTarget} — the connection may have dropped mid-check.`,
    `ssh ${sshTarget}`);
}

// ── Reachability ─────────────────────────────────────────────────────
// Reachable is exactly a zero exit of the (multiplexed, BatchMode) probe. Nothing softer: a
// timeout, a refused key or a dropped link are all Unreachable (CONTEXT.md, Reachable).
function classifyReachability(result) {
  return !!(result && result.code === 0);
}

// ── Test connection ──────────────────────────────────────────────────
// Run the prerequisite checks in order and stop at the first failure, returning its diagnosis.
// `run(step)` is injected: the real one shells out over SSH, the test one answers from a table.
async function testConnection({ host, accounts = [] }, run) {
  const ctx = { sshTarget: host.sshTarget };

  let d = diagnoseReach(await run(reachStep()), ctx);
  if (!d.ok) return d;

  d = diagnoseTool(await run(toolStep('tmux')), { ...ctx, tool: 'tmux' });
  if (!d.ok) return d;

  d = diagnoseTool(await run(toolStep('claude')), { ...ctx, tool: 'claude' });
  if (!d.ok) return d;

  for (const account of accounts) {
    d = diagnoseAccount(await run(accountStep(account)), { ...ctx, account });
    if (!d.ok) return d;
  }

  return { ok: true, message: `${host.sshTarget} is ready.` };
}

// ── Host store transforms ────────────────────────────────────────────
// Pure list→list operations over the persisted Hosts. The Default Account is an invariant: every
// Host has one, and it can never be removed (CONTEXT.md, Account). Local Accounts are a different
// store entirely and are never touched here.

function defaultRemoteAccount() {
  return { id: 'default', name: 'Default', configDir: '~/.claude' };
}

function normalizeHost(host) {
  const accounts = Array.isArray(host.accounts) ? host.accounts.slice() : [];
  if (!accounts.some(a => a.id === 'default')) accounts.unshift(defaultRemoteAccount());
  return { ...host, accounts };
}

function addHost(hosts, { name, sshTarget }, idgen) {
  const target = String(sshTarget || '').trim();
  assertSafeSshTarget(target);
  const host = normalizeHost({
    id: idgen(),
    name: String(name || '').trim(),
    sshTarget: target,
    accounts: [],
  });
  return [...hosts, host];
}

function addRemoteAccount(hosts, hostId, { name, configDir }, idgen) {
  const dir = String(configDir || '').trim();
  assertSafeConfigDir(dir);
  const account = { id: idgen(), name: String(name || '').trim(), configDir: dir };
  return hosts.map(h => h.id === hostId ? { ...h, accounts: [...h.accounts, account] } : h);
}

function removeHost(hosts, hostId) {
  return hosts.filter(h => h.id !== hostId);
}

function removeRemoteAccount(hosts, hostId, accountId) {
  if (accountId === 'default') return hosts; // the Default Account always exists
  return hosts.map(h => h.id === hostId
    ? { ...h, accounts: h.accounts.filter(a => a.id !== accountId) }
    : h);
}

module.exports = {
  sshArgs, sshOptions, loginShell,
  assertSafeSshTarget, assertSafeConfigDir,
  reachStep, toolStep, accountStep, remoteConfigDir,
  diagnoseReach, diagnoseTool, diagnoseAccount,
  classifyReachability,
  testConnection,
  defaultRemoteAccount, normalizeHost, addHost, addRemoteAccount, removeHost, removeRemoteAccount,
};
