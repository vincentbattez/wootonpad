import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJsonlViewerBridge } from './bridge.js';

// The jsonl Feature's Bridge writes an open request into a store object, never into a
// component ref. A plain object stands in for the reactive store — the contract is the
// write, not Vue.

test('open writes the session as an open request', () => {
  const store = { openRequest: null };
  const bridge = createJsonlViewerBridge(store);
  const session = { sessionId: 'abc', name: 'Sess' };
  bridge.open(session);
  assert.equal(store.openRequest.session, session);
});

test('open bumps the seq so re-opening the same session re-triggers', () => {
  const store = { openRequest: null };
  const bridge = createJsonlViewerBridge(store);
  const session = { sessionId: 'abc' };
  bridge.open(session);
  const first = store.openRequest.seq;
  bridge.open(session);
  assert.equal(store.openRequest.seq, first + 1, 'seq advances on each open');
});
