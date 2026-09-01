// The Session row's display strings, read from the frozen renderer's globals in one place so
// the Dumb SessionItem carries no `window.`. `cleanDisplayName`, `lastActivityTime` and
// `formatDate` are installed by public/app.js; each helper degrades to a plain value when the
// global is absent (node has no window), matching the old inline `window.foo ? … : …` guards.

export function sessionDisplayName(session) {
  const name = session.name || session.summary;
  return typeof window !== 'undefined' && window.cleanDisplayName ? window.cleanDisplayName(name) : name;
}

export function sessionTimeStr(session) {
  const activity = typeof window !== 'undefined' ? window.lastActivityTime : null;
  const t = activity?.get(session.sessionId) || new Date(session.modified);
  return typeof window !== 'undefined' && window.formatDate ? window.formatDate(t) : '';
}
