// remote-launch.js is the pure core of starting, resuming and forking a Session on a Remote Host
// (VIN-155). It owns the launch-command shape ADR 0016 fixed after the VIN-151 spike: `ssh -tt`, a
// login shell, `tmux -L wootonpad new -A -s wp-<id>` with its inline options, `CLAUDE_CONFIG_DIR`
// for a non-Default Account, and every session option quoted so it survives the three shells it
// crosses (the remote login shell → `$SHELL -lc` → tmux's `sh -c`). No socket, no PTY: every
// function is a function of plain values, tested here (the AC7 deliverable — quoting, Account,
// options).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TMUX_SOCKET, tmuxSessionName, assertSafeSessionId, parseRemoteProjectPath,
  buildClaudeCommand, buildTmuxCommand, buildRemoteLaunchArgs,
  buildStopArgs, buildRenameArgs,
  remoteTransitionFolders, planRemoteTmuxRenames,
  listSessionsCommand, parseTmuxSessionList, hasSessionCommand, paneTitleCommand,
  buildAttachArgs, sessionsToReattach, classifyRemotePtyExit, remotePtyEnv,
  isRemoteDropCandidate, shouldReportRemoteLaunchFailure,
} = require('../remote-launch');

// --- an independent single-quote oracle -------------------------------------------------------
// The inverse of POSIX single-quoting (a single-quoted blob with internal ' written as '\''). Used
// to un-nest the layers a launch string crosses and recover the literal that reached claude — an
// oracle derived from how a shell strips quotes, NOT from how the builder adds them, so a test that
// a nasty value survives is not tautological.
function unSingleQuote(s) {
  assert.ok(s.startsWith("'") && s.endsWith("'"), `not single-quoted: ${s}`);
  return s.slice(1, -1).split("'\\''").join("'");
}

// A POSIX shell word splitter: splits on unquoted whitespace, resolves single-quoted runs (so
// `'a'\''b'` concatenates to a'b) and `\x` escapes outside quotes (so `\;` is a literal ;). Another
// shell-derived oracle, used to un-nest a launch string back to the argv each shell layer produces.
function shellSplit(s) {
  const words = [];
  let cur = '';
  let had = false;
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === "'") inQuote = false; else { cur += c; }
      continue;
    }
    if (c === "'") { inQuote = true; had = true; continue; }
    if (c === '\\') { cur += s[++i]; had = true; continue; }
    if (c === ' ' || c === '\t') { if (had) { words.push(cur); cur = ''; had = false; } continue; }
    cur += c; had = true;
  }
  if (had) words.push(cur);
  return words;
}

const DEFAULT_ACCOUNT = { id: 'default', name: 'Default', configDir: '~/.claude' };
const WORK_ACCOUNT = { id: 'racc-7', name: 'Work', configDir: '~/work/.claude' };

// --- tmux session name ------------------------------------------------------------------------

test('tmuxSessionName prefixes wp- so a Session maps to one tmux session', () => {
  assert.equal(tmuxSessionName('abc123'), 'wp-abc123');
});

test('tmuxSessionName accepts a UUID (dashes are a bare token)', () => {
  assert.equal(tmuxSessionName('3f2a-9c1d-44'), 'wp-3f2a-9c1d-44');
});

test('assertSafeSessionId rejects anything but a bare token, so it cannot escape the remote script', () => {
  for (const bad of ["a'b", 'a;b', 'a b', 'a$b', '../x', 'a`b', '']) {
    assert.throws(() => assertSafeSessionId(bad), /session id/i, `should reject ${JSON.stringify(bad)}`);
  }
  assert.doesNotThrow(() => assertSafeSessionId('sess-1_2'));
});

// --- Remote Project path ----------------------------------------------------------------------

test('parseRemoteProjectPath splits ssh://<hostId>/<path> into host and the Host-side path', () => {
  assert.deepEqual(
    parseRemoteProjectPath('ssh://host-abc/Users/vincent/proj'),
    { hostId: 'host-abc', remotePath: '/Users/vincent/proj' });
});

