// Fork/plan-accept detection runs per Source (VIN-152). Two Hosts can hold a
// folder of the same name, each with its own active PTY waiting on a fork; a new
// file appearing on one Host must rekey only that Host's session. This drives the
// real detector with two same-named folders and asserts the scoping holds.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sessionTransitions = require('../session-transitions');

function writeForkFile(dir, newId, forkedFrom) {
  fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({
    type: 'assistant', sessionId: newId, forkedFrom: { sessionId: forkedFrom },
    timestamp: new Date().toISOString(), message: { role: 'assistant', content: 'forked' },
  });
  fs.writeFileSync(path.join(dir, newId + '.jsonl'), line + '\n');
}

test('a fork on one source rekeys only that source\'s active session', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-trans-'));
  const localDir = path.join(root, 'local', 'projects');
  const remoteDir = path.join(root, 'remote', 'projects');
  const FOLDER = '-p';

  // Both sources already hold the parent file of a forked-from session.
  for (const dir of [localDir, remoteDir]) {
    fs.mkdirSync(path.join(dir, FOLDER), { recursive: true });
    fs.writeFileSync(path.join(dir, FOLDER, 'parent.jsonl'), '{}\n');
  }

  const localSess = {
    projectFolder: FOLDER, forkFrom: 'parent', sourceId: 'default',
    knownJsonlFiles: new Set(['parent.jsonl']),
  };
  const remoteSess = {
    projectFolder: FOLDER, forkFrom: 'parent', sourceId: 'ssh://h',
    knownJsonlFiles: new Set(['parent.jsonl']),
  };
  const activeSessions = new Map([['local-pty', localSess], ['remote-pty', remoteSess]]);

  const rekeyed = [];
  sessionTransitions.init({
    PROJECTS_DIR: localDir, accountId: 'default', activeSessions,
    getMainWindow: () => null, log: { info() {}, debug() {}, warn() {} },
    rekeyMcpServer: (from, to) => rekeyed.push([from, to]),
  });

  const local = { id: 'default', projectsDir: localDir, hostId: null };
  const remote = { id: 'ssh://h', projectsDir: remoteDir, hostId: 'h' };

  // A fork lands on the local source only.
  writeForkFile(path.join(localDir, FOLDER), 'local-new', 'parent');
  sessionTransitions.detectSessionTransitions(FOLDER, local);

  // The local PTY was rekeyed to the new id; the remote PTY was left untouched.
  assert.ok(activeSessions.has('local-new'));
  assert.ok(!activeSessions.has('local-pty'));
  assert.ok(activeSessions.has('remote-pty'));
  assert.deepEqual(rekeyed, [['local-pty', 'local-new']]);
});
