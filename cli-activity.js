/**
 * cli-activity.js — Reading the Claude CLI's activity off its OSC 0 terminal title.
 *
 * The CLI writes a spinner glyph into the title while it works and a resting glyph when it
 * stops, and that title is the authoritative busy signal (VIN-143, VIN-148). The alphabet is
 * the CLI's, not ours, and it changes between releases: v1 span the braille block, v2.1 spins
 * ◐◑. A glyph we do not recognise reads as "not busy", so an unknown spinner does not raise a
 * false `working` — but it does mean the Session State never leaves `sleeping`, which is why
 * this lives in one tested place rather than inline in a 100k-line main.js.
 */

// Spinner glyphs, by CLI generation. Ranges rather than exact sets: each family cycles through
// its own frames, and we only ever see the first character of the title.
const SPINNER_RANGES = [
  // Braille patterns ⠋⠙⠹⠸… — Claude Code v1.x.
  [0x2800, 0x28ff],
  // Half-filled circles ◐◑◒◓ — Claude Code v2.1.x. Only ◐ and ◑ are observed in practice;
  // the other two frames of the cycle are included so a rotation change is not a regression.
  [0x25d0, 0x25d3],
];

// ✳ — the CLI is resting, waiting on the human. The one glyph that means "not working".
const IDLE_CHAR = '✳';

/** Is this title the CLI telling us it is working? */
function isBusyTitle(title) {
  const code = codePointOf(title);
  if (code === null) return false;
  return SPINNER_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
}

/** Is this title the CLI telling us it has stopped? Never merely "not busy". */
function isIdleTitle(title) {
  return typeof title === 'string' && title.charAt(0) === IDLE_CHAR;
}

function codePointOf(title) {
  if (typeof title !== 'string' || title.length === 0) return null;
  const code = title.codePointAt(0);
  return Number.isFinite(code) ? code : null;
}

module.exports = { isBusyTitle, isIdleTitle };
