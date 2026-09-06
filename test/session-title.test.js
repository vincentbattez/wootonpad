const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveSessionTitle, resolveSessionSearchTitle } = require('../session-title');

// A Session is a plain object; the resolver reads only its title-bearing fields, so a small local
// factory carrying an id plus the overrides under test is all the fixtures this seam needs.
function session(overrides = {}) {
  return { sessionId: '0123456789abcdef', ...overrides };
}

// ── Precedence: each level wins when it should ────────────────────────

test('a user rename wins over every automatic source', () => {
  const s = session({ name: 'My rename', customTitle: 'Custom', aiTitle: 'AI', summary: 'First prompt' });
  assert.equal(resolveSessionTitle(s), 'My rename');
});

test('customTitle wins over aiTitle and the first prompt', () => {
  const s = session({ customTitle: 'Custom', aiTitle: 'AI', summary: 'First prompt' });
  assert.equal(resolveSessionTitle(s), 'Custom');
});

test('aiTitle wins over the first prompt', () => {
  const s = session({ aiTitle: 'AI', summary: 'First prompt' });
  assert.equal(resolveSessionTitle(s), 'AI');
});

test('the first prompt is used when nothing above it is present', () => {
  const s = session({ summary: 'First prompt' });
  assert.equal(resolveSessionTitle(s), 'First prompt');
});

// ── Empty or absent sources fall through to the next level ────────────

test('an empty rename falls through to customTitle', () => {
  const s = session({ name: '', customTitle: 'Custom', summary: 'First prompt' });
  assert.equal(resolveSessionTitle(s), 'Custom');
});

test('an empty customTitle falls through to aiTitle', () => {
  const s = session({ name: '', customTitle: '', aiTitle: 'AI', summary: 'First prompt' });
  assert.equal(resolveSessionTitle(s), 'AI');
});

test('an empty aiTitle falls through to the first prompt', () => {
  const s = session({ aiTitle: '', summary: 'First prompt' });
  assert.equal(resolveSessionTitle(s), 'First prompt');
});

test('absent sources never produce an empty title', () => {
  const s = session({ name: null, customTitle: undefined, aiTitle: '', summary: 'First prompt' });
  assert.equal(resolveSessionTitle(s), 'First prompt');
});

// ── Fallback to an abbreviated id, never an empty string ──────────────

test('a Session with no title source renders an abbreviated id', () => {
  const s = { sessionId: '0123456789abcdef' };
  assert.equal(resolveSessionTitle(s), '01234567');
});

// ── Synthetic terminal Sessions ───────────────────────────────────────

test('a synthetic terminal Session renders its label', () => {
  const s = { sessionId: 'term-1', summary: 'Terminal', firstPrompt: '' };
  assert.equal(resolveSessionTitle(s), 'Terminal');
});

// ── Optional maximum length ───────────────────────────────────────────

test('the title is truncated when a maximum length is given', () => {
  const s = session({ summary: 'x'.repeat(60) });
  assert.equal(resolveSessionTitle(s, 40), 'x'.repeat(40));
});

test('the title is not truncated when no maximum length is given', () => {
  const s = session({ summary: 'x'.repeat(60) });
  assert.equal(resolveSessionTitle(s), 'x'.repeat(60));
});

test('a title shorter than the maximum length is returned intact', () => {
  const s = session({ summary: 'short' });
  assert.equal(resolveSessionTitle(s, 40), 'short');
});

// ── The search-index title ────────────────────────────────────────────

test('the search title carries the first prompt alongside a user rename', () => {
  const s = session({ name: 'My rename', summary: 'First prompt' });
  assert.equal(resolveSessionSearchTitle(s), 'My rename First prompt');
});

test('the search title carries the first prompt alongside an AI title', () => {
  const s = session({ aiTitle: 'AI', summary: 'First prompt' });
  assert.equal(resolveSessionSearchTitle(s), 'AI First prompt');
});

test('the search title does not repeat the first prompt when it is the resolved title', () => {
  const s = session({ summary: 'First prompt' });
  assert.equal(resolveSessionSearchTitle(s), 'First prompt');
});

test('the search title of a Session with no first prompt is its resolved title alone', () => {
  const s = session({ name: 'My rename' });
  assert.equal(resolveSessionSearchTitle(s), 'My rename');
});
