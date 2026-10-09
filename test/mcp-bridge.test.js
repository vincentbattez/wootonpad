const test = require('node:test');
const assert = require('node:assert/strict');

const { handleMessage, MCP_TOOLS } = require('../mcp-bridge.js');

// VIN-148 — the contract the Claude CLI actually sees: the JSON-RPC handler and the tool list,
// not the WebSocket server around them. `markSessionDone` is the agent's half of ADR 0015, so
// what matters is that it is announced, that it routes to the main process's effect, and that
// an unknown name still comes back as a JSON-RPC error rather than an exception.

const noopLog = { info() {}, warn() {}, debug() {}, error() {} };

// A server entry with a fake socket: everything sent back is captured and parsed.
function fakeEntry(overrides = {}) {
  const sent = [];
  return {
    sessionId: 's1',
    ws: { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) },
    pendingDiffs: new Map(),
    hostPath: (p) => p,
    sent,
    ...overrides,
  };
}

const rpc = (method, params, id = 1) => JSON.stringify({ jsonrpc: '2.0', id, method, params });

test('tools/list announces markSessionDone with no required parameter', async () => {
  const entry = fakeEntry();
  await handleMessage(entry, rpc('tools/list'), noopLog);

  assert.equal(entry.sent.length, 1);
  const tools = entry.sent[0].result.tools;
  const done = tools.find(t => t.name === 'markSessionDone');
  assert.ok(done, 'markSessionDone must be announced');
  assert.equal(typeof done.description, 'string');
  assert.ok(done.description.length > 0);
  assert.deepEqual(done.inputSchema.properties, {});
  assert.equal(done.inputSchema.required, undefined, 'the tool takes no argument');
});

test('the announced tool list is the module\'s, unabridged', () => {
  assert.ok(MCP_TOOLS.some(t => t.name === 'markSessionDone'));
  // The five that were already there keep their place — this ticket adds, it does not replace.
  for (const name of ['openDiff', 'openFile', 'close_tab', 'closeAllDiffTabs', 'getDiagnostics']) {
    assert.ok(MCP_TOOLS.some(t => t.name === name), `${name} must survive`);
  }
});

test('tools/call on markSessionDone routes to the effect and answers a valid response', async () => {
  const marked = [];
  const entry = fakeEntry({ onMarkDone: (id) => { marked.push(id); } });

  await handleMessage(entry, rpc('tools/call', { name: 'markSessionDone', arguments: {} }, 7), noopLog);

  assert.deepEqual(marked, ['s1'], 'the session id reaches the main process');
  assert.equal(entry.sent.length, 1);
  const reply = entry.sent[0];
  assert.equal(reply.jsonrpc, '2.0');
  assert.equal(reply.id, 7);
  assert.equal(reply.error, undefined);
  assert.ok(Array.isArray(reply.result.content));
});

test('markSessionDone still answers when no effect is wired, or when it throws', async () => {
  const bare = fakeEntry();
  await handleMessage(bare, rpc('tools/call', { name: 'markSessionDone' }, 2), noopLog);
  assert.equal(bare.sent[0].error, undefined);

  const throwing = fakeEntry({ onMarkDone: () => { throw new Error('db is gone'); } });
  await handleMessage(throwing, rpc('tools/call', { name: 'markSessionDone' }, 3), noopLog);
  assert.equal(throwing.sent[0].id, 3);
  assert.equal(throwing.sent[0].error, undefined, 'a failed write must not break the CLI');
});

test('an unknown tool comes back as a JSON-RPC error, never an exception', async () => {
  const entry = fakeEntry();
  await handleMessage(entry, rpc('tools/call', { name: 'noSuchTool' }, 9), noopLog);

  assert.equal(entry.sent.length, 1);
  assert.equal(entry.sent[0].id, 9);
  assert.equal(typeof entry.sent[0].error.code, 'number');
  assert.match(entry.sent[0].error.message, /noSuchTool/);
});

test('an unknown method comes back as method-not-found', async () => {
  const entry = fakeEntry();
  await handleMessage(entry, rpc('nope', {}, 4), noopLog);
  assert.equal(entry.sent[0].error.code, -32601);
});

test('invalid JSON and notifications are swallowed, not answered', async () => {
  const entry = fakeEntry();
  await handleMessage(entry, 'not json at all', noopLog);
  await handleMessage(entry, JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), noopLog);
  assert.deepEqual(entry.sent, []);
});
