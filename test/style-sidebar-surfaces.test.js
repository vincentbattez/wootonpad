const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-67 — Light mode: sidebar, status bar, update toast and scrollbar.
//
// A per-surface migration lot: the hard-written colours in these four
// stylesheet sections move onto the token layer so the whole hierarchy stays
// legible in light mode and coherent in dark. The acceptance criterion is
// exhaustive — no raw colour may survive in these sections. Colour has to flow
// through the Radix-backed tokens (var(--…)) or a color-mix() over them, never
// a literal hex / rgb() / hsl().
const styleCss = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'style.css'),
  'utf8',
);

// Slice out one "/* ========== TITLE ========== */" section, up to the next
// such banner (or end of file). Returns the section body without its header.
function section(title) {
  const banner = new RegExp(
    `/\\* =+ ${title} =+ \\*/`,
  );
  const start = styleCss.search(banner);
  assert.notEqual(start, -1, `section "${title}" not found`);
  const after = styleCss.slice(start + styleCss.slice(start).indexOf('*/') + 2);
  const nextBanner = after.search(/\/\* =+ [A-Z]/);
  return nextBanner === -1 ? after : after.slice(0, nextBanner);
}

// Any literal colour: hex, rgb()/rgba(), hsl()/hsla(). Named literals other
// than `transparent` are caught separately below.
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;

for (const title of ['UPDATE TOAST', 'STATUS BAR', 'SIDEBAR', 'SCROLLBAR']) {
  test(`no raw colour survives in the ${title} section`, () => {
    const body = section(title);
    const matches = body.match(RAW_COLOUR) || [];
    assert.deepEqual(
      matches,
      [],
      `expected every colour in ${title} to flow through a token, found: ` +
        matches.join(', '),
    );
  });

  test(`no bare black/white keyword survives in the ${title} section`, () => {
    // color-mix(... , black) / white was calibrated for a near-black chrome
    // and would not invert with the theme.
    const bare = section(title).match(/[,:]\s*(?:black|white)\b/gi) || [];
    assert.deepEqual(
      bare,
      [],
      `expected no bare black/white keyword in ${title}, found: ${bare.join(', ')}`,
    );
  });
}
