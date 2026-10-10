// remote-mirror-lineage.js reads a Host's mirror fork graph off disk (VIN-160): one
// { id, forkedFrom } per mirrored .jsonl, walked across a restart to resolve a stale pre-re-key
// tmux name forward to its realSessionId. The parent-edge derivation is branching logic — an
// explicit forkedFrom, a --fork-session parentSessionId, and the self-referential parent a
// non-forked file carries — so it is exercised directly here, pure and against a real temp mirror.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readMirrorLineage, deriveParentEdge } = require('../remote-mirror-lineage');

// --- the pure derivation ---

test('deriveParentEdge prefers an explicit forkedFrom', () => {
  assert.equal(deriveParentEdge('new', { forkedFrom: 'old', parentSessionId: 'whatever' }), 'old');
});

test('deriveParentEdge takes a distinct parentSessionId as the --fork-session edge', () => {
  assert.equal(deriveParentEdge('new', { forkedFrom: null, parentSessionId: 'old' }), 'old');
});

test('deriveParentEdge guards the self-referential parent a non-forked file carries', () => {
  // A plain original copies its own id into parentSessionId; that is not a fork edge.
  assert.equal(deriveParentEdge('a', { forkedFrom: null, parentSessionId: 'a' }), null);
});

test('deriveParentEdge yields null for a file with no signals', () => {
  assert.equal(deriveParentEdge('a', { forkedFrom: null, parentSessionId: null }), null);
});

// --- the disk walk + parsing ---

// Lay a Host's mirror out as the adapter expects: <mirrorRoot>/<hostId>/<accountId>/<folder>/<id>.jsonl.
function makeMirror(sessionsByFolder) {
  const mirrorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-mirror-'));
  const host = { id: 'h1', accounts: [{ id: 'default', name: 'Default', configDir: '~/.claude' }] };
  const base = path.join(mirrorRoot, 'h1', 'default');
  for (const [folder, sessions] of Object.entries(sessionsByFolder)) {
    const folderPath = path.join(base, folder);
    fs.mkdirSync(folderPath, { recursive: true });
    for (const [id, lines] of Object.entries(sessions)) {
      fs.writeFileSync(path.join(folderPath, `${id}.jsonl`),
        lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
    }
  }
  return { mirrorRoot, host };
}

test('a missing mirror yields no lineage', () => {
  const lineage = readMirrorLineage('/no/such/mirror/root', { id: 'h1', accounts: [] });
  assert.deepEqual(lineage, []);
});

test('an original and a forked file derive their parent edges off disk', () => {
  const { mirrorRoot, host } = makeMirror({
    'some-project': {
      // An original: head is a plain user message carrying only its own id.
      old: [{ type: 'user', message: 'start', sessionId: 'old' }],
      // A fork: an explicit forkedFrom precedes the first message.
      new: [{ forkedFrom: { sessionId: 'old' } }, { type: 'user', message: 'continue', sessionId: 'new' }],
    },
  });
  try {
    const lineage = readMirrorLineage(mirrorRoot, host);
    const byId = Object.fromEntries(lineage.map(e => [e.id, e.forkedFrom]));
    assert.deepEqual(Object.keys(byId).sort(), ['new', 'old']);
    assert.equal(byId.old, null, 'the original carries no fork edge despite its self-referential id');
    assert.equal(byId.new, 'old', 'the fork resolves forward to its parent');
  } finally {
    fs.rmSync(mirrorRoot, { recursive: true, force: true });
  }
});

test('a --fork-session file (parentSessionId, no forkedFrom) derives its edge off disk', () => {
  const { mirrorRoot, host } = makeMirror({
    'some-project': {
      // --fork-session copies the source's messages, so the head message carries the parent's id.
      forked: [{ type: 'user', message: 'copied', sessionId: 'source' }],
    },
  });
  try {
    const lineage = readMirrorLineage(mirrorRoot, host);
    assert.deepEqual(lineage, [{ id: 'forked', forkedFrom: 'source' }]);
  } finally {
    fs.rmSync(mirrorRoot, { recursive: true, force: true });
  }
});

test('non-.jsonl entries and stray files are ignored', () => {
  const { mirrorRoot, host } = makeMirror({
    'some-project': { a: [{ type: 'user', message: 'hi', sessionId: 'a' }] },
  });
  fs.writeFileSync(path.join(mirrorRoot, 'h1', 'default', 'some-project', 'notes.txt'), 'ignore me');
  try {
    const lineage = readMirrorLineage(mirrorRoot, host);
    assert.deepEqual(lineage, [{ id: 'a', forkedFrom: null }]);
  } finally {
    fs.rmSync(mirrorRoot, { recursive: true, force: true });
  }
});
