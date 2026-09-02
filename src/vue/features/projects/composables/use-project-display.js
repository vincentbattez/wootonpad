// The Slug group's display strings, read from the frozen renderer's globals in one place so the
// Dumb SlugHeader carries no `window.`. `lastActivityTime`, `cleanDisplayName` and `formatDate` are
// installed by public/app.js; each helper degrades to a plain value when the global is absent (node
// has no window), matching the old inline `window.foo ? … : …` guards. This mirrors the sessions
// Feature's use-session-display.

// The most recently active Session in a slug group, by the renderer's live activity clock with the
// file mtime as the fallback. It picks which Session names the group and dates it.
export function slugMostRecent(sessions) {
  const activity = typeof window !== 'undefined' ? window.lastActivityTime : null;
  return sessions.reduce((a, b) => {
    const aTime = activity?.get(a.sessionId) || new Date(a.modified);
    const bTime = activity?.get(b.sessionId) || new Date(b.modified);
    return bTime > aTime ? b : a;
  });
}

// The group's label: the most-recent Session's name or summary, cleaned, falling back to the slug.
export function slugDisplayName(session, slug) {
  const name = session.name || session.summary || slug;
  return typeof window !== 'undefined' && window.cleanDisplayName ? window.cleanDisplayName(name) : name;
}

// The group's timestamp string for the most-recent Session.
export function slugTimeStr(session) {
  const activity = typeof window !== 'undefined' ? window.lastActivityTime : null;
  const t = activity?.get(session.sessionId) || new Date(session.modified);
  return typeof window !== 'undefined' && window.formatDate ? window.formatDate(t) : '';
}
