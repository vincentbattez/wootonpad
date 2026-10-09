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

// A Remote Project key is ssh://<hostId>/<path> (ADR 0016). The scheme is otherwise opaque — code
// never splits it back — but running git on the Host is the one seam that must, because git has to
// cd into <path> there. remotePath is always absolute: Claude records an absolute cwd, so that is
// what the key carries. Returns { hostId, remotePath }, or null for a local (identity) key so a
// caller can fall straight through to local git.
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
// that turns an opaque key back into a dialable endpoint (ADR 0016) pure and tested.
function resolveRemoteGitArgs(projectKey, gitArgv, hosts, opts = {}) {
  const parsed = parseRemoteKey(projectKey);
  if (!parsed) return null;
  const host = (hosts || []).find(h => h && h.id === parsed.hostId);
  if (!host) return null;
  return { host, args: remoteGitArgs(host.sshTarget, parsed.remotePath, gitArgv, opts) };
}

module.exports = { parseRemoteKey, remoteGitArgs, resolveRemoteGitArgs };
