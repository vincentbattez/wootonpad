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
