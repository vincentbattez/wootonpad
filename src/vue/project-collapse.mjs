// A project is stale when its most recent session predates the age window.
export function isStaleProject(project, sessionMaxAgeDays, now) {
  const sessions = project?.sessions || [];
  if (sessions.length === 0) return false;
  const mostRecent = Math.max(...sessions.map(s => new Date(s.modified).getTime()));
  return (now - mostRecent) > sessionMaxAgeDays * 86400000;
}