test('parseRemoteProjectPath returns null for a local path', () => {
  assert.equal(parseRemoteProjectPath('/Users/vincent/proj'), null);
  assert.equal(parseRemoteProjectPath('C:\\Users\\proj'), null);
});

// --- claude command: the verbs (new / resume / fork) ------------------------------------------

test('buildClaudeCommand — new uses --session-id with the chosen id', () => {
  assert.equal(
    buildClaudeCommand({ sessionId: 'sess-1', isNew: true, account: DEFAULT_ACCOUNT, options: {} }),
    "claude --session-id 'sess-1'");
});

test('buildClaudeCommand — resume uses --resume on the same id', () => {
  assert.equal(
    buildClaudeCommand({ sessionId: 'sess-1', isNew: false, account: DEFAULT_ACCOUNT, options: {} }),
    "claude --resume 'sess-1'");
});

test('buildClaudeCommand — fork resumes the parent and --fork-session', () => {
  assert.equal(
    buildClaudeCommand({ sessionId: 'temp-1', forkFrom: 'parent-9', account: DEFAULT_ACCOUNT, options: {} }),
    "claude --resume 'parent-9' --fork-session");
});

// --- claude command: the Account (CLAUDE_CONFIG_DIR) ------------------------------------------

test('buildClaudeCommand — the Default Account sets no CLAUDE_CONFIG_DIR (it is the default)', () => {
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: DEFAULT_ACCOUNT, options: {} });
  assert.ok(!/CLAUDE_CONFIG_DIR/.test(cmd), cmd);
});

test('buildClaudeCommand — a non-Default Account exports CLAUDE_CONFIG_DIR with ~ expanded to $HOME', () => {
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: WORK_ACCOUNT, options: {} });
  assert.equal(cmd, "env CLAUDE_CONFIG_DIR=$HOME/work/.claude claude --session-id 's'");
});

test('buildClaudeCommand — a config dir with shell metacharacters is rejected', () => {
  assert.throws(
    () => buildClaudeCommand({ sessionId: 's', isNew: true, account: { id: 'x', configDir: '~/a;rm -rf' }, options: {} }),
    /config dir/i);
});

// --- claude command: the options --------------------------------------------------------------

test('buildClaudeCommand — permission mode is passed quoted', () => {
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: DEFAULT_ACCOUNT, options: { permissionMode: 'plan' } });
  assert.equal(cmd, "claude --session-id 's' --permission-mode 'plan'");
});

test('buildClaudeCommand — skip-permissions wins over permission mode (mutually exclusive)', () => {
  const cmd = buildClaudeCommand({
    sessionId: 's', isNew: true, account: DEFAULT_ACCOUNT,
    options: { dangerouslySkipPermissions: true, permissionMode: 'plan' },
  });
  assert.equal(cmd, "claude --session-id 's' --dangerously-skip-permissions");
});

test('buildClaudeCommand — worktree with a name, and no local .gitignore side effect to assert here', () => {
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: DEFAULT_ACCOUNT, options: { worktree: true, worktreeName: 'feat' } });
  assert.equal(cmd, "claude --session-id 's' --worktree 'feat'");
});

test('buildClaudeCommand — worktree without a name omits the name argument', () => {
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: DEFAULT_ACCOUNT, options: { worktree: true } });
  assert.equal(cmd, "claude --session-id 's' --worktree");
});

test('buildClaudeCommand — add-dirs split on commas, each a quoted Host path', () => {
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: DEFAULT_ACCOUNT, options: { addDirs: '/srv/a, /srv/b' } });
  assert.equal(cmd, "claude --session-id 's' --add-dir '/srv/a' --add-dir '/srv/b'");
});

test('buildClaudeCommand — chrome is appended when asked', () => {
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: DEFAULT_ACCOUNT, options: { chrome: true } });
  assert.equal(cmd, "claude --session-id 's' --chrome");
});

