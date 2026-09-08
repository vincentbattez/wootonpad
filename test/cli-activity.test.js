const test = require('node:test');
const assert = require('node:assert/strict');

const { isBusyTitle, isIdleTitle } = require('../cli-activity.js');

// VIN-148 — the Session State's busy signal is read off the CLI's OSC 0 title, and the CLI
// owns that alphabet. When v2.1 moved its spinner from the braille block to ◐◑, the check
// here still only knew braille: `working` never fired, no busy→idle transition ever fired
// either, and every row sat on `sleeping` — a grey dot whatever the CLI was doing. These
// cases are the glyphs actually observed in ~/Library/Logs/wootonpad/main.log.

test('the v2.1 half-circle spinner reads as busy', () => {
  // 6378 occurrences in the log; the two frames the CLI actually cycles through.
  for (const glyph of ['◐', '◑']) {
    assert.equal(isBusyTitle(glyph), true, `${glyph} is a spinner frame`);
  }
});

test('the rest of the half-circle cycle is busy too, so a rotation change is not a regression', () => {
  for (const glyph of ['◒', '◓']) assert.equal(isBusyTitle(glyph), true, glyph);
});

test('the v1 braille spinner still reads as busy', () => {
  for (const glyph of ['⠋', '⠙', '⠹', '⠸', '⣿']) {
    assert.equal(isBusyTitle(glyph), true, `${glyph} is a braille spinner frame`);
  }
});

test('the resting asterisk is idle, and never busy', () => {
  assert.equal(isIdleTitle('✳'), true);
  assert.equal(isBusyTitle('✳'), false);
});

test('a title carrying more than the glyph is judged on its first character', () => {
  assert.equal(isBusyTitle('◐ Cogitating…'), true);
  assert.equal(isIdleTitle('✳ wootonpad'), true);
});

test('an unknown or empty title is neither busy nor idle', () => {
  // 9 empty payloads in the log. Neither may raise a false `working`, and neither may be
  // mistaken for the CLI reporting that it stopped.
  for (const title of ['', null, undefined, 'zsh', '~/lab/tmp']) {
    assert.equal(isBusyTitle(title), false, `${title} must not read as busy`);
    assert.equal(isIdleTitle(title), false, `${title} must not read as idle`);
  }
});
