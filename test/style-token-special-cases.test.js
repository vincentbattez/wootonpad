const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-66 — Special-case tokens: text-on-accent and selected surfaces.
//
// Two tokens whose current computation only makes sense on a near-black
// background are replaced by the equivalent Radix mechanism:
//
//  1. Text on accent — was a single global near-black hex applied to text on
//     ANY accent. It becomes Radix `*-contrast` tokens: one value per accent,
//     so a label on an accent button stays legible in either mode.
//  2. Selected surfaces — were color-mix() at 9%/16% over the panel, calibrated
//     for a near-black panel and near-invisible on a light one. They move to
//     step 5, whose documented role is precisely "selected element".
const styleCss = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'style.css'),
  'utf8',
);

test('no global text-on-accent token survives', () => {
  const matches = styleCss.match(/text-on-accent/gi) || [];
  assert.deepEqual(
    matches,
    [],
    `expected the global --text-on-accent token replaced by per-accent ` +
      `*-contrast tokens, found: ${matches.join(', ')}`,
  );
});

test('per-accent contrast tokens are defined', () => {
  for (const accent of ['orange', 'red', 'jade']) {
    assert.match(
      styleCss,
      new RegExp(`--${accent}-contrast:`),
      `expected a --${accent}-contrast token for text on the ${accent} accent`,
    );
  }
});

test('accent buttons take their text colour from a *-contrast token', () => {
  // Every former text-on-accent call site now reads a per-accent contrast token.
  const contrastUses = styleCss.match(/color:\s*var\(--[a-z]+-contrast\)/gi) || [];
  assert.ok(
    contrastUses.length >= 5,
    `expected accent button labels to use *-contrast tokens, found ` +
      `${contrastUses.length}`,
  );
});

test('selected surfaces rest on step 5, not a color-mix', () => {
  const selected = styleCss.match(/--surface-selected(?:-accent)?:[^;]*/g) || [];
  assert.equal(selected.length, 2, 'expected both selected-surface tokens');
  for (const decl of selected) {
    assert.doesNotMatch(
      decl,
      /color-mix/,
      `expected the selected surface to rest on step 5, not a color-mix: ${decl}`,
    );
    assert.match(
      decl,
      /var\(--[a-z]+-5\)/,
      `expected the selected surface to reference a step-5 token: ${decl}`,
    );
  }
});
