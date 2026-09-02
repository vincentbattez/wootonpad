import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDisplayName, sessionDisplayName, sessionTimeStr } from './use-session-display.js';

// The Session display helpers read the frozen renderer's globals when installed and degrade to a
// plain value otherwise. These assert both paths, toggling window.* around each case.

test('cleanDisplayName passes the name through when no cleaner is installed', () => {
  assert.equal(cleanDisplayName('Raw Name'), 'Raw Name');
});

test('cleanDisplayName runs the name through window.cleanDisplayName when present', () => {
  globalThis.window = { cleanDisplayName: (n) => `[${n}]` };
  try {
    assert.equal(cleanDisplayName('x'), '[x]');
  } finally {
    delete globalThis.window;
  }
});

test('sessionDisplayName falls back from name to summary', () => {
  assert.equal(sessionDisplayName({ name: 'A', summary: 'B' }), 'A');
  assert.equal(sessionDisplayName({ summary: 'B' }), 'B');
});

test('sessionTimeStr uses lastActivityTime when available, else the modified date', () => {
  // No window: no formatter, so the result is empty regardless of the timestamp source.
  assert.equal(sessionTimeStr({ sessionId: 's1', modified: '2026-01-01T00:00:00.000Z' }), '');

  globalThis.window = {
    lastActivityTime: new Map([['s1', new Date('2026-02-02T00:00:00.000Z')]]),
    formatDate: (t) => t.toISOString(),
  };
  try {
    assert.equal(sessionTimeStr({ sessionId: 's1', modified: '2026-01-01T00:00:00.000Z' }), '2026-02-02T00:00:00.000Z');
    // A session with no activity entry falls back to its modified date.
    assert.equal(sessionTimeStr({ sessionId: 'unknown', modified: '2026-01-01T00:00:00.000Z' }), '2026-01-01T00:00:00.000Z');
  } finally {
    delete globalThis.window;
  }
});
