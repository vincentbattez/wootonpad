import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WINDOW,
  AUTOCOMPACT_FRACTION,
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

test('severityFor stays calm below the tick and flips to danger past it', () => {
  const tick = tickTokens('claude-opus-4'); // 184000
  assert.equal(severityFor(tick - 1, 'claude-opus-4'), '');
  assert.equal(severityFor(tick, 'claude-opus-4'), 'danger');
  assert.equal(severityFor(tick + 1, 'claude-opus-4'), 'danger');
  assert.equal(severityFor(0, 'claude-opus-4'), '');
});
