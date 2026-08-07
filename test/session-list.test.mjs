import test from 'node:test';
import assert from 'node:assert/strict';

import { filterSessions, partitionSessionList } from '../src/vue/session-list.mjs';

const NOW = Date.parse('2026-07-30T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const hoursAgo = (n) => new Date(NOW - n * 3600000).toISOString();

let seq = 0;
function session(overrides = {}) {
  return { sessionId: `s${++seq}`, modified: hoursAgo(1), ...overrides };
}

function partition(overrides = {}) {
  return partitionSessionList({ now: NOW, ...overrides });
}

const ids = (items) => items.map(i => (i.type === 'slug' ? `slug:${i.slug}` : i.session.sessionId));

// ── Main list: filters ────────────────────────────────────────────

test('no sessions yields four empty lists', () => {
  const out = partition({ sessions: [] });
  assert.deepEqual(out, { visible: [], older: [], archivedVisible: [], archivedOlder: [] });
});

test('the starred filter keeps only starred sessions', () => {
  const a = session({ sessionId: 'a', starred: 1 });
  const b = session({ sessionId: 'b' });
  const out = partition({ sessions: [a, b], showStarredOnly: true });
  assert.deepEqual(ids(out.visible), ['a']);
});

test('the running filter keeps only sessions with a live pty', () => {
  const a = session({ sessionId: 'a' });
  const b = session({ sessionId: 'b' });
  const out = partition({ sessions: [a, b], showRunningOnly: true, activePtyIds: new Set(['b']) });
  assert.deepEqual(ids(out.visible), ['b']);
});

test('the today filter keeps only sessions modified today', () => {
  const a = session({ sessionId: 'a', modified: hoursAgo(2) });
  const b = session({ sessionId: 'b', modified: daysAgo(5) });
  const c = session({ sessionId: 'c', modified: null });
  const out = partition({ sessions: [a, b, c], showTodayOnly: true });
  assert.deepEqual(ids(out.visible), ['a']);
});

test('search keeps only matching sessions', () => {
  const a = session({ sessionId: 'a' });
  const b = session({ sessionId: 'b' });
  const out = partition({ sessions: [a, b], searchMatchIds: new Set(['b']) });
  assert.deepEqual(ids(out.visible), ['b']);
});

test('filters combine conjunctively', () => {
  const a = session({ sessionId: 'a', starred: 1 });
  const b = session({ sessionId: 'b', starred: 1 });
  const c = session({ sessionId: 'c' });
  const out = partition({
    sessions: [a, b, c],
    showStarredOnly: true,
    searchMatchIds: new Set(['b', 'c']),
  });
  assert.deepEqual(ids(out.visible), ['b']);
});

// ── Main list: slug grouping ──────────────────────────────────────

test('sessions sharing a slug collapse into one slug group', () => {
  const a = session({ sessionId: 'a', slug: 'feat' });
  const b = session({ sessionId: 'b', slug: 'feat' });
  const out = partition({ sessions: [a, b] });
  assert.deepEqual(ids(out.visible), ['slug:feat']);
  assert.deepEqual(out.visible[0].sessions.map(s => s.sessionId), ['a', 'b']);
});

test('a slug holding a single session is degrouped', () => {
  const a = session({ sessionId: 'a', slug: 'feat' });
  const out = partition({ sessions: [a] });
  assert.deepEqual(ids(out.visible), ['a']);
});

test('a slug group sorts by its most recent session', () => {
  const old = session({ sessionId: 'old', slug: 'feat', modified: daysAgo(2) });
  const recent = session({ sessionId: 'recent', slug: 'feat', modified: hoursAgo(1) });
  const middle = session({ sessionId: 'middle', modified: hoursAgo(5) });
  const out = partition({ sessions: [old, recent, middle] });
  assert.deepEqual(ids(out.visible), ['slug:feat', 'middle']);
});

test('a slug group is running or pinned when any of its sessions is', () => {
  const a = session({ sessionId: 'a', slug: 'feat' });
  const b = session({ sessionId: 'b', slug: 'feat', starred: 1 });
  const out = partition({ sessions: [a, b], activePtyIds: new Set(['a']) });
  assert.equal(out.visible[0].running, true);
  assert.equal(out.visible[0].pinned, true);
});

// ── Main list: priority sort ──────────────────────────────────────

test('sessions sort running+pinned, then running, then pinned, then recency', () => {
  const plain = session({ sessionId: 'plain', modified: hoursAgo(1) });
  const pinned = session({ sessionId: 'pinned', starred: 1, modified: daysAgo(9) });
  const running = session({ sessionId: 'running', modified: daysAgo(9) });
  const both = session({ sessionId: 'both', starred: 1, modified: daysAgo(9) });
  const out = partition({
    sessions: [plain, pinned, running, both],
    activePtyIds: new Set(['running', 'both']),
  });
  assert.deepEqual(ids(out.visible), ['both', 'running', 'pinned', 'plain']);
});

test('equal priority sorts most recent first', () => {
  const a = session({ sessionId: 'a', modified: hoursAgo(5) });
  const b = session({ sessionId: 'b', modified: hoursAgo(1) });
  const out = partition({ sessions: [a, b] });
  assert.deepEqual(ids(out.visible), ['b', 'a']);
});

// ── Main list: pagination ─────────────────────────────────────────

test('the main list pages beyond the visible count', () => {
  const sessions = Array.from({ length: 5 }, (_, i) =>
    session({ sessionId: `s-${i}`, modified: hoursAgo(i + 1) })
  );
  const out = partition({ sessions, visibleSessionCount: 3 });
  assert.deepEqual(ids(out.visible), ['s-0', 's-1', 's-2']);
  assert.deepEqual(ids(out.older), ['s-3', 's-4']);
});

test('a session older than the age cutoff falls to the older list', () => {
  const fresh = session({ sessionId: 'fresh', modified: daysAgo(1) });
  const stale = session({ sessionId: 'stale', modified: daysAgo(4) });
  const out = partition({ sessions: [fresh, stale], sessionMaxAgeDays: 3 });
  assert.deepEqual(ids(out.visible), ['fresh']);
  assert.deepEqual(ids(out.older), ['stale']);
});

test('running and pinned sessions escape both the page limit and the age cutoff', () => {
  const filler = Array.from({ length: 3 }, (_, i) => session({ sessionId: `f-${i}`, modified: hoursAgo(i + 1) }));
  const oldPinned = session({ sessionId: 'oldPinned', starred: 1, modified: daysAgo(40) });
  const oldRunning = session({ sessionId: 'oldRunning', modified: daysAgo(40) });
  const out = partition({
    sessions: [...filler, oldPinned, oldRunning],
    activePtyIds: new Set(['oldRunning']),
    visibleSessionCount: 1,
  });
  // The exempt rows still consume the page budget, so the plain rows fall through.
  assert.deepEqual(ids(out.visible), ['oldRunning', 'oldPinned']);
  assert.deepEqual(ids(out.older), ['f-0', 'f-1', 'f-2']);
});

test('an active filter disables main-list pagination', () => {
  const sessions = Array.from({ length: 5 }, (_, i) =>
    session({ sessionId: `s-${i}`, starred: 1, modified: daysAgo(i + 20) })
  );
  const out = partition({ sessions, showStarredOnly: true, visibleSessionCount: 2 });
  assert.equal(out.visible.length, 5);
  assert.deepEqual(out.older, []);
});

// ── Archive ───────────────────────────────────────────────────────

test('an archived session never appears in the main list', () => {
  const live = session({ sessionId: 'live' });
  const archived = session({ sessionId: 'archived', archived: 1 });
  const out = partition({ sessions: [live, archived] });
  assert.deepEqual(ids(out.visible), ['live']);
  assert.deepEqual(ids(out.older), []);
  assert.deepEqual(ids(out.archivedVisible), ['archived']);
});

test('a project with no archived session has an empty archive', () => {
  const out = partition({ sessions: [session(), session()] });
  assert.deepEqual(out.archivedVisible, []);
  assert.deepEqual(out.archivedOlder, []);
});

test('the archive sorts by modified descending, ignoring running and pinned', () => {
  const a = session({ sessionId: 'a', archived: 1, modified: daysAgo(5), starred: 1 });
  const b = session({ sessionId: 'b', archived: 1, modified: daysAgo(1) });
  const c = session({ sessionId: 'c', archived: 1, modified: daysAgo(3) });
  const out = partition({ sessions: [a, b, c], activePtyIds: new Set(['a']) });
  assert.deepEqual(ids(out.archivedVisible), ['b', 'c', 'a']);
});

test('the archive applies no age cutoff', () => {
  const ancient = session({ sessionId: 'ancient', archived: 1, modified: daysAgo(400) });
  const out = partition({ sessions: [ancient], sessionMaxAgeDays: 3 });
  assert.deepEqual(ids(out.archivedVisible), ['ancient']);
  assert.deepEqual(out.archivedOlder, []);
});

test('the archive pages beyond the visible count', () => {
  const sessions = Array.from({ length: 5 }, (_, i) =>
    session({ sessionId: `a-${i}`, archived: 1, modified: daysAgo(i + 1) })
  );
  const out = partition({ sessions, visibleSessionCount: 2 });
  assert.deepEqual(ids(out.archivedVisible), ['a-0', 'a-1']);
  assert.deepEqual(ids(out.archivedOlder), ['a-2', 'a-3', 'a-4']);
});

test('the archive grants no page-limit exemption to running or pinned sessions', () => {
  const recent = session({ sessionId: 'recent', archived: 1, modified: daysAgo(1) });
  const oldPinned = session({ sessionId: 'oldPinned', archived: 1, starred: 1, modified: daysAgo(30) });
  const oldRunning = session({ sessionId: 'oldRunning', archived: 1, modified: daysAgo(40) });
  const out = partition({
    sessions: [recent, oldPinned, oldRunning],
    activePtyIds: new Set(['oldRunning']),
    visibleSessionCount: 1,
  });
  assert.deepEqual(ids(out.archivedVisible), ['recent']);
  assert.deepEqual(ids(out.archivedOlder), ['oldPinned', 'oldRunning']);
});

test('the archive is flat — a shared slug does not group archived sessions', () => {
  const a = session({ sessionId: 'a', archived: 1, slug: 'feat', modified: daysAgo(1) });
  const b = session({ sessionId: 'b', archived: 1, slug: 'feat', modified: daysAgo(2) });
  const out = partition({ sessions: [a, b] });
  assert.deepEqual(ids(out.archivedVisible), ['a', 'b']);
});

test('search restricts the archive and disables its pagination', () => {
  const sessions = Array.from({ length: 5 }, (_, i) =>
    session({ sessionId: `a-${i}`, archived: 1, modified: daysAgo(i + 1) })
  );
  const out = partition({
    sessions,
    searchMatchIds: new Set(['a-1', 'a-2', 'a-3', 'a-4']),
    visibleSessionCount: 2,
  });
  assert.deepEqual(ids(out.archivedVisible), ['a-1', 'a-2', 'a-3', 'a-4']);
  assert.deepEqual(out.archivedOlder, []);
});

test('the starred filter reaches archived sessions', () => {
  const a = session({ sessionId: 'a', archived: 1, starred: 1 });
  const b = session({ sessionId: 'b', archived: 1 });
  const out = partition({ sessions: [a, b], showStarredOnly: true });
  assert.deepEqual(ids(out.archivedVisible), ['a']);
});

test('a fully archived project keeps an empty main list and a populated archive', () => {
  const sessions = [session({ archived: 1 }), session({ archived: 1 })];
  const out = partition({ sessions });
  assert.deepEqual(out.visible, []);
  assert.deepEqual(out.older, []);
  assert.equal(out.archivedVisible.length, 2);
});

// ── filterSessions (the sidebar's "does this Project survive?" question) ──

test('filterSessions keeps an archived session, so a fully archived project survives', () => {
  const sessions = [session({ archived: 1 })];
  assert.equal(filterSessions(sessions, { now: NOW }).length, 1);
});

test('filterSessions applies the same four filters as the partition', () => {
  const a = session({ sessionId: 'a', starred: 1, modified: hoursAgo(1) });
  const b = session({ sessionId: 'b', modified: daysAgo(5) });
  assert.deepEqual(filterSessions([a, b], { now: NOW, showStarredOnly: true }).map(s => s.sessionId), ['a']);
  assert.deepEqual(filterSessions([a, b], { now: NOW, showTodayOnly: true }).map(s => s.sessionId), ['a']);
  assert.deepEqual(
    filterSessions([a, b], { now: NOW, showRunningOnly: true, activePtyIds: new Set(['b']) }).map(s => s.sessionId),
    ['b']
  );
  assert.deepEqual(filterSessions([a, b], { now: NOW, searchMatchIds: new Set(['b']) }).map(s => s.sessionId), ['b']);
});

test('filterSessions with no filters is the identity', () => {
  const sessions = [session(), session()];
  assert.deepEqual(filterSessions(sessions), sessions);
});
