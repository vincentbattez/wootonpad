import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanDisplayName,
  sessionDisplayName,
  sessionHeaderSubtitle,
  sessionTimeStr,
} from './use-session-display.js';

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

// VIN-146 — the first prompt moved down one rung: the aiTitle is the title now, and the first
// prompt takes the terminal header's subtitle slot the aiTitle used to hold.

test('sessionDisplayName shows the resolved title over the first prompt', () => {
  const s = { title: 'Promote the AI title', name: null, summary: 'First prompt' };
  assert.equal(sessionDisplayName(s), 'Promote the AI title');
});

test('sessionHeaderSubtitle is the first prompt', () => {
  const s = { title: 'Promote the AI title', firstPrompt: 'First prompt' };
  assert.equal(sessionHeaderSubtitle(s, 'Promote the AI title'), 'First prompt');
});

test('sessionHeaderSubtitle is masked when it is already the title', () => {
  // The 35% of Sessions with no aiTitle: their title *is* the sanitised first prompt, and the
  // header must not print the same string twice.
  assert.equal(sessionHeaderSubtitle({ firstPrompt: 'First prompt' }, 'First prompt'), null);
});

test('sessionHeaderSubtitle is absent for a Session with no first prompt', () => {
  // A Plain Terminal or a Run Terminal: synthetic, no prompt, and its label stays the title.
  assert.equal(sessionHeaderSubtitle({ summary: 'Terminal', firstPrompt: '' }, 'Terminal'), null);
  assert.equal(sessionHeaderSubtitle(null, ''), null);
});

test('sessionHeaderSubtitle survives a rename that hides the first prompt', () => {
  const s = { name: 'My rename', title: 'My rename', firstPrompt: 'First prompt' };
  assert.equal(sessionHeaderSubtitle(s, 'My rename'), 'First prompt');
});

test('sessionHeaderSubtitle runs the first prompt through the installed cleaner', () => {
  globalThis.window = { cleanDisplayName: (n) => `[${n}]` };
  try {
    assert.equal(sessionHeaderSubtitle({ firstPrompt: 'p' }, 'Title'), '[p]');
  } finally {
    delete globalThis.window;
  }
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
