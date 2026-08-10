const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveRunTerminal, RUN_TERMINAL_TYPE } = require('../run-command');

const PROJECT = '/tmp/proj';
const HERE = { folderExists: true, sessions: [] };

function runTerminal(sessionId, projectPath, exited = false) {
  return { sessionId, projectPath, type: RUN_TERMINAL_TYPE, exited };
}

test('no Run Command yields not-configured', () => {
  assert.deepEqual(
    resolveRunTerminal({ runCommand: '', projectPath: PROJECT }, HERE),
    { ok: false, reason: 'not-configured' }
  );
  assert.deepEqual(
    resolveRunTerminal({ projectPath: PROJECT }, HERE),
    { ok: false, reason: 'not-configured' }
  );
  assert.deepEqual(
    resolveRunTerminal({ runCommand: '   ', projectPath: PROJECT }, HERE),
    { ok: false, reason: 'not-configured' }
  );
});

test('an empty command wins over a missing folder', () => {
  const out = resolveRunTerminal({ runCommand: '', projectPath: PROJECT }, { folderExists: false, sessions: [] });
  assert.equal(out.reason, 'not-configured');
});

test('a missing Project Folder yields missing-folder and launches nothing', () => {
  assert.deepEqual(
    resolveRunTerminal({ runCommand: 'npm run dev', projectPath: '/gone' }, { folderExists: false, sessions: [] }),
    { ok: false, reason: 'missing-folder' }
  );
});

test('no Run Terminal for this Project yields a launch carrying the command', () => {
  assert.deepEqual(
    resolveRunTerminal({ runCommand: 'npm run dev', projectPath: PROJECT }, HERE),
    { ok: true, action: 'launch', command: 'npm run dev' }
  );
});

test('the command is passed through verbatim, unquoted and unwrapped', () => {
  const command = 'docker compose up --build "my service" && echo $PWD';
  const out = resolveRunTerminal({ runCommand: command, projectPath: PROJECT }, HERE);
  assert.equal(out.command, command);
});

test('a live Run Terminal for this Project is focused, never relaunched', () => {
  const out = resolveRunTerminal(
    { runCommand: 'npm run dev', projectPath: PROJECT },
    { folderExists: true, sessions: [runTerminal('run-1', PROJECT)] }
  );
  assert.deepEqual(out, { ok: true, action: 'focus', sessionId: 'run-1' });
});

test('an exited Run Terminal for this Project is reused, not doubled', () => {
  const out = resolveRunTerminal(
    { runCommand: 'npm run dev', projectPath: PROJECT },
    { folderExists: true, sessions: [runTerminal('run-1', PROJECT, true)] }
  );
  assert.deepEqual(out, { ok: true, action: 'reuse', sessionId: 'run-1', command: 'npm run dev' });
});

test('a Run Terminal of another Project is not a match', () => {
  const out = resolveRunTerminal(
    { runCommand: 'npm run dev', projectPath: PROJECT },
    { folderExists: true, sessions: [runTerminal('run-other', '/tmp/other')] }
  );
  assert.deepEqual(out, { ok: true, action: 'launch', command: 'npm run dev' });
});

test('a Terminal opened by hand in the same Project is not a Run Terminal', () => {
  const out = resolveRunTerminal(
    { runCommand: 'npm run dev', projectPath: PROJECT },
    { folderExists: true, sessions: [{ sessionId: 't-1', projectPath: PROJECT, type: 'terminal', exited: false }] }
  );
  assert.deepEqual(out, { ok: true, action: 'launch', command: 'npm run dev' });
});

test('a Claude Session running in the same Project is not a Run Terminal', () => {
  const out = resolveRunTerminal(
    { runCommand: 'npm run dev', projectPath: PROJECT },
    { folderExists: true, sessions: [{ sessionId: 's-1', projectPath: PROJECT, type: 'session', exited: false }] }
  );
  assert.equal(out.action, 'launch');
});

// The global / project:<path> merge itself lives in effectiveSettings (main.js); this
// module only ever sees an already-resolved command, and matches strictly by path.
test('a Worktree matches by its own path and does not adopt its parent Run Terminal', () => {
  const worktree = PROJECT + '/.claude/worktrees/feat';
  const out = resolveRunTerminal(
    { runCommand: 'npm run dev -- --port 3001', projectPath: worktree },
    { folderExists: true, sessions: [runTerminal('run-parent', PROJECT)] }
  );
  assert.deepEqual(out, { ok: true, action: 'launch', command: 'npm run dev -- --port 3001' });
});

test('a live Run Terminal is preferred over an exited one for the same Project', () => {
  const out = resolveRunTerminal(
    { runCommand: 'npm run dev', projectPath: PROJECT },
    { folderExists: true, sessions: [runTerminal('run-dead', PROJECT, true), runTerminal('run-live', PROJECT)] }
  );
  assert.deepEqual(out, { ok: true, action: 'focus', sessionId: 'run-live' });
});

test('an absent sessions list is treated as no session at all', () => {
  const out = resolveRunTerminal({ runCommand: 'make dev', projectPath: PROJECT }, { folderExists: true });
  assert.deepEqual(out, { ok: true, action: 'launch', command: 'make dev' });
});
