const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-65 — Alpha pass: the semi-transparent white/black overlays in the app
// stylesheet migrate onto Radix alpha scales so they invert with the theme.
// The acceptance criterion is exhaustive: no raw rgba(255,255,255,…) or
// rgba(0,0,0,…) may survive in public/style.css. Colored rgba() (e.g. accent
// tints) are a different migration pass and stay out of scope here.
const styleCss = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'style.css'),
  'utf8',
);

test('no raw semi-transparent white overlays remain in style.css', () => {
  const matches = styleCss.match(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,[^)]*\)/gi) || [];
  assert.deepEqual(
    matches,
    [],
    `expected every white overlay migrated to a Radix alpha scale, found: ${matches.join(', ')}`,
  );
});

test('no raw semi-transparent black overlays remain in style.css', () => {
  const matches = styleCss.match(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,[^)]*\)/gi) || [];
  assert.deepEqual(
    matches,
    [],
    `expected every black overlay migrated to a Radix alpha scale, found: ${matches.join(', ')}`,
  );
});
