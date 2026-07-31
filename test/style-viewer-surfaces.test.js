const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-69 — Light mode: the raw JSONL viewer and the statistics screen.
//
// A per-surface migration lot (sibling of VIN-67 / VIN-68): the two densest
// surfaces in semantic colour — message roles in the JSONL viewer, chart
// categories in the stats screen. Their hard-written colours move onto the
// token layer so both stay legible in light mode and coherent in dark. The
// acceptance criterion is exhaustive: no raw colour may survive in these
// sections. Colour has to flow through the Radix-backed tokens (var(--…)) or a
// color-mix() over them — never a literal hex / rgb() / hsl(). Series colours
// in particular must come from Radix accents, not ad-hoc values.
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
  const headerEnd = styleCss.indexOf('*/', start) + 2;
  const after = styleCss.slice(headerEnd);
  const nextBanner = after.search(/\/\* =+ [A-Z]/);
  return nextBanner === -1 ? after : after.slice(0, nextBanner);
}

// Any literal colour: hex, rgb()/rgba(), hsl()/hsla(). Named literals other
// than `transparent` are caught separately below.
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;

for (const title of [
  'STATS VIEWER',
  'JSONL VIEWER',
]) {
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

// Series colours must resolve to a Radix accent ramp, not an ad-hoc rgb().
// Both the token-heavy series (indigo) and the message-count series (jade)
// are expressed as a color-mix over their accent's solid step.
test('stats chart series colours flow through Radix accents', () => {
  const stats = section('STATS VIEWER');
  assert.match(stats, /var\(--indigo-9\)/, 'token series should use --indigo-9');
  assert.match(stats, /var\(--jade-9\)/, 'message series should use --jade-9');
});
