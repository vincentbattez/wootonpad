// A project is stale when its most recent session predates the age window.
// Unusable timestamps are skipped, so one bad session can't mask the rest.
export function isStaleProject(project, sessionMaxAgeDays, now) {
  let mostRecent = -Infinity;
  for (const session of project?.sessions || []) {
    const time = new Date(session.modified).getTime();
    if (Number.isFinite(time) && time > mostRecent) mostRecent = time;
  }
  if (mostRecent === -Infinity) return false;
  return (now - mostRecent) > sessionMaxAgeDays * 86400000;
}
