// The session cache indexes a set of Sources side by side (VIN-152). This suite
// drives the real cache against a faithful in-memory double of the three cache
// tables — session_cache (scoped by accountId + folder), cache_meta (keyed by
// folder alone) and search_map (keyed by folder alone) — which is exactly where
// two sources with identically named folders would collide. It registers a local
// and a remote source whose folders share a name and asserts they stay apart.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sessionCache = require('../session-cache');
const { createSource } = require('../session-source');

// --- A faithful double of db.js's cache tables, same scoping, in plain Maps. ---
function makeDb() {
  const cache = new Map();       // sessionId → row (carries folder + accountId)
  const meta = new Map();        // folder → { folder, projectPath, indexMtimeMs }
  const search = [];             // { id, type, folder }
  const settings = new Map();
  return {
    _cache: cache, _meta: meta, _search: search,
    getCachedByFolder: (folder, accountId = 'default') =>
      [...cache.values()].filter(r => r.folder === folder && r.accountId === accountId)
        .map(r => ({ sessionId: r.sessionId, modified: r.modified })),
    upsertCachedSessions: (sessions, accountId = 'default') => {
      for (const s of sessions) cache.set(s.sessionId, { ...s, accountId });
    },
    deleteCachedSession: (sessionId) => cache.delete(sessionId),
    deleteCachedFolder: (folder, accountId = 'default') => {
      for (const [id, r] of cache) if (r.folder === folder && r.accountId === accountId) cache.delete(id);
      meta.delete(folder); // db.js deletes cache_meta here too
    },
    getAllCached: (accountId = 'default') =>
      [...cache.values()].filter(r => r.accountId === accountId),
    setFolderMeta: (folder, projectPath, indexMtimeMs) => meta.set(folder, { folder, projectPath, indexMtimeMs }),
    getAllFolderMeta: () => new Map([...meta.entries()].map(([k, v]) => [k, v])),
    deleteSearchFolder: (folder) => {
      for (let i = search.length - 1; i >= 0; i--) if (search[i].folder === folder) search.splice(i, 1);
    },
    deleteSearchSession: (id) => {
      for (let i = search.length - 1; i >= 0; i--) if (search[i].id === id) search.splice(i, 1);
    },
    upsertSearchEntries: (entries) => {
      for (const e of entries) {
        for (let i = search.length - 1; i >= 0; i--) if (search[i].id === e.id && search[i].type === e.type) search.splice(i, 1);
        search.push({ id: e.id, type: e.type, folder: e.folder || null });
      }
    },
    getAllMeta: () => new Map(),
    getMeta: () => null,
    setName: () => {},
    getSetting: (k) => settings.get(k),
    getAllProjectGitCounts: () => new Map(),
  };
}

function writeFolder(projectsDir, folder, cwd, sessionId) {
  const dir = path.join(projectsDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({
    type: 'user', cwd, sessionId, uuid: 'u-' + sessionId,
    timestamp: new Date().toISOString(), message: { role: 'user', content: 'hello world' },
  });
  fs.writeFileSync(path.join(dir, sessionId + '.jsonl'), line + '\n');
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-sources-'));
  const localDir = path.join(root, 'local', 'projects');
  const remoteDir = path.join(root, 'remote', 'projects');
  const FOLDER = '-home-me-work-proj';
  writeFolder(localDir, FOLDER, '/home/me/work/proj', 'local-sess-1');
  writeFolder(remoteDir, FOLDER, '/home/me/work/proj', 'remote-sess-1');

  const db = makeDb();
  sessionCache.init({
    PROJECTS_DIR: localDir, accountId: 'default',
    activeSessions: new Map(), getMainWindow: () => null, log: console, db,
  });
  const local = sessionCache.getSource('default');
  const remote = createSource({ id: 'ssh://mac-mini', projectsDir: remoteDir, accountId: 'mac-mini', hostId: 'mac-mini' });
  sessionCache.registerSource(remote);
  return { db, local, remote, FOLDER, root };
}

test('init registers exactly one local source with identity qualifiers', () => {
  const db = makeDb();
  sessionCache.init({
    PROJECTS_DIR: '/tmp/none', accountId: 'default',
    activeSessions: new Map(), getMainWindow: () => null, log: console, db,
  });
  const sources = sessionCache.getSources();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].accountId, 'default');
  assert.equal(sources[0].hostId, null);
});

test('two sources with the same folder name index as two distinct Projects', () => {
  const { local, remote, FOLDER } = setup();
  sessionCache.refreshFolder(FOLDER, local);
  sessionCache.refreshFolder(FOLDER, remote);

  const projects = sessionCache.buildProjectsFromCache();
  const paths = projects.map(p => p.projectPath).sort();
  assert.deepEqual(paths, ['/home/me/work/proj', 'ssh://mac-mini/home/me/work/proj']);

  // Distinct renderer folder ids, so morphdom never collapses them into one row.
  const folderIds = new Set(projects.map(p => p.folder));
  assert.equal(folderIds.size, 2);

  // Each Project carries exactly its own one session.
  for (const p of projects) assert.equal(p.sessions.length, 1);
});

