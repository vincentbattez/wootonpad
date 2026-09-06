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
