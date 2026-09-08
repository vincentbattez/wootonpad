const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-148 — The State Dot renders one thing, the Session State, one value of four at a time.
// Same approach as the other style-*.test.js siblings: read the shipped stylesheet and assert
// on the selectors, never on a component's internals. The contract is a *single* class per
// state (no :not() cascade, no !important) and the removal of the five old signals that used
// to fight over the same pixel.
const styleCss = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'style.css'),
  'utf8',
);

// ── The four state renderings each exist, under a single class ──

for (const state of ['sleeping', 'needsInput', 'working', 'done']) {
  test(`the State Dot has a rendering for ${state}`, () => {
    assert.match(
      styleCss,
      new RegExp(`\\.session-state-dot\\.state-${state}\\b`),
      `expected a .session-state-dot.state-${state} rule`,
    );
  });
}

test('done is a solid green disc', () => {
  const rule = styleCss.match(/\.session-state-dot\.state-done\s*\{([^}]*)\}/);
  assert.ok(rule, 'state-done rule not found');
  assert.match(rule[1], /background:\s*var\(--jade-9\)/);
});

test('needsInput is a dotted amber ring', () => {
  const rule = styleCss.match(/\.session-state-dot\.state-needsInput\s*\{([^}]*)\}/);
  assert.ok(rule, 'state-needsInput rule not found');
  assert.match(rule[1], /border-style:\s*dotted/);
  assert.match(rule[1], /var\(--amber-9\)/);
});

test('working breathes — one animation, no rotating arc', () => {
  const rule = styleCss.match(/\.session-state-dot\.state-working\s*\{([^}]*)\}/);
  assert.ok(rule, 'state-working rule not found');
  assert.match(rule[1], /animation:\s*state-dot-breath/);
});

// ── The State Dot class is single — no boolean stack, no !important, no :not() ──

test('no state-dot rule leans on !important or a :not() cascade', () => {
  const rules = styleCss.match(/\.session-state-dot[^{]*\{[^}]*\}/g) || [];
  for (const rule of rules) {
    assert.doesNotMatch(rule, /!important/, `!important survives on: ${rule}`);
    assert.doesNotMatch(rule, /:not\(/, `:not() survives on: ${rule}`);
  }
});

// ── The five old signals that fought over the dot are gone ──

test('the old .session-status-dot.running rule is gone', () => {
  assert.doesNotMatch(styleCss, /\.session-status-dot\.running\b/);
});

test('the rotating busy arc (spin-dot) is gone', () => {
  assert.doesNotMatch(styleCss, /@keyframes\s+spin-dot\b/);
  assert.doesNotMatch(styleCss, /animation:\s*spin-dot/);
});

test('the needs-attention ripple is gone', () => {
  assert.doesNotMatch(styleCss, /@keyframes\s+ripple-out\b/);
  assert.doesNotMatch(styleCss, /\.session-item\.needs-attention\s+\.session-status-dot/);
});

test('the response-ready blue disc on the dot is gone', () => {
  assert.doesNotMatch(styleCss, /\.session-item\.response-ready\s+\.session-status-dot/);
});
