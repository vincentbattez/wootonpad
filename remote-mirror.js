// remote-mirror.js — the pure core of Remote Project mirroring (VIN-154).
//
// A Remote Host's Sessions are discovered by mirroring the active Account's `projects` directory
// down to the Local Host with rsync over SSH, then indexing that mirror as one more session-cache
// Source (CONTEXT.md, Remote Project; ADR 0016). This module owns the parts of that worth testing
// away from the network and Electron: how the remote projects dir is addressed for rsync (with the
// same BatchMode safety as every other command — no prompt may ever block the app), where the
// local mirror lives, which Source each Host registers, and how the sidebar payload is annotated
// with the Host name (the remote icon's tooltip) and reachability (greyed when Unreachable).
//
// Nothing here shells out or touches disk. The adapter (remote-mirror-ipc.js) is the only part
// that runs rsync, registers Sources, and drives the poll timer.

const path = require('path');
const remoteHosts = require('./remote-hosts');

// ── Accounts ─────────────────────────────────────────────────────────
// One active Account per Host (CONTEXT.md). When none is marked active, fall back to the Default
// Account (~/.claude) — an invariant every Host carries — so there is always something to mirror.
function activeAccount(host) {
  const accounts = Array.isArray(host && host.accounts) ? host.accounts : [];
  const active = host && host.activeAccountId && accounts.find(a => a.id === host.activeAccountId);
  return active || accounts.find(a => a.id === 'default') || remoteHosts.defaultRemoteAccount();
}

// The remote `projects` directory of an Account: <configDir>/projects. A leading ~ is preserved —
// rsync hands the path to the remote login shell, which expands it. The config dir is validated
// (it is spliced into an rsync source spec) exactly as in remote-hosts, rejecting metacharacters.
function remoteProjectsDir(account) {
  const dir = (account && account.configDir) || '~/.claude';
  remoteHosts.assertSafeConfigDir(dir);
  return dir.replace(/\/+$/, '') + '/projects';
}

// Where a Host's mirror lives locally: <mirrorRoot>/<hostId>/<accountId>. Scoped by the active
// Account so switching the active Account starts a fresh mirror rather than mixing two Accounts'
// trees in one directory.
function mirrorDirFor(mirrorRoot, host) {
  return path.join(mirrorRoot, host.id, activeAccount(host).id);
}

// ── rsync addressing ─────────────────────────────────────────────────
// The ssh transport rsync runs over. Reuses remote-hosts.sshOptions so BatchMode=yes is the whole
// safety story here too (ssh fails instead of waiting on a password or a host-key prompt), and the
// host key is never auto-accepted. ControlPath is deliberately not passed: rsync splits the -e
// string on whitespace (it is not a full shell), so a socket path with a space would break it.
function rsyncSshCommand(opts = {}) {
  const parts = ['ssh'];
  for (const o of remoteHosts.sshOptions({ connectTimeout: opts.connectTimeout })) parts.push('-o', o);
  return parts.join(' ');
}

// The argv for `rsync`. -a preserves the tree, -z compresses over the wire, --delete makes the
// mirror an exact copy so a Session removed on the Host disappears locally too. --out-format=%n
// prints one line per transferred item so the adapter can re-index only when something changed.
// A literal -- terminates option parsing before the source spec. The ssh target is validated in
// the main process rather than trusted from the renderer (CODING_STANDARDS); a leading dash would
// otherwise be read by ssh as an option and run a command on this machine.
function rsyncArgs({ sshTarget, remoteProjectsDir: rpd, localDir, connectTimeout } = {}) {
  remoteHosts.assertSafeSshTarget(sshTarget);
  return [
    '-az', '--delete', '--out-format=%n',
    '-e', rsyncSshCommand({ connectTimeout }),
    '--', `${sshTarget}:${rpd}/`, `${localDir}/`,
  ];
}

// rsync with --out-format prints the name of every item it transferred, nothing for a no-op sync.
// The base-directory line ("./") is not a change. True iff any real item was transferred.
function hasRsyncChanges(stdout) {
  return String(stdout || '').split('\n').some(line => {
    const t = line.trim();
    return t && t !== './';
  });
}

// ── Source descriptors ───────────────────────────────────────────────
// The two ids a Host's mirror is keyed by, as their own functions so every other module that must
// address the same Source or cache rows (the removal purge forgets exactly these — remote-removal-
// ipc.js) shares one definition and can't drift onto the wrong Source. `sourceId` is the session-
// cache Source id (one per Host); `cacheAccountId` is the accountId its cached Sessions carry,
// Host-scoped so it can never collide with a Local Account's id.
function sourceId(hostId) { return 'ssh:' + hostId; }
function cacheAccountId(hostId, accountId) { return 'ssh:' + hostId + ':' + accountId; }

// The session-cache Source a Host's mirror registers. One per Host (its active Account). The
// adapter diffs reconcile() against what is currently registered and (un)registers the difference.
function sourceDescriptorFor(host, mirrorRoot) {
  const account = activeAccount(host);
  return {
    id: sourceId(host.id),
    hostId: host.id,
    accountId: cacheAccountId(host.id, account.id),
    projectsDir: mirrorDirFor(mirrorRoot, host),
    sshTarget: host.sshTarget,
    remoteProjectsDir: remoteProjectsDir(account),
  };
}

function reconcile(hosts, { mirrorRoot } = {}) {
  return (hosts || []).map(h => sourceDescriptorFor(h, mirrorRoot));
}

// ── Payload annotation ───────────────────────────────────────────────
// Enrich the sidebar project payload with the Host facts the renderer needs but the cache does not
// know: a remote Project gets its Host's name (the icon tooltip), and whether that Host is
// currently Reachable (greyed when not). Local Projects pass through untouched. The project already
// carries `remote` and `hostId` from the cache build; this only adds what lives in the Host store
// and the live reachability map, keeping the cache ignorant of either.
function annotateProjects(projects, hosts = [], reachability = {}) {
  const byId = new Map((hosts || []).map(h => [h.id, h]));
  return (projects || []).map(p => {
    if (!p || !p.remote || !p.hostId) return p;
    const host = byId.get(p.hostId);
    return {
      ...p,
      hostName: host ? host.name : null,
      // Greyed only once the probe has concluded Unreachable. `undefined` (not yet probed) is not
      // greyed — a freshly launched app shows remote Projects normally until proven down.
      greyed: reachability[p.hostId] === false,
    };
  });
}

module.exports = {
  activeAccount, remoteProjectsDir, mirrorDirFor,
  rsyncSshCommand, rsyncArgs, hasRsyncChanges,
  sourceId, cacheAccountId, sourceDescriptorFor, reconcile, annotateProjects,
};
