'use strict';

// The one place the display title of a Session is resolved. Pure, with no dependency on the
// database layer, so it loads under bare `node` (Electron's ABI is not required) and its rule is
// testable against literal Session objects. Every consumer — the sidebar, the Session header, the
// JSONL viewer, the resume dialog, the Grid, the IPC-exposed list and the two search-index titles —
// reads this instead of re-composing its own chain of `||`.

/**
 * Resolve the title to display for a Session.
 *
 * Precedence: user rename (`name`) > `customTitle` > `aiTitle` > first prompt (`summary`).
 * Empty or absent sources fall through to the next level rather than producing an empty title;
 * a Session with no source at all falls back to an abbreviated id.
 *
 * @param {object} session   A Session object (or a synthetic terminal Session).
 * @param {number} [maxLen]  Optional maximum length. Truncation is a display constraint of a
 *                           consumer (an external IPC list caps at 40), carried by this parameter
 *                           rather than baked into the rule — when omitted, nothing is truncated.
 * @returns {string}
 */
function resolveSessionTitle(session, maxLen) {
  const s = session || {};
  const title =
    s.name ||
    s.customTitle ||
    s.aiTitle ||
    s.summary ||
    (typeof s.sessionId === 'string' ? s.sessionId.slice(0, 8) : '') ||
    '';
  if (maxLen != null && title.length > maxLen) return title.slice(0, maxLen);
  return title;
}

module.exports = { resolveSessionTitle };
