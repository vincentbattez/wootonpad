import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WINDOW,
  AUTOCOMPACT_FRACTION,
  applyStoredContext,
  WARN_TOKENS,
  HIGH_TOKENS,
  CRIT_TOKENS,
  windowFor,
  tickTokens,
  contextTotal,
  formatTokens,
  formatLabel,
  severityFor,
} from './context-gauge.mjs';

test('windowFor returns the model window for a long-context model', () => {
  assert.equal(windowFor('claude-sonnet-4-5-20250929'), 1000000);
});

test('windowFor returns 200k for a known non-long-context model', () => {
  assert.equal(windowFor('claude-opus-4-1-20250805'), DEFAULT_WINDOW);
  assert.equal(DEFAULT_WINDOW, 200000);
});

test('windowFor falls back to 200k for an unknown model, never zero', () => {
  assert.equal(windowFor('claude-something-brand-new'), 200000);
  assert.equal(windowFor(null), 200000);
  assert.equal(windowFor(undefined), 200000);
});

test('tickTokens is the autocompact fraction of the window', () => {
  assert.equal(tickTokens('claude-opus-4'), Math.round(200000 * AUTOCOMPACT_FRACTION));
  assert.equal(tickTokens('claude-sonnet-4-5'), Math.round(1000000 * AUTOCOMPACT_FRACTION));
});

test('contextTotal sums the four counters', () => {
  assert.equal(contextTotal({
    inputTokens: 10, cacheCreationTokens: 20, cacheReadTokens: 300, outputTokens: 40,
  }), 370);
  assert.equal(contextTotal(null), 0);
});

test('formatTokens abbreviates to k', () => {
  assert.equal(formatTokens(48000), '48k');
  assert.equal(formatTokens(200000), '200k');
  assert.equal(formatTokens(48345), '48k');
  assert.equal(formatTokens(650), '1k');
});

test('formatLabel reads "used / window"', () => {
  assert.equal(formatLabel(48000, 200000), '48k / 200k');
});

test('severityFor climbs the statusline tiers on absolute token counts', () => {
  assert.equal(severityFor(0), 'base');
  assert.equal(severityFor(WARN_TOKENS - 1), 'base');
  assert.equal(severityFor(WARN_TOKENS), 'warn');
  assert.equal(severityFor(HIGH_TOKENS - 1), 'warn');
  assert.equal(severityFor(HIGH_TOKENS), 'high');
  assert.equal(severityFor(CRIT_TOKENS - 1), 'high');
  assert.equal(severityFor(CRIT_TOKENS), 'danger');
});

test('the tiers are the statusline context bar\'s, in absolute tokens', () => {
  assert.equal(WARN_TOKENS, 90000);
  assert.equal(HIGH_TOKENS, 120000);
  assert.equal(CRIT_TOKENS, 150000);
});

test('a 1M-window model colours on the same counts as a 200k one', () => {
  assert.equal(severityFor(contextTotal({ inputTokens: CRIT_TOKENS })), 'danger');
});

test('applyStoredContext puts the live values back on a rebuilt tree', () => {
  const usage = { inputTokens: 1, cacheCreationTokens: 2, cacheReadTokens: 3, outputTokens: 4 };
  const projects = [{ sessions: [{ sessionId: 'a' }, { sessionId: 'b', contextUsage: null }] }];
  const contexts = new Map([['b', { usage, model: 'claude-opus-5' }]]);

  applyStoredContext(projects, contexts);

  assert.equal(projects[0].sessions[0].contextUsage, undefined);
  assert.deepEqual(projects[0].sessions[1].contextUsage, usage);
  assert.equal(projects[0].sessions[1].contextModel, 'claude-opus-5');
});

test('applyStoredContext leaves the tree alone when nothing is stored', () => {
  const projects = [{ sessions: [{ sessionId: 'a', contextUsage: null }] }];
  assert.equal(applyStoredContext(projects, new Map()), projects);
  assert.equal(projects[0].sessions[0].contextUsage, null);
});
