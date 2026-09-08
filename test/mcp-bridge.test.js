const test = require('node:test');
const assert = require('node:assert/strict');
const { handleMessage, MCP_TOOLS } = require('../mcp-bridge.js');

// VIN-148 — the JSON-RPC contract the Claude CLI actually sees, tested at the message handler
// (now exported) rather than through the WebSocket server. A fake `entry` captures whatever the
// handler sends back over the socket; a no-op log stands in for the real logger.

const log = { info() {}, warn() {}, debug() {}, error() {} };

function makeEntry(overrides = {}) {
  const sent = [];
  const entry = {
    sessionId: 'sess-1',
    ws: { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) },
    pendingDiffs: new Map(),
    ...overrides,
  };
  return { entry, sent };
}

test('tools/list announces markSessionDone with no required parameter', () => {
  const { entry, sent } = makeEntry();
  handleMessage(entry, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), log);

  assert.equal(sent.length, 1);
  const tools = sent[0].result.tools;
  const mark = tools.find(t => t.name === 'markSessionDone');
  assert.ok(mark, 'markSessionDone must be in the tool list');
  const required = mark.inputSchema?.required || [];
  assert.deepEqual(required, [], 'markSessionDone takes no required parameter');
});

test('tools/call markSessionDone routes to the effect and returns a valid JSON-RPC result', () => {
  let markedSession = null;
  const { entry, sent } = makeEntry({ onMarkDone: (id) => { markedSession = id; } });
  handleMessage(entry, JSON.stringify({
    jsonrpc: '2.0', id: 7, method: 'tools/call',
    params: { name: 'markSessionDone', arguments: {} },
  }), log);

  assert.equal(markedSession, 'sess-1', 'the effect fires for this session');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].jsonrpc, '2.0');
  assert.equal(sent[0].id, 7);
  assert.ok(sent[0].result, 'a result envelope, not an error');
  assert.equal(sent[0].error, undefined);
});

test('markSessionDone survives a missing effect callback without throwing', () => {
  const { entry, sent } = makeEntry(); // no onMarkDone
  assert.doesNotThrow(() => handleMessage(entry, JSON.stringify({
    jsonrpc: '2.0', id: 8, method: 'tools/call',
    params: { name: 'markSessionDone', arguments: {} },
  }), log));
  assert.ok(sent[0].result, 'still answers with a valid result');
});

test('an unknown tool always answers with a JSON-RPC error, never an exception', () => {
  const { entry, sent } = makeEntry();
  assert.doesNotThrow(() => handleMessage(entry, JSON.stringify({
    jsonrpc: '2.0', id: 9, method: 'tools/call',
    params: { name: 'noSuchTool', arguments: {} },
  }), log));
  assert.equal(sent[0].id, 9);
  assert.ok(sent[0].error, 'an error envelope');
  assert.equal(typeof sent[0].error.code, 'number');
});

test('markSessionDone is not a stop — the tool set carries no stop/kill tool', () => {
  const names = MCP_TOOLS.map(t => t.name);
  assert.ok(names.includes('markSessionDone'));
  assert.ok(!names.some(n => /stop|kill/i.test(n)), 'closing the subject is not killing the PTY');
});
