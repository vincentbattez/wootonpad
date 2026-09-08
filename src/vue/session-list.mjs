// Ordering and visibility of a Project's Session list: main list vs archive, shown vs older.
// Pure: no Vue, no DOM, no I/O. `now` is injected so the age cutoff is testable.

import { sessionStateFor } from './features/sessions/session-state.mjs';

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// The "running" filter answers the same question the State Dot does: is this row active? A
// Session is active when its Session State is `working` or `needsInput` — a live PTY that is
// merely idle is not (VIN-148). A Terminal has no Session State, so it is kept only when its
// PTY is alive, so the filter never surprisingly hides an open Terminal.
function isActiveRow(session, { activePtyIds, busySessions, attentionSessions, responseReadySessions }) {
  const state = sessionStateFor({
    type: session.type,
    done: session.done,
    isBusy: busySessions.has(session.sessionId),
    isAttention: attentionSessions.has(session.sessionId) || responseReadySessions.has(session.sessionId),
  });
  if (state === 'working' || state === 'needsInput') return true;
  if (state === null) return activePtyIds.has(session.sessionId);
  return false;
}

// Exported so the sidebar's "hide a Project with no surviving Session" rule asks the same
// question this module does, rather than keeping its own copy of the four filters.
export function filterSessions(sessions, { activePtyIds = new Set(), busySessions = new Set(), attentionSessions = new Set(), responseReadySessions = new Set(), searchMatchIds = null, showStarredOnly = false, showRunningOnly = false, showTodayOnly = false, now = 0 } = {}) {
  let out = sessions;
  if (showStarredOnly) out = out.filter(s => s.starred);
  if (showRunningOnly) out = out.filter(s => isActiveRow(s, { activePtyIds, busySessions, attentionSessions, responseReadySessions }));
  if (showTodayOnly) {
    const todayKey = localDayKey(new Date(now));
    out = out.filter(s => s.modified && localDayKey(new Date(s.modified)) === todayKey);
  }
  if (searchMatchIds) out = out.filter(s => searchMatchIds.has(s.sessionId));
  return out;
}

function sessionItem(session, activePtyIds) {
  return {
    type: 'session',
    session,
    sortTime: new Date(session.modified).getTime(),
    pinned: !!session.starred,
    running: activePtyIds.has(session.sessionId),
  };
}

// A Slug carrying a single Session is degrouped: a group header over one row buys nothing.
function groupBySlug(sessions, activePtyIds) {
  const slugMap = new Map();
  const items = [];

  for (const s of sessions) {
    if (!s.slug) {
      items.push(sessionItem(s, activePtyIds));
      continue;
    }
    if (!slugMap.has(s.slug)) slugMap.set(s.slug, []);
    slugMap.get(s.slug).push(s);
  }

  for (const [slug, slugSessions] of slugMap) {
    if (slugSessions.length === 1) {
      items.push(sessionItem(slugSessions[0], activePtyIds));
      continue;
    }
    items.push({
      type: 'slug',
      slug,
      sessions: slugSessions,
      sortTime: Math.max(...slugSessions.map(s => new Date(s.modified).getTime())),
      pinned: slugSessions.some(s => s.starred),
      running: slugSessions.some(s => activePtyIds.has(s.sessionId)),
    });
  }

  return items;
}

// running+pinned > running > pinned > recency
function sortByPriority(items) {
  const rank = (i) => (i.pinned && i.running ? 3 : i.running ? 2 : i.pinned ? 1 : 0);
  return items.sort((a, b) => {
    const diff = rank(b) - rank(a);
    return diff !== 0 ? diff : b.sortTime - a.sortTime;
  });
}

/**
 * @returns {{ visible: object[], older: object[], archivedVisible: object[], archivedOlder: object[] }}
 */
export function partitionSessionList({
  sessions = [],
  activePtyIds = new Set(),
  busySessions = new Set(),
  attentionSessions = new Set(),
  responseReadySessions = new Set(),
  searchMatchIds = null,
  showStarredOnly = false,
  showRunningOnly = false,
  showTodayOnly = false,
  visibleSessionCount = 10,
  sessionMaxAgeDays = 3,
  now = 0,
} = {}) {
  const filters = { activePtyIds, busySessions, attentionSessions, responseReadySessions, searchMatchIds, showStarredOnly, showRunningOnly, showTodayOnly, now };
  const kept = filterSessions(sessions, filters);
  const anyFilter = !!(searchMatchIds || showStarredOnly || showRunningOnly || showTodayOnly);

  // Main list: live Sessions only, Slug-grouped, page-limited by count *and* age.
  const mainItems = sortByPriority(groupBySlug(kept.filter(s => !s.archived), activePtyIds));
  let visible;
  if (anyFilter) {
    visible = mainItems;
  } else {
    const ageCutoff = now - sessionMaxAgeDays * 86400000;
    let count = 0;
    visible = mainItems.filter(item => {
      // Running and pinned rows escape the page limit; the archive grants no such exemption.
      if (item.running || item.pinned || (count < visibleSessionCount && item.sortTime >= ageCutoff)) {
        count++;
        return true;
      }
      return false;
    });
  }
  const visibleSet = new Set(visible);
  const older = mainItems.filter(i => !visibleSet.has(i));

  // Archive: flat (Slug grouping would undo the compaction), most recent first, no age
  // cutoff — an Archived Session is old by nature, so an age window would empty it.
  const archiveItems = kept
    .filter(s => s.archived)
    .map(s => sessionItem(s, activePtyIds))
    .sort((a, b) => b.sortTime - a.sortTime);
  const archiveLimit = searchMatchIds ? archiveItems.length : visibleSessionCount;

  return {
    visible,
    older,
    archivedVisible: archiveItems.slice(0, archiveLimit),
    archivedOlder: archiveItems.slice(archiveLimit),
  };
}
