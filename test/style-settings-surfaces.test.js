const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// VIN-70 — Light mode: dialogs, the settings panel, popovers and the
// add-Project button.
//
// A per-surface migration lot (sibling of VIN-67 / VIN-68 / VIN-69): the
// hard-written colours in the add-Project button and dialog, the settings
// viewer, the new-session dialog and its popover move onto the token layer so
// every modal, form control, dropdown and switch stays legible in light mode
// and coherent in dark, with a visible keyboard focus ring in both. The
// acceptance criterion is exhaustive — no raw colour may survive in these
// sections. Colour has to flow through the Radix-backed tokens (var(--…)) or a
// color-mix() over them, never a literal hex / rgb() / hsl() nor a bare
// black/white keyword calibrated for the old near-black chrome.
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

// Any literal colour: hex, rgb()/rgba(), hsl()/hsla(). The hex arm rejects a
// trailing identifier char so ID selectors such as `#add-project-btn` — whose
// leading `#add` is three hex digits — are not mistaken for colours.
const RAW_COLOUR =
  /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\([^)]*\)/g;

for (const title of [
  'ADD PROJECT BUTTON',
  'ADD PROJECT DIALOG',
  'GLOBAL SETTINGS BUTTON',
  'SETTINGS VIEWER',
  'NEW SESSION DIALOG',
  'NEW SESSION POPOVER',
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

// Accent call sites must resolve to a Radix accent ramp, not an ad-hoc value.
test('the add-Project confirm button and error flow through Radix accents', () => {
  const dialog = section('ADD PROJECT DIALOG');
  assert.match(dialog, /var\(--indigo-\d+\)/, 'confirm button should use indigo');
  assert.match(dialog, /var\(--red-\d+\)/, 'the error message should use red');
});

test('the new-session popover terminal icon flows through the green accent', () => {
  const popover = section('NEW SESSION POPOVER');
  assert.match(popover, /var\(--green-\d+\)/, 'the terminal icon should use green');
});
