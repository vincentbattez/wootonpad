// remote-git.js — the pure core of the remote light Git Snapshot (VIN-159).
//
// A Remote Project shows the same sidebar git badge as a local one — branch and the size of its
// working diff — read from git running on its Remote Host. Git already goes through one argv
// interface (ADR 0007); a WSL account redirects that interface into its distribution, and a Remote
// Project redirects it the same way — over SSH, through the Host's login shell (ADR 0016). This
// module owns the redirection worth testing away from the network: how a Remote Project key
// resolves to the argv that runs a git command on the Host, in the Project's directory, with the
// same BatchMode safety as every other SSH command (no prompt may ever block the app) and the same
// argv-not-shell quoting ADR 0007 gives local git (a path with a space is data, never code).
//
// Nothing here opens a socket. The adapter in main.js injects the Host list and shells out ssh.

const remoteHosts = require('./remote-hosts');

// A Remote Project key is ssh://<hostId>/<path> (ADR 0016-remote-project-key-scheme). That scheme is
// otherwise opaque — code never splits it back — but running the light Git Snapshot on the Host is
// the one seam that must, because git has to cd into <path> there. ADR 0017 amends 0016 to carve out
// exactly this seam (and only this one) as allowed to resolve a key to a (hostId, path) endpoint.
// remotePath is always absolute: Claude records an absolute cwd, so that is what the key carries.
// Returns { hostId, remotePath }, or null for a local (identity) key so a caller can fall straight
// through to local git.
const REMOTE_KEY_RE = /^ssh:\/\/([^/]+)(\/.*)$/;
function parseRemoteKey(projectKey) {
  const m = REMOTE_KEY_RE.exec(String(projectKey || ''));
  return m ? { hostId: m[1], remotePath: m[2] } : null;
}

// The argv for `ssh` that runs `gitArgv` on `sshTarget`, in `remotePath`, through the login shell
// ($SHELL -lc, so the user's PATH — and the git it points at — is present, ADR 0016). The directory
// and every git argument are single-quoted into the remote command, so a path or filename holding a
// space or a shell metacharacter is one argument and never code. BatchMode=yes and the never-relaxed
// host key come from remote-hosts.sshArgs.
function remoteGitArgs(sshTarget, remotePath, gitArgv, opts = {}) {
  remoteHosts.assertSafeSshTarget(sshTarget);
  const sq = remoteHosts.singleQuote;
  const command = ['git', ...gitArgv].map(sq).join(' ');
  const inner = `cd ${sq(remotePath)} && ${command}`;
  return remoteHosts.sshArgs(sshTarget, remoteHosts.loginShell(inner), opts);
}

// Resolve a Remote Project key to the ssh argv for a git command, given the current Host list.
// Returns { host, args }, or null for a local key (the runner runs git locally, unchanged) or a
// remote key whose Host is unknown — a Host the user removed never dials out. Keeps the one place
// that turns an opaque key back into a dialable endpoint (ADR 0017, the seam 0016 carves out) pure
// and tested.
function resolveRemoteGitArgs(projectKey, gitArgv, hosts, opts = {}) {
  const parsed = parseRemoteKey(projectKey);
  if (!parsed) return null;
  const host = (hosts || []).find(h => h && h.id === parsed.hostId);
  if (!host) return null;
  return { host, args: remoteGitArgs(host.sshTarget, parsed.remotePath, gitArgv, opts) };
}

// The stale-while-unreachable policy for a Remote Project's light badge (VIN-159), kept pure so it
// can be tested away from Electron and the cache. Two rules the acceptance criteria name:
//   • dial — a fresh read is attempted only when the Host is not known Unreachable (reachable !==
//     false); a Host known down is never dialed, so an offline Mini costs nothing and logs nothing.
//     undefined (not yet probed) may still try.
//   • snapshot/updated — once a read returns, a null/absent branch (ssh dropped, or no git
//     repository) keeps the last good Snapshot (`base`), shown stale, rather than blanking the
//     badge (updated:false); otherwise the fresh branch and diff counts replace it (updated:true).
// `read` is the fresh light Snapshot, or null/undefined before a read is attempted. The thin IPC
// send/cache wiring (TTL freshness, containers, setSetting) stays with the caller in main.js.
function planRemoteSnapshot(base, reachable, read) {
  const dial = reachable !== false;
  if (!read || read.branch == null) return { dial, updated: false, snapshot: base };
  return { dial, updated: true, snapshot: { branch: read.branch, added: read.added, deleted: read.deleted } };
}

module.exports = { parseRemoteKey, remoteGitArgs, resolveRemoteGitArgs, planRemoteSnapshot };