test('buildClaudeCommand — append-system-prompt is inline (no temp file), quoted', () => {
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: DEFAULT_ACCOUNT, options: { appendSystemPrompt: 'be brief' } });
  assert.equal(cmd, "claude --session-id 's' --append-system-prompt 'be brief'");
  assert.ok(!/cat /.test(cmd), 'must not shell out to cat a temp file');
});

test('buildClaudeCommand — pre-launch command is prepended ahead of the Account env', () => {
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: WORK_ACCOUNT, options: { preLaunchCmd: 'aws-vault exec p --' } });
  assert.equal(cmd, "aws-vault exec p -- env CLAUDE_CONFIG_DIR=$HOME/work/.claude claude --session-id 's'");
});

// --- claude command: quoting survives the deepest shell ---------------------------------------

test('buildClaudeCommand — an append-system-prompt with quotes and a newline survives one shell layer', () => {
  const prompt = "say \"hi\" and don't $(rm -rf /)\nsecond line";
  const cmd = buildClaudeCommand({ sessionId: 's', isNew: true, account: DEFAULT_ACCOUNT, options: { appendSystemPrompt: prompt } });
  // The value sits as the last single-quoted token; un-quoting it with the shell oracle must give
  // the literal back untouched — nothing interpreted, nothing lost.
  const quoted = cmd.slice(cmd.indexOf('--append-system-prompt ') + '--append-system-prompt '.length);
  assert.equal(unSingleQuote(quoted), prompt);
});

// --- the tmux launch shape (ADR 0016) ---------------------------------------------------------

test('buildTmuxCommand — new -A on the wootonpad socket, named wp-<id>, started in the Host path, inline options', () => {
  const inner = buildTmuxCommand({ sessionId: 'sess-1', remotePath: '/srv/proj', claudeCommand: "claude --session-id 'sess-1'" });
  assert.match(inner, /^tmux -L wootonpad new-session -A -s wp-sess-1 /);
  assert.match(inner, / -c '\/srv\/proj' /);
  // TERM_PROGRAM is injected into the session env so Claude emits OSC 9 (needsInput) — ssh does not
  // forward it, so `-e` is how it reaches the far side.
  assert.match(inner, / -e TERM_PROGRAM=WarpTerminal /);
  assert.match(inner, / -e TERM_PROGRAM_VERSION=/);
  // the claude command reaches tmux as one single-quoted argument it runs via sh -c
  assert.ok(inner.includes("'claude --session-id '\\''sess-1'\\'''"), inner);
  // the four inline options from the spike / ADR 0016, each after a literal ; (written \;)
  assert.match(inner, /\\; set -g prefix None/);
  assert.match(inner, /\\; set -g status off/);
  assert.match(inner, /\\; set -g allow-passthrough on/);
  assert.match(inner, /\\; set -g set-titles on/);
});

test('TMUX_SOCKET is the shared wootonpad socket', () => {
  assert.equal(TMUX_SOCKET, 'wootonpad');
});

// --- the full ssh launch argv -----------------------------------------------------------------

function launch(extra = {}) {
  return buildRemoteLaunchArgs({
    sshTarget: 'mac-mini', sessionId: 'sess-1', isNew: true,
    account: DEFAULT_ACCOUNT, options: {}, remotePath: '/srv/proj', ...extra,
  });
}

test('buildRemoteLaunchArgs — forces a PTY with -tt (Claude needs a terminal)', () => {
  assert.ok(launch().includes('-tt'));
});

test('buildRemoteLaunchArgs — BatchMode=yes is on every launch (the whole safety story, ADR 0016)', () => {
  const idx = launch().indexOf('BatchMode=yes');
  assert.ok(idx >= 0, 'BatchMode=yes must be present');
});

test('buildRemoteLaunchArgs — never relaxes host-key checking', () => {
  const args = launch();
  assert.ok(!args.some(a => /accept-new/.test(a)), 'accept-new must never appear');
  assert.ok(!args.some(a => /StrictHostKeyChecking=no/.test(a)), 'StrictHostKeyChecking=no must never appear');
});

