'use strict';

// The one place a Session's title is composed. Pure, with no dependency on the database layer, so
// it loads under bare `node` (Electron's ABI is not required) and its rules are testable against
// literal Session objects. Every consumer reads this instead of re-composing its own chain of `||`.

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
    (typeof s.sessionId === 'string' ? s.sessionId.slice(0, 8) : '');
  if (maxLen != null && title.length > maxLen) return title.slice(0, maxLen);
  return title;
}

/**
 * Compose the `title` column of a Session's search-index entry.
 *
 * That column is a haystack, not a label: the titles-only search mode matches it alone, so it
 * carries the first prompt alongside the resolved title. Without it a Session named by a rename,
 * a custom title or an AI title would stop being findable by the words of its first prompt.
 *
 * @param {object} session  A Session object; `name` must already hold the stored user rename.
 * @returns {string}
 */
function resolveSessionSearchTitle(session) {
  const title = resolveSessionTitle(session);
  const summary = session?.summary || '';
  return title === summary ? summary : `${title} ${summary}`.trim();
}

module.exports = { resolveSessionTitle, resolveSessionSearchTitle };
