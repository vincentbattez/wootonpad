// The Session row's display strings, read from the frozen renderer's globals in one place so
// the Dumb SessionItem carries no `window.`. `cleanDisplayName`, `lastActivityTime` and
// `formatDate` are installed by public/app.js; each helper degrades to a plain value when the
// global is absent (node has no window), matching the old inline `window.foo ? … : …` guards.

// Run a raw name through the frozen renderer's cleanDisplayName, or return it untouched when
// the global is absent (node has no window). Shared by the row and the terminal header.
export function cleanDisplayName(name) {
  return typeof window !== 'undefined' && window.cleanDisplayName ? window.cleanDisplayName(name) : name;
}

export function sessionDisplayName(session) {
  // `title` is the resolved display title the Session cache lays down (session-title.js); the
  // name/summary tail only covers renderer-built synthetic Sessions that never pass the cache.
  return cleanDisplayName(session.title || session.name || session.summary);
}

export function sessionTimeStr(session) {
  const activity = typeof window !== 'undefined' ? window.lastActivityTime : null;
  const t = activity?.get(session.sessionId) || new Date(session.modified);
  return typeof window !== 'undefined' && window.formatDate ? window.formatDate(t) : '';
}

// The terminal header's subtitle (VIN-146). The first prompt lost the title to the aiTitle and
// took this slot, where the aiTitle used to sit. It is dropped when it already *is* the resolved
// title — the case of a Session with no aiTitle — so the header never says the same thing twice.
// `title` is passed in rather than re-resolved here: the caller has already cleaned it, and the
// precedence rule lives in session-title.js.
export function sessionHeaderSubtitle(session, title) {
  const firstPrompt = cleanDisplayName(session?.firstPrompt || '');
  if (!firstPrompt || firstPrompt === title) return null;
  return firstPrompt;
}