test('the two sources keep separate folder-meta and search entries', () => {
  const { db, local, remote, FOLDER } = setup();
  sessionCache.refreshFolder(FOLDER, local);
  sessionCache.refreshFolder(FOLDER, remote);

  // cache_meta is keyed by folder alone — qualified keys keep both rows alive.
  assert.equal(db._meta.size, 2);
  // One search entry per source, not one clobbering the other.
  assert.equal(db._search.length, 2);
});

test('refreshing a folder on an unregistered source id throws a named error, not an opaque NPE', () => {
  const { FOLDER } = setup();
  assert.throws(
    () => sessionCache.refreshFolder(FOLDER, 'ssh://never-registered'),
    (err) => err instanceof sessionCache.UnknownSourceError && err.sourceId === 'ssh://never-registered',
  );
});

test('unregistering a source evicts only its rows, meta and search entries', () => {
  const { db, local, remote, FOLDER } = setup();
  sessionCache.refreshFolder(FOLDER, local);
  sessionCache.refreshFolder(FOLDER, remote);

  sessionCache.unregisterSource(remote.id);

  // Local survives untouched.
  const projects = sessionCache.buildProjectsFromCache();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].projectPath, '/home/me/work/proj');
  assert.equal(db._meta.size, 1);
  assert.equal(db._search.length, 1);
  assert.equal(db._search[0].id, 'local-sess-1');
  // The remote Account's cached rows are gone.
  assert.equal(db.getAllCached('mac-mini').length, 0);
});

test('evicting the local source leaves a remote source\'s cache_meta and search entries intact', () => {
  const { db, local, remote, FOLDER } = setup();
  sessionCache.refreshFolder(FOLDER, local);
  sessionCache.refreshFolder(FOLDER, remote);

  // Evicting the local source must not reach into the remote's rows, even though
  // cache_meta and search are keyed by folder alone (not Account-scoped) and both
  // folders share a name. Structural ownership — local claims only bare keys —
  // keeps the host-qualified remote key out of the local eviction's folder set.
  sessionCache.unregisterSource(local.id);

  const projects = sessionCache.buildProjectsFromCache();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].projectPath, 'ssh://mac-mini/home/me/work/proj');
  assert.equal(db._meta.size, 1);
  assert.equal(db._search.length, 1);
  assert.equal(db._search[0].id, 'remote-sess-1');
  assert.equal(db.getAllCached('mac-mini').length, 1);
});

test('unregistering a source mid-scan cancels it so the worker cannot resurrect evicted rows', async () => {
  const { db, remote } = setup();
  // Kick off a background scan of the remote source, then pull it out of the
  // registry before the worker reports — the resurrection window. The scan runs
  // on a worker thread, so both synchronous calls complete before any worker
  // message can be processed on this thread.
  sessionCache.populateCacheViaWorker(remote);
  sessionCache.unregisterSource(remote.id);

  // Give any in-flight worker time to finish and (wrongly) post its results.
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Nothing came back for the evicted source — not in session_cache, cache_meta
  // or the search map.
  assert.equal(db.getAllCached('mac-mini').length, 0);
  assert.equal(db._meta.size, 0);
  assert.equal(db._search.length, 0);
});

test('a remote Project group carries remote/hostId and a capability set that hides unsupported buttons', () => {
  const { local, remote, FOLDER } = setup();
  sessionCache.refreshFolder(FOLDER, local);
  sessionCache.refreshFolder(FOLDER, remote);

  const projects = sessionCache.buildProjectsFromCache();
  const localProj = projects.find(p => p.projectPath === '/home/me/work/proj');
  const remoteProj = projects.find(p => p.projectPath === 'ssh://mac-mini/home/me/work/proj');

  // Local is unchanged — not remote, no capability gate (the renderer treats absent as allowed).
  assert.equal(localProj.remote, false);
  assert.equal(localProj.hostId, null);

  // Remote declares its Host and only Sessions listing; Run / External IDE / Project Folder /
  // Project Viewer are not declared, so the UI hides them (ADR 0014 spirit).
  assert.equal(remoteProj.remote, true);
  assert.equal(remoteProj.hostId, 'mac-mini');
  assert.equal(remoteProj.capabilities.run, false);
  assert.equal(remoteProj.capabilities.externalIde, false);
  assert.equal(remoteProj.capabilities.projectFolder, false);
  assert.equal(remoteProj.capabilities.projectViewer, false);
});

test('folderDiskPath resolves a remote session file to the mirror dir, a local one to the local dir', () => {
  const { local, remote, FOLDER } = setup();
  sessionCache.refreshFolder(FOLDER, local);
  sessionCache.refreshFolder(FOLDER, remote);

  const localKey = local.qualifyFolder(FOLDER);
  const remoteKey = remote.qualifyFolder(FOLDER);

  assert.equal(sessionCache.sourceForFolder(remoteKey).id, remote.id);
  assert.equal(sessionCache.sourceForFolder(localKey).id, local.id);

  assert.equal(sessionCache.folderDiskPath(localKey), path.join(local.projectsDir, FOLDER));
  assert.equal(sessionCache.folderDiskPath(remoteKey), path.join(remote.projectsDir, FOLDER));
});
