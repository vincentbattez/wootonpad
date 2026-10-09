// remote-launch.js — the pure core of starting, resuming and forking a Session on a Remote Host
// (VIN-155).
//
// From a Remote Project the user gets a live terminal running Claude on the Remote Host, inside
// tmux, under the Host's active Account. ADR 0016 fixed the launch shape after the VIN-151 spike:
//
//   ssh -tt -o BatchMode=yes … -- <target> $SHELL -lc '
//     tmux -L wootonpad new-session -A -s wp-<id> -c <path> <claude-command>
//       \; set -g prefix None \; set -g status off
//       \; set -g allow-passthrough on \; set -g set-titles on'
//
// This module owns the two things worth testing away from a PTY and the network: how that command
// is assembled, and — above all — how every session option is quoted so it survives the three
// shells it crosses. The remote login shell strips one layer of single-quoting (the `$SHELL -lc`
// wrapper), `$SHELL -lc` strips the next (the argument it hands tmux), and tmux runs that argument
// through its own `sh -c` (the claude command itself). Each layer adds exactly one single-quote, so
// a value with quotes, spaces, `$()` or newlines reaches claude as the literal the user typed.
//
// IDE emulation is off for a remote Session (ADR 0015): no `--ide`, no MCP server — `done` is set
// from the row only. The worktree flag is passed without the local `.gitignore` write (that file is
// on the Host). append-system-prompt is passed inline, never via a local temp file.
//
// Nothing here opens a socket or spawns a PTY; the adapter in main.js does that. See docs/adr/0016.

const remoteHosts = require('./remote-hosts');

const { singleQuote: q, loginShell } = remoteHosts;

// One tmux session per WootonPad Session, on one shared socket, so a re-attach always finds it.
const TMUX_SOCKET = 'wootonpad';

// Claude only emits OSC 9 notifications (what the State Dot reads for needsInput) when it believes
// it runs under a known terminal, which it decides from TERM_PROGRAM — exactly as the local spawn
// spoofs Warp. ssh does not forward TERM_PROGRAM (only TERM), so it is injected into the tmux
// session environment with `-e`, where the Claude process and every later re-attach inherit it.
const TERM_PROGRAM = 'WarpTerminal';
const TERM_PROGRAM_VERSION = 'v0.2026.07.30.08.12.stable_01';

// A session id is spliced raw into the remote command (as `-s wp-<id>` and as `-t wp-<id>`), so it
// is validated as a bare token — no quote, space or metacharacter can break out of the script.
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;
function assertSafeSessionId(sessionId) {
  if (!SESSION_ID_RE.test(String(sessionId || ''))) {
    throw new Error(
      `Invalid session id "${sessionId}": expected a bare token (letters, digits, dash, underscore).`);
  }
}
function tmuxSessionName(sessionId) {
  assertSafeSessionId(sessionId);
  return 'wp-' + sessionId;
}

// A Remote Project's path is its Project key, `ssh://<hostId>/<Host-side path>` (ADR 0016). Split it
// into the Host it runs on and the path claude's cwd must be on that Host. A local path returns null.
// This is the one sanctioned inverse of the Source's qualification (ADR 0017): launch needs both
// parts and they live only in the key, so it reads them back here and nowhere else. hostId is an
// identity — the dialable sshTarget is resolved from it through the Host store, never from the key.
function parseRemoteProjectPath(projectPath) {
  const m = /^ssh:\/\/([^/]+)(\/.*)$/.exec(String(projectPath || ''));
  if (!m) return null;
  return { hostId: m[1], remotePath: m[2] };
}

// ── The claude command ───────────────────────────────────────────────
// The command tmux runs via sh -c. CLAUDE_CONFIG_DIR picks the Account (the Default Account is the
// Host's ~/.claude, so it is left unset); the .oauth-token inside that dir is loaded by claude
// itself. CLAUDE_CODE_OAUTH_TOKEN is deliberately never used — it would override the config dir and
// collapse every Account into one (ADR 0016).
function buildClaudeCommand({ sessionId, isNew, forkFrom, account, options = {} }) {
  let cmd;
  if (forkFrom) {
    // The fork command itself uses only forkFrom (q()-quoted), not sessionId — this fail-fast guards
    // the id that tmuxSessionName will later interpolate unquoted into wp-<id>.
    assertSafeSessionId(sessionId);
    cmd = `claude --resume ${q(forkFrom)} --fork-session`;
  } else if (isNew) {
    cmd = `claude --session-id ${q(sessionId)}`;
  } else {
    cmd = `claude --resume ${q(sessionId)}`;
  }

  if (options.dangerouslySkipPermissions) {
    cmd += ' --dangerously-skip-permissions';
  } else if (options.permissionMode) {
    cmd += ` --permission-mode ${q(options.permissionMode)}`;
  }
  if (options.worktree) {
    // No local .gitignore write (VIN-155): the worktree lives on the Host, so there is no local file
    // to amend — the flag is simply forwarded.
    cmd += ' --worktree';
    if (options.worktreeName) cmd += ` ${q(options.worktreeName)}`;
  }
  if (options.chrome) cmd += ' --chrome';
  if (options.addDirs) {
    for (const dir of String(options.addDirs).split(',').map(d => d.trim()).filter(Boolean)) {
      cmd += ` --add-dir ${q(dir)}`;
    }
  }
  if (options.appendSystemPrompt) {
    // Inline, not via a local temp file (the temp dir is on the wrong machine): the prompt is
    // single-quoted here and rides the same nesting every other option does.
    cmd += ` --append-system-prompt ${q(options.appendSystemPrompt)}`;
  }

  // A non-Default Account exports its config dir just before claude, so it wins even when a
  // pre-launch wrapper (aws-vault, …) spawns claude. ~ is rewritten to $HOME because a bare ~ does
  // not expand in an assignment; the dir is validated to a metacharacter-free path so it is safe
  // unquoted (and $HOME must expand, so it cannot be quoted).
  if (account && account.id !== 'default') {
    remoteHosts.assertSafeConfigDir(account.configDir || '~/.claude');
    cmd = `env CLAUDE_CONFIG_DIR=${remoteHosts.remoteConfigDir(account)} ${cmd}`;
  }

  // Pre-launch command is prepended verbatim, ahead of the Account env, exactly as locally.
  if (options.preLaunchCmd) cmd = `${options.preLaunchCmd} ${cmd}`;

  return cmd;
}

