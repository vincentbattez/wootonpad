const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-72 — Neutral tone: the 6 Radix neutral ramps.
//
// The user can retint every neutral surface by picking one of Radix's six
// neutral ramps (mauve, gray, slate, sage, olive, sand); `mauve` is the
// default. The wiring has three parts, each guarded here:
//
//  1. All six ramps are imported (light, dark, alpha) in the bundle entry.
//  2. Every neutral token reads a mode-agnostic `--neutral-*` step rather than
//     a hard `--mauve-*` step, so a single tone remap retints the whole app.
//  3. The remap is selected by `[data-neutral-tone="…"]` on the root, one
//     override block per non-default tone.
const RADIX_TONES = ['mauve', 'gray', 'slate', 'sage', 'olive', 'sand'];

const radixTokens = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'radix-tokens.css'),
  'utf8',
);
const styleCss = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'style.css'),
  'utf8',
);

test('all six neutral ramps are imported in light, dark and alpha', () => {
  for (const tone of RADIX_TONES) {
    for (const variant of ['', '-alpha', '-dark', '-dark-alpha']) {
      assert.match(
        radixTokens,
        new RegExp(`@import '@radix-ui/colors/${tone}${variant}\\.css';`),
        `expected the ${tone}${variant} ramp imported for the neutral-tone selector`,
      );
    }
  }
});

test('neutral tokens read --neutral-* steps, not hard --mauve-* steps', () => {
  // Once the tone indirection is in place, the only place a --mauve-* step may
  // appear is the default definition of the --neutral-* layer itself. Every
  // other neutral reference must go through --neutral-*, or a tone change would
  // leave stragglers on mauve.
  const mauveUses = styleCss.match(/var\(--mauve-[a-z]?\d+\)/g) || [];
  const definedAsNeutralDefault = (
    styleCss.match(/--neutral-[a-z]?\d+:\s*var\(--mauve-[a-z]?\d+\)/g) || []
  ).length;
  assert.equal(
    mauveUses.length,
    definedAsNeutralDefault,
    `every --mauve-* use must be the default value of a --neutral-* step; ` +
      `found ${mauveUses.length} uses but only ${definedAsNeutralDefault} neutral defaults`,
  );
});

test('the --neutral-* layer covers the full 12-step ramp plus alpha', () => {
  for (let step = 1; step <= 12; step++) {
    assert.match(
      styleCss,
      new RegExp(`--neutral-${step}:`),
      `expected --neutral-${step} defined`,
    );
    assert.match(
      styleCss,
      new RegExp(`--neutral-a${step}:`),
      `expected --neutral-a${step} defined`,
    );
  }
});

test('each non-default tone has a [data-neutral-tone] override block', () => {
  for (const tone of RADIX_TONES.filter((t) => t !== 'mauve')) {
    assert.match(
      styleCss,
      new RegExp(`\\[data-neutral-tone=(?:"|')?${tone}(?:"|')?\\]`),
      `expected a [data-neutral-tone="${tone}"] override remapping --neutral-* to the ${tone} ramp`,
    );
    assert.match(
      styleCss,
      new RegExp(`\\[data-neutral-tone=(?:"|')?${tone}(?:"|')?\\][\\s\\S]*?--neutral-1:\\s*var\\(--${tone}-1\\)`),
      `expected the ${tone} override to remap --neutral-1 onto var(--${tone}-1)`,
    );
  }
});