test('buildRemoteLaunchArgs — terminates options with -- before the target', () => {
  const args = launch();
  const dd = args.indexOf('--');
  assert.ok(dd >= 0 && args[dd + 1] === 'mac-mini', 'target must sit right after --');
});

test('buildRemoteLaunchArgs — the remote command is the login-shell-wrapped tmux launch', () => {
  const args = launch();
  const remoteCmd = args[args.length - 1];
  assert.match(remoteCmd, /^\$SHELL -lc '/);
  // un-nest the $SHELL -lc '…' layer and confirm the tmux launch is inside
  const inner = unSingleQuote(remoteCmd.slice('$SHELL -lc '.length));
  assert.match(inner, /^tmux -L wootonpad new-session -A -s wp-sess-1 /);
});

test('buildRemoteLaunchArgs — a hostile sshTarget (leading dash) is rejected before it reaches argv', () => {
  assert.throws(() => launch({ sshTarget: '-oProxyCommand=evil' }), /SSH target/i);
});

test('buildRemoteLaunchArgs — the whole nesting round-trips a hostile append-system-prompt to the literal', () => {
  const prompt = "x'; rm -rf / #";
  const args = buildRemoteLaunchArgs({
    sshTarget: 'mac-mini', sessionId: 'sess-1', isNew: true, account: WORK_ACCOUNT,
    options: { appendSystemPrompt: prompt }, remotePath: "/srv/o'brien",
  });
  const remoteCmd = args[args.length - 1];
  const inner = unSingleQuote(remoteCmd.slice('$SHELL -lc '.length));            // $SHELL -lc layer
  const tmuxArgv = shellSplit(inner);                                            // login-shell layer
  const claudeCommand = tmuxArgv[tmuxArgv.indexOf('-c') + 2];                    // the sh -c arg tmux runs
  const claudeArgv = shellSplit(claudeCommand);                                  // tmux sh -c layer
  const promptValue = claudeArgv[claudeArgv.indexOf('--append-system-prompt') + 1];
  assert.equal(promptValue, prompt);                                            // claude's own argv
  assert.ok(claudeCommand.includes('CLAUDE_CONFIG_DIR=$HOME/work/.claude'));
  // the Host-side cwd (with an apostrophe) survives to tmux's -c argument intact
  assert.equal(tmuxArgv[tmuxArgv.indexOf('-c') + 1], "/srv/o'brien");
});

// --- stop (kill the tmux session) -------------------------------------------------------------

test('buildStopArgs — kills the Session\'s tmux session on the Host (Stop, not detach)', () => {
  const args = buildStopArgs({ sshTarget: 'mac-mini', sessionId: 'sess-1' });
  const remoteCmd = args[args.length - 1];
  assert.match(remoteCmd, /tmux -L wootonpad kill-session -t wp-sess-1/);
  assert.ok(args.includes('BatchMode=yes'));
  assert.ok(!args.includes('-tt'), 'a kill needs no PTY');
});

// --- rename (a fork / plan-accept re-key follows the real id) ---------------------------------

test('buildRenameArgs — renames the tmux session from the old id to the real one after a fork', () => {
  const args = buildRenameArgs({ sshTarget: 'mac-mini', oldSessionId: 'temp-1', newSessionId: 'real-9' });
  const remoteCmd = args[args.length - 1];
  assert.match(remoteCmd, /tmux -L wootonpad rename-session -t wp-temp-1 wp-real-9/);
});

test('buildRenameArgs — rejects an unsafe new id (it is spliced into the remote command)', () => {
  assert.throws(
    () => buildRenameArgs({ sshTarget: 'mac-mini', oldSessionId: 'temp-1', newSessionId: "x'y" }),
    /session id/i);
});

// --- the re-key decision (what to re-detect, what to rename) ----------------------------------

test('remoteTransitionFolders — the distinct folders of the live remote Sessions', () => {
  const sessions = [
    { projectFolder: 'a' }, { projectFolder: 'b' }, { projectFolder: 'a' }, { projectFolder: null },
  ];
  assert.deepEqual(remoteTransitionFolders(sessions), ['a', 'b']);
});

test('remoteTransitionFolders — no Sessions means nothing to re-detect', () => {
  assert.deepEqual(remoteTransitionFolders([]), []);
});

test('planRemoteTmuxRenames — a Session whose real id now differs from its tmux id must rename', () => {
  const reKeyed = { realSessionId: 'real-9', remoteTmuxId: 'temp-1' };
  const renames = planRemoteTmuxRenames([reKeyed]);
  assert.deepEqual(renames, [{ session: reKeyed, oldId: 'temp-1', newId: 'real-9' }]);
});

test('planRemoteTmuxRenames — a Session that never re-keyed yields no rename', () => {
  // no realSessionId yet (current falls back to the tmux id → unchanged), and the steady state
  // where the tmux id already equals the real id.
  const pending = { realSessionId: null, remoteTmuxId: 'temp-1' };
  const settled = { realSessionId: 'real-9', remoteTmuxId: 'real-9' };
  assert.deepEqual(planRemoteTmuxRenames([pending, settled]), []);
});

test('planRemoteTmuxRenames — only the re-keyed Sessions, in order, from a mixed set', () => {
  const settled = { realSessionId: 's', remoteTmuxId: 's' };
  const forked = { realSessionId: 'r2', remoteTmuxId: 't2' };
  assert.deepEqual(
    planRemoteTmuxRenames([settled, forked]),
    [{ session: forked, oldId: 't2', newId: 'r2' }]);
});

// --- picking Sessions back up: discovery (VIN-160) --------------------------------------------
// At startup and whenever a Host turns Reachable, WootonPad lists the live tmux sessions on the
// Host's dedicated socket and re-attaches each in the background. The discovery command and its
// output parsing are the pure seam; the adapter (main.js) shells out and spawns the PTYs.

test('listSessionsCommand — lists the wootonpad socket through a login shell, name only', () => {
  const cmd = listSessionsCommand();
  // Runs under $SHELL -lc so tmux is on the login PATH, exactly like every other remote command.
  assert.match(cmd, /^\$SHELL -lc '/);
  const inner = unSingleQuote(cmd.slice('$SHELL -lc '.length));
  assert.match(inner, /^tmux -L wootonpad list-sessions /);
  // -F '#{session_name}' so only the session names come back, one per line — nothing to parse off
  // the default verbose format.
  assert.match(inner, /-F '#\{session_name\}'/);
});

test('parseTmuxSessionList — reads the Session ids out of the wp- names', () => {
  assert.deepEqual(parseTmuxSessionList('wp-abc\nwp-3f2a-9c1d-44\n'), ['abc', '3f2a-9c1d-44']);
});

test('parseTmuxSessionList — empty output (no server / no sessions) is no Sessions', () => {
  assert.deepEqual(parseTmuxSessionList(''), []);
  assert.deepEqual(parseTmuxSessionList('\n\n'), []);
});

test('parseTmuxSessionList — a non-wp session on the socket is ignored', () => {
  // Another tool could in principle share the socket; only wp-<id> names are WootonPad Sessions.
  assert.deepEqual(parseTmuxSessionList('wp-keep\nscratch\nwp-also'), ['keep', 'also']);
});

test('parseTmuxSessionList — a wp- name that is not a bare token is skipped (never spliced raw later)', () => {
  // The id is later interpolated unquoted into an attach command, so a non-token name is dropped
  // here rather than trusted — belt and braces with assertSafeSessionId downstream.
  assert.deepEqual(parseTmuxSessionList('wp-ok\nwp-a b\nwp-a;b'), ['ok']);
});

test('hasSessionCommand — asks the socket whether the Session is still alive, login-shell wrapped', () => {
  const cmd = hasSessionCommand('sess-1');
  assert.match(cmd, /^\$SHELL -lc '/);
  const inner = unSingleQuote(cmd.slice('$SHELL -lc '.length));
  assert.match(inner, /^tmux -L wootonpad has-session -t wp-sess-1$/);
});

test('hasSessionCommand — rejects an unsafe id (it is spliced into the remote command)', () => {
  assert.throws(() => hasSessionCommand("x'y"), /session id/i);
});

test('paneTitleCommand — reads the Session pane title (the CLI\'s last OSC 0), login-shell wrapped', () => {
  const cmd = paneTitleCommand('sess-1');
  assert.match(cmd, /^\$SHELL -lc '/);
  const inner = unSingleQuote(cmd.slice('$SHELL -lc '.length));
  assert.match(inner, /^tmux -L wootonpad display-message -p -t wp-sess-1 '#\{pane_title\}'$/);
});

test('paneTitleCommand — rejects an unsafe id (it is spliced into the remote command)', () => {
  assert.throws(() => paneTitleCommand("x'y"), /session id/i);
});

// --- picking Sessions back up: the background re-attach argv -----------------------------------

test('buildAttachArgs — attaches the existing tmux session, forcing a PTY', () => {
  const args = buildAttachArgs({ sshTarget: 'mac-mini', sessionId: 'sess-1' });
  assert.ok(args.includes('-tt'), 'attach needs a PTY — tmux attach requires a terminal');
  const remoteCmd = args[args.length - 1];
  const inner = unSingleQuote(remoteCmd.slice('$SHELL -lc '.length));
  // attach-session, never new-session: a re-attach must find the running Claude, never start one.
  assert.match(inner, /^tmux -L wootonpad attach-session -t wp-sess-1$/);
});

test('buildAttachArgs — carries BatchMode and never relaxes host-key checking', () => {
  const args = buildAttachArgs({ sshTarget: 'mac-mini', sessionId: 'sess-1' });
  assert.ok(args.includes('BatchMode=yes'));
  assert.ok(!args.some(a => /accept-new|StrictHostKeyChecking=no/.test(a)));
});

test('buildAttachArgs — a hostile sshTarget is rejected before it reaches argv', () => {
  assert.throws(() => buildAttachArgs({ sshTarget: '-oProxyCommand=evil', sessionId: 's' }), /SSH target/i);
});

// --- picking Sessions back up: which to attach ------------------------------------------------

test('sessionsToReattach — the live tmux Sessions not already attached locally', () => {
  assert.deepEqual(sessionsToReattach(['a', 'b', 'c'], ['b']), ['a', 'c']);
});

test('sessionsToReattach — all already attached means nothing to do', () => {
  assert.deepEqual(sessionsToReattach(['a', 'b'], ['a', 'b']), []);
});

test('sessionsToReattach — a duplicate live id is attached once', () => {
  assert.deepEqual(sessionsToReattach(['a', 'a', 'b'], []), ['a', 'b']);
});

// --- a dropped SSH is not an exit (VIN-160) ---------------------------------------------------
// When a remote Session's ssh PTY dies, the decision is: did Claude really exit inside tmux, or
// did the link just drop (laptop slept, Wi-Fi cut)? A dropped link keeps the Session, stale, to be
// re-attached once the Host answers; a real exit ends it. The adapter runs the has-session probe;
// this pure function reads its result.

test('classifyRemotePtyExit — Stop (user-killed tmux) is a real exit', () => {
  assert.equal(classifyRemotePtyExit({ stoppedByUser: true, reachable: true, hasSessionCode: 1 }), 'exited');
});

test('classifyRemotePtyExit — an Unreachable Host is a dropped link, never an exit', () => {
  assert.equal(classifyRemotePtyExit({ stoppedByUser: false, reachable: false, hasSessionCode: null }), 'dropped');
});

test('classifyRemotePtyExit — the tmux session still lives (probe 0): the client dropped, not Claude', () => {
  assert.equal(classifyRemotePtyExit({ stoppedByUser: false, reachable: true, hasSessionCode: 0 }), 'dropped');
});

test('classifyRemotePtyExit — ssh could not connect (255) is a dropped link even if reachability is stale', () => {
  assert.equal(classifyRemotePtyExit({ stoppedByUser: false, reachable: undefined, hasSessionCode: 255 }), 'dropped');
});

test('classifyRemotePtyExit — reachable Host, tmux session gone (probe 1): Claude really exited', () => {
  assert.equal(classifyRemotePtyExit({ stoppedByUser: false, reachable: true, hasSessionCode: 1 }), 'exited');
});

test('remotePtyEnv layers the colour + non-interactive ssh env over the cleaned base, base first', () => {
  const env = remotePtyEnv({ PATH: '/usr/bin', TERM: 'dumb' });
  assert.equal(env.PATH, '/usr/bin', 'the base env is carried through');
  assert.equal(env.TERM, 'xterm-256color', 'a real colour terminal overrides the base TERM');
  assert.equal(env.COLORTERM, 'truecolor');
  assert.equal(env.FORCE_COLOR, '3');
  assert.equal(env.SSH_ASKPASS_REQUIRE, 'never', 'ssh stays non-interactive — no askpass GUI');
  assert.equal(env.DISPLAY, '');
});

// --- routing a dead remote PTY (VIN-160) ------------------------------------------------------
// Before classifyRemotePtyExit can run, a dead PTY must first be routed to it. isRemoteDropCandidate
// is that gate — connected-once or re-attached is a drop candidate worth probing; a never-connected
// foreground launch, a Stop, or a local Session finalizes straight away.

test('isRemoteDropCandidate — a connected remote Session the user did not Stop is a drop candidate', () => {
  assert.equal(isRemoteDropCandidate({ remote: true, stoppedByUser: false, everConnected: true, reattached: false }), true);
});

test('isRemoteDropCandidate — a background re-attach is a drop candidate even before it connects', () => {
  assert.equal(isRemoteDropCandidate({ remote: true, stoppedByUser: false, everConnected: false, reattached: true }), true);
});

test('isRemoteDropCandidate — a foreground launch that never connected is a failed launch, not a drop', () => {
  assert.equal(isRemoteDropCandidate({ remote: true, stoppedByUser: false, everConnected: false, reattached: false }), false);
});

test('isRemoteDropCandidate — a deliberate Stop finalizes, never a drop', () => {
  assert.equal(isRemoteDropCandidate({ remote: true, stoppedByUser: true, everConnected: true, reattached: true }), false);
});

test('isRemoteDropCandidate — a local Session is never a drop candidate', () => {
  assert.equal(isRemoteDropCandidate({ remote: false, stoppedByUser: false, everConnected: true, reattached: true }), false);
});

// --- surfacing a launch-failure diagnostic (VIN-160) ------------------------------------------
// Once a remote PTY exit is finalized, shouldReportRemoteLaunchFailure decides whether to write the
// Host's red diagnostic — only for a Session the user actually opened.

test('shouldReportRemoteLaunchFailure — an opened remote Session dying non-zero earns the diagnostic', () => {
  assert.equal(shouldReportRemoteLaunchFailure({ remote: true, stoppedByUser: false, exitCode: 1, everOpened: true }), true);
});

test('shouldReportRemoteLaunchFailure — a background re-attach the user never opened writes nothing', () => {
  assert.equal(shouldReportRemoteLaunchFailure({ remote: true, stoppedByUser: false, exitCode: 1, everOpened: false }), false);
});

test('shouldReportRemoteLaunchFailure — a clean exit (code 0) is no launch failure', () => {
  assert.equal(shouldReportRemoteLaunchFailure({ remote: true, stoppedByUser: false, exitCode: 0, everOpened: true }), false);
});

test('shouldReportRemoteLaunchFailure — a Stop is the user\'s doing, not a launch failure', () => {
  assert.equal(shouldReportRemoteLaunchFailure({ remote: true, stoppedByUser: true, exitCode: 1, everOpened: true }), false);
});

test('shouldReportRemoteLaunchFailure — a local Session gets no Remote Host diagnostic', () => {
  assert.equal(shouldReportRemoteLaunchFailure({ remote: false, stoppedByUser: false, exitCode: 1, everOpened: true }), false);
});