// ── The tmux launch ──────────────────────────────────────────────────
// The `$SHELL -lc` payload. `new-session -A` attaches if wp-<id> already exists (a re-attach) and
// otherwise creates it running claudeCommand — so close-tab/relaunch re-attaches the same Claude,
// never restarts it. The claude command is one single-quoted argument tmux runs through sh -c; `-c`
// starts it in the Project's Host-side path. The four options are the spike's / ADR 0016's, inline
// so nothing is written to the user's tmux config, each after a literal `;` (written `\;` for the
// login shell to pass through): prefix None (no key capture), status off, passthrough on (OSC 9),
// titles on (OSC 0) — the sequences the State Dot reads cross the seam unchanged.
function buildTmuxCommand({ sessionId, remotePath, claudeCommand }) {
  const name = tmuxSessionName(sessionId);
  return (
    `tmux -L ${TMUX_SOCKET} new-session -A -s ${name}`
    + ` -e TERM_PROGRAM=${TERM_PROGRAM} -e TERM_PROGRAM_VERSION=${TERM_PROGRAM_VERSION}`
    + ` -c ${q(remotePath)} ${q(claudeCommand)}`
    + ' \\; set -g prefix None'
    + ' \\; set -g status off'
    + ' \\; set -g allow-passthrough on'
    + ' \\; set -g set-titles on'
  );
}

// ── ssh argv ─────────────────────────────────────────────────────────
// A launch forces a PTY (`-tt`): Claude is a TUI and needs a terminal on the far side. Every other
// safety (BatchMode=yes, never accept-new) comes from remote-hosts.sshOptions, asserted by its own
// tests and re-asserted here. A literal `--` terminates options before the (validated) target.
function sshInvoke(sshTarget, remoteCommand, { tty = false } = {}) {
  remoteHosts.assertSafeSshTarget(sshTarget);
  const args = [];
  if (tty) args.push('-tt');
  for (const o of remoteHosts.sshOptions()) args.push('-o', o);
  args.push('--', sshTarget, remoteCommand);
  return args;
}

function buildRemoteLaunchArgs({ sshTarget, sessionId, isNew, forkFrom, account, options, remotePath }) {
  const claudeCommand = buildClaudeCommand({ sessionId, isNew, forkFrom, account, options });
  const inner = buildTmuxCommand({ sessionId, remotePath, claudeCommand });
  return sshInvoke(sshTarget, loginShell(inner), { tty: true });
}

// Stop kills the tmux session on the Host (Close tab only detaches). No PTY needed.
function buildStopArgs({ sshTarget, sessionId }) {
  const name = tmuxSessionName(sessionId);
  return sshInvoke(sshTarget, loginShell(`tmux -L ${TMUX_SOCKET} kill-session -t ${name}`));
}

// After a fork or plan-accept re-keys the Session (detected through the mirror), the tmux session is
// renamed to follow the real id, so a later re-attach finds it (VIN-155).
function buildRenameArgs({ sshTarget, oldSessionId, newSessionId }) {
  const from = tmuxSessionName(oldSessionId);
  const to = tmuxSessionName(newSessionId);
  return sshInvoke(sshTarget, loginShell(`tmux -L ${TMUX_SOCKET} rename-session -t ${from} ${to}`));
}

// ── The re-key decision ──────────────────────────────────────────────
// After a Host's mirror changes, fork / plan-accept detection may have re-keyed some of its live
// remote Sessions. These two pure functions are the decision the adapter wires around its I/O: what
// to re-detect, and — once detection has run — which tmux sessions must follow a new id. The adapter
// (main.js) runs the detection and the execFile rename; it makes no decision of its own.

// The on-disk folders whose transitions the adapter must re-detect: one per distinct folder across
// the given live remote Sessions (an un-derivable folder is skipped).
function remoteTransitionFolders(sessions) {
  return [...new Set(sessions.map(s => s.projectFolder).filter(Boolean))];
}

// The tmux renames to apply after detection: one `{ session, oldId, newId }` for each Session whose
// real id (discovered by detection) now differs from the id its tmux session still carries. A
// Session that did not re-key yields nothing.
function planRemoteTmuxRenames(sessions) {
  const renames = [];
  for (const s of sessions) {
    const current = s.realSessionId || s.remoteTmuxId;
    if (current && current !== s.remoteTmuxId) {
      renames.push({ session: s, oldId: s.remoteTmuxId, newId: current });
    }
  }
  return renames;
}

module.exports = {
  TMUX_SOCKET, tmuxSessionName, assertSafeSessionId, parseRemoteProjectPath,
  buildClaudeCommand, buildTmuxCommand, buildRemoteLaunchArgs,
  buildStopArgs, buildRenameArgs,
  remoteTransitionFolders, planRemoteTmuxRenames,
};
