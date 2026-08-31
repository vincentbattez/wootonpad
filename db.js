const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.wootonpad');
const fs = require('fs');
// Migrate from old .switchboard dir if .wootonpad doesn't exist yet
const OLD_DATA_DIR = path.join(os.homedir(), '.switchboard');
if (!fs.existsSync(DATA_DIR)) {
  if (fs.existsSync(OLD_DATA_DIR)) {
    try { fs.cpSync(OLD_DATA_DIR, DATA_DIR, { recursive: true }); } catch { fs.mkdirSync(DATA_DIR, { recursive: true }); }
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const DB_PATH = path.join(DATA_DIR, 'switchboard.db');

// Migrate from old locations if needed
const OLD_LOCATIONS = [
  path.join(os.homedir(), '.claude', 'browser', 'switchboard.db'),
  path.join(os.homedir(), '.claude', 'browser', 'session-browser.db'),
  path.join(os.homedir(), '.claude', 'session-browser.db'),
];
if (!fs.existsSync(DB_PATH)) {
  for (const oldPath of OLD_LOCATIONS) {
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, DB_PATH);
      try { fs.renameSync(oldPath + '-wal', DB_PATH + '-wal'); } catch {}
      try { fs.renameSync(oldPath + '-shm', DB_PATH + '-shm'); } catch {}
      break;
    }
  }
}
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS session_meta (
    sessionId TEXT PRIMARY KEY,
    name TEXT,
    starred INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS session_cache (
    sessionId TEXT PRIMARY KEY,
    folder TEXT NOT NULL,
    projectPath TEXT,
    summary TEXT,
    firstPrompt TEXT,
    created TEXT,
    modified TEXT,
    messageCount INTEGER DEFAULT 0,
    slug TEXT,
    aiTitle TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS cache_meta (
    folder TEXT PRIMARY KEY,
    projectPath TEXT,
    indexMtimeMs REAL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

// Index for fast folder lookups
db.exec('CREATE INDEX IF NOT EXISTS idx_session_cache_folder ON session_cache(folder)');
db.exec('CREATE INDEX IF NOT EXISTS idx_session_cache_slug ON session_cache(slug)');

// --- Migrations ---
// Each migration runs once, in order. Add new migrations to the end.
let searchFtsRecreated = false;
const migrations = [
  // v1: (superseded by v2)
  () => {},
  // v2: Clear session cache to re-index with corrected worktree paths
  (db) => {
    try { db.exec('DELETE FROM session_cache'); } catch {}
    try { db.exec('DELETE FROM cache_meta'); } catch {}
    try { db.exec('DELETE FROM search_map'); } catch {}
    try { db.exec('DROP TABLE IF EXISTS search_fts'); } catch {}
    searchFtsRecreated = true;
  },
  // v3: Add aiTitle column for AI-generated session titles. Clear cache so a
  // re-index repopulates the column. Also clear session_meta.name entries that
  // were clobbered by AI titles in v0.0.29 (when ai-title was written into the
  // user-name column). We cannot tell with certainty which names came from an
  // AI title vs a manual rename, but the safe heuristic is: drop names whose
  // value matches the JSONL aiTitle on next index. That post-index cleanup is
  // not done here — instead we accept that any pre-fix AI-title pollution
  // remains until the user renames manually, and only future indexes are clean.
  (db) => {
    try { db.exec('ALTER TABLE session_cache ADD COLUMN aiTitle TEXT'); } catch {}
    try { db.exec('DELETE FROM session_cache'); } catch {}
    try { db.exec('DELETE FROM cache_meta'); } catch {}
  },
  // v4: Add accountId to session_cache for multi-account support. Clear cache
  // so all sessions get re-indexed and tagged with accountId = 'default'.
  (db) => {
    try { db.exec("ALTER TABLE session_cache ADD COLUMN accountId TEXT NOT NULL DEFAULT 'default'"); } catch {}
    try { db.exec('DELETE FROM session_cache'); } catch {}
    try { db.exec('DELETE FROM cache_meta'); } catch {}
    try { db.exec('DELETE FROM search_map'); } catch {}
    try { db.exec('DROP TABLE IF EXISTS search_fts'); } catch {}
    searchFtsRecreated = true;
  },
  // v5: Add project_git_cache for stale-while-revalidate git/docker info per project.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_git_cache (
        projectPath TEXT PRIMARY KEY,
        branch TEXT,
        unpushedCount INTEGER NOT NULL DEFAULT 0,
        changedCount INTEGER NOT NULL DEFAULT 0,
        totalAdded INTEGER NOT NULL DEFAULT 0,
        totalDeleted INTEGER NOT NULL DEFAULT 0,
        containers TEXT NOT NULL DEFAULT '[]',
        unpushedCommits TEXT NOT NULL DEFAULT '[]',
        changedFiles TEXT NOT NULL DEFAULT '[]',
        commits TEXT NOT NULL DEFAULT '[]',
        updatedAt REAL
      )
    `);
  },
  // v6: Add upstream, remoteUrl, tags columns to project_git_cache.
  (db) => {
    db.exec(`
      ALTER TABLE project_git_cache ADD COLUMN upstream TEXT;
      ALTER TABLE project_git_cache ADD COLUMN remoteUrl TEXT;
      ALTER TABLE project_git_cache ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
    `);
  },
  // v7: Add project_avatars for storing GitLab avatar image blobs.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_avatars (
        projectPath TEXT PRIMARY KEY,
        avatarData BLOB,
        mimeType TEXT,
        fetchedAt INTEGER
      )
    `);
  },
  // v8: Areas — a user-authored tree above Projects in the sidebar. Membership is explicit
  // (ADR 0001): project_area is keyed by path and survives a Project leaving the scan.
  // Images live in their own table so reading the tree never carries image bytes.
  // No ON DELETE clauses: foreign keys are not enforced on this connection, and deleting an
  // Area must re-parent its children rather than cascade (VIN-81), so nothing may be implied.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS areas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parentId TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        collapsed INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_areas_parent ON areas(parentId);
      CREATE TABLE IF NOT EXISTS project_area (
        projectPath TEXT PRIMARY KEY,
        areaId TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_area_area ON project_area(areaId);
      CREATE TABLE IF NOT EXISTS area_avatars (
        areaId TEXT PRIMARY KEY,
        avatarData BLOB,
        mimeType TEXT,
        fetchedAt INTEGER
      );
    `);
  },
];

const currentDbVersion = (() => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'db_version'").get();
    return row ? JSON.parse(row.value) : 0;
  } catch { return 0; }
})();

for (let i = currentDbVersion; i < migrations.length; i++) {
  migrations[i](db);
}
if (migrations.length > currentDbVersion) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('db_version', ?)").run(JSON.stringify(migrations.length));
}

// --- FTS5 full-text search ---
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
    title, body, tokenize='trigram case_sensitive 0'
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS search_map (
    rowid INTEGER PRIMARY KEY,
    id TEXT NOT NULL,
    type TEXT NOT NULL,
    folder TEXT
  )
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_search_map_type_id ON search_map(type, id)');

const stmts = {
  get: db.prepare('SELECT * FROM session_meta WHERE sessionId = ?'),
  getAll: db.prepare('SELECT * FROM session_meta'),
  upsertName: db.prepare(`
    INSERT INTO session_meta (sessionId, name) VALUES (?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET name = excluded.name
  `),
  upsertStar: db.prepare(`
    INSERT INTO session_meta (sessionId, starred) VALUES (?, 1)
    ON CONFLICT(sessionId) DO UPDATE SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END
  `),
  upsertArchived: db.prepare(`
    INSERT INTO session_meta (sessionId, archived) VALUES (?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET archived = excluded.archived
  `),
  // Session cache statements
  cacheCountByAccount: db.prepare("SELECT COUNT(*) as cnt FROM session_cache WHERE accountId = ?"),
  cacheGetByAccount: db.prepare('SELECT * FROM session_cache WHERE accountId = ?'),
  cacheUpsert: db.prepare(`
    INSERT INTO session_cache (sessionId, folder, projectPath, summary, firstPrompt, created, modified, messageCount, slug, aiTitle, accountId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET
      folder = excluded.folder, projectPath = excluded.projectPath,
      summary = excluded.summary, firstPrompt = excluded.firstPrompt,
      created = excluded.created, modified = excluded.modified,
      messageCount = excluded.messageCount, slug = excluded.slug,
      aiTitle = COALESCE(session_cache.aiTitle, excluded.aiTitle), accountId = excluded.accountId
  `),
  cacheGetByFolder: db.prepare('SELECT sessionId, modified FROM session_cache WHERE folder = ? AND accountId = ?'),
  cacheGetFolder: db.prepare('SELECT folder FROM session_cache WHERE sessionId = ?'),
  cacheGetSession: db.prepare('SELECT * FROM session_cache WHERE sessionId = ?'),
  cacheDeleteSession: db.prepare('DELETE FROM session_cache WHERE sessionId = ?'),
  cacheDeleteFolderAccount: db.prepare('DELETE FROM session_cache WHERE folder = ? AND accountId = ?'),
  // Cache meta statements
  metaGet: db.prepare('SELECT * FROM cache_meta WHERE folder = ?'),
  metaGetAll: db.prepare('SELECT * FROM cache_meta'),
  metaUpsert: db.prepare(`
    INSERT INTO cache_meta (folder, projectPath, indexMtimeMs)
    VALUES (?, ?, ?)
    ON CONFLICT(folder) DO UPDATE SET
      projectPath = excluded.projectPath, indexMtimeMs = excluded.indexMtimeMs
  `),
  metaDelete: db.prepare('DELETE FROM cache_meta WHERE folder = ?'),
  // FTS search statements
  searchDeleteBySession: db.prepare('DELETE FROM search_fts WHERE rowid IN (SELECT rowid FROM search_map WHERE type = \'session\' AND id = ?)'),
  searchMapDeleteBySession: db.prepare('DELETE FROM search_map WHERE type = \'session\' AND id = ?'),
  searchDeleteByFolder: db.prepare('DELETE FROM search_fts WHERE rowid IN (SELECT rowid FROM search_map WHERE type = \'session\' AND folder = ?)'),
  searchMapDeleteByFolder: db.prepare('DELETE FROM search_map WHERE type = \'session\' AND folder = ?'),
  searchDeleteByType: db.prepare('DELETE FROM search_fts WHERE rowid IN (SELECT rowid FROM search_map WHERE type = ?)'),
  searchMapDeleteByType: db.prepare('DELETE FROM search_map WHERE type = ?'),
  searchInsertFts: db.prepare('INSERT OR REPLACE INTO search_fts(rowid, title, body) VALUES (?, ?, ?)'),
  searchInsertMap: db.prepare('INSERT OR REPLACE INTO search_map(id, type, folder) VALUES (?, ?, ?)'),
  searchMapLookup: db.prepare('SELECT rowid FROM search_map WHERE id = ? AND type = ?'),
  searchUpdateTitle: db.prepare('UPDATE search_fts SET title = ? WHERE rowid = (SELECT rowid FROM search_map WHERE id = ? AND type = ?)'),
  searchDeleteByRowid: db.prepare('DELETE FROM search_fts WHERE rowid = ?'),
  searchMapDeleteByRowid: db.prepare('DELETE FROM search_map WHERE rowid = ?'),
  // Settings statements
  settingsGet: db.prepare('SELECT value FROM settings WHERE key = ?'),
  settingsUpsert: db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
  settingsDelete: db.prepare('DELETE FROM settings WHERE key = ?'),
  searchQuery: db.prepare(`
    SELECT search_map.id, snippet(search_fts, 1, '<mark>', '</mark>', '...', 40) as snippet
    FROM search_fts
    JOIN search_map ON search_fts.rowid = search_map.rowid
    WHERE search_map.type = ? AND search_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `),
};

function getMeta(sessionId) {
  return stmts.get.get(sessionId) || null;
}

function getAllMeta() {
  const rows = stmts.getAll.all();
  const map = new Map();
  for (const row of rows) map.set(row.sessionId, row);
  return map;
}

function setName(sessionId, name) {
  stmts.upsertName.run(sessionId, name);
}

function toggleStar(sessionId) {
  stmts.upsertStar.run(sessionId);
  const row = stmts.get.get(sessionId);
  return row.starred;
}

function setArchived(sessionId, archived) {
  stmts.upsertArchived.run(sessionId, archived ? 1 : 0);
}

// --- Session cache functions ---

function isCachePopulated(accountId = 'default') {
  return stmts.cacheCountByAccount.get(accountId).cnt > 0;
}

function getAllCached(accountId = 'default') {
  return stmts.cacheGetByAccount.all(accountId);
}

const upsertCachedSessionsBatch = db.transaction((sessions, accountId) => {
  for (const s of sessions) {
    stmts.cacheUpsert.run(
      s.sessionId, s.folder, s.projectPath, s.summary,
      s.firstPrompt, s.created, s.modified, s.messageCount || 0,
      s.slug || null, s.aiTitle || null, accountId
    );
  }
});

function upsertCachedSessions(sessions, accountId = 'default') {
  upsertCachedSessionsBatch(sessions, accountId);
}

function getCachedByFolder(folder, accountId = 'default') {
  return stmts.cacheGetByFolder.all(folder, accountId);
}

function getCachedFolder(sessionId) {
  const row = stmts.cacheGetFolder.get(sessionId);
  return row ? row.folder : null;
}

function getCachedSession(sessionId) {
  return stmts.cacheGetSession.get(sessionId) || null;
}

function deleteCachedSession(sessionId) {
  stmts.cacheDeleteSession.run(sessionId);
}

function deleteCachedFolder(folder, accountId = 'default') {
  stmts.cacheDeleteFolderAccount.run(folder, accountId);
  stmts.metaDelete.run(folder);
}

function getFolderMeta(folder) {
  return stmts.metaGet.get(folder) || null;
}

function getAllFolderMeta() {
  const rows = stmts.metaGetAll.all();
  const map = new Map();
  for (const row of rows) map.set(row.folder, row);
  return map;
}

function setFolderMeta(folder, projectPath, indexMtimeMs) {
  stmts.metaUpsert.run(folder, projectPath, indexMtimeMs);
}

// --- FTS search functions ---

const upsertSearchEntriesBatch = db.transaction((entries) => {
  for (const e of entries) {
    // Delete any existing FTS row for this (id, type) pair before inserting.
    // search_map uses INSERT OR REPLACE which deletes the old row and creates
    // a new one with a new rowid, but the orphaned FTS5 row keyed to the old
    // rowid would never be cleaned up — causing duplicate search results and
    // unbounded FTS table growth.
    const existing = stmts.searchMapLookup.get(e.id, e.type);
    if (existing) {
      stmts.searchDeleteByRowid.run(existing.rowid);
      stmts.searchMapDeleteByRowid.run(existing.rowid);
    }
    const result = stmts.searchInsertMap.run(e.id, e.type, e.folder || null);
    stmts.searchInsertFts.run(result.lastInsertRowid, e.title || '', e.body || '');
  }
});

function deleteSearchSession(sessionId) {
  stmts.searchDeleteBySession.run(sessionId);
  stmts.searchMapDeleteBySession.run(sessionId);
}

function deleteSearchFolder(folder) {
  stmts.searchDeleteByFolder.run(folder);
  stmts.searchMapDeleteByFolder.run(folder);
}

function deleteSearchType(type) {
  stmts.searchDeleteByType.run(type);
  stmts.searchMapDeleteByType.run(type);
}

function upsertSearchEntries(entries) {
  upsertSearchEntriesBatch(entries);
}

function updateSearchTitle(id, type, title) {
  try {
    stmts.searchUpdateTitle.run(title, id, type);
  } catch {}
}

function searchByType(type, query, limit = 50, titleOnly = false) {
  try {
    // Wrap in double quotes for exact substring matching with trigram tokenizer.
    // This prevents FTS5 from splitting on punctuation (e.g. "spec.md" → "spec" + "md")
    const escaped = '"' + query.replace(/"/g, '""') + '"';
    // FTS5 column filter: prefix with "title:" to restrict match to title column
    const match = titleOnly ? 'title:' + escaped : escaped;
    return stmts.searchQuery.all(type, match, limit);
  } catch {
    return [];
  }
}

function isSearchIndexPopulated() {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM search_map WHERE type = ?').get('session');
  return row.cnt > 0;
}

// --- Project git cache ---

// Lazy-initialized so the table is guaranteed to exist (migration runs first).
let _pgc = null;
function pgc() {
  if (_pgc) return _pgc;
  _pgc = {
    get: db.prepare('SELECT * FROM project_git_cache WHERE projectPath = ?'),
    getAll: db.prepare('SELECT projectPath, unpushedCount FROM project_git_cache'),
    // changedCount stays on its DEFAULT 0: nothing ever read it.
    upsert: db.prepare(`
      INSERT INTO project_git_cache
        (projectPath, branch, upstream, remoteUrl, tags, unpushedCount, totalAdded, totalDeleted, containers, unpushedCommits, changedFiles, commits, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(projectPath) DO UPDATE SET
        branch = excluded.branch,
        upstream = excluded.upstream,
        remoteUrl = excluded.remoteUrl,
        tags = excluded.tags,
        unpushedCount = excluded.unpushedCount,
        totalAdded = excluded.totalAdded,
        totalDeleted = excluded.totalDeleted,
        containers = excluded.containers,
        unpushedCommits = excluded.unpushedCommits,
        changedFiles = excluded.changedFiles,
        commits = excluded.commits,
        updatedAt = excluded.updatedAt
    `),
  };
  return _pgc;
}

function getProjectGitCache(projectPath) {
  const row = pgc().get.get(projectPath);
  if (!row) return null;
  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    containers: JSON.parse(row.containers || '[]'),
    unpushedCommits: JSON.parse(row.unpushedCommits || '[]'),
    changedFiles: JSON.parse(row.changedFiles || '[]'),
    commits: JSON.parse(row.commits || '[]'),
  };
}

function setProjectGitCache(projectPath, data) {
  pgc().upsert.run(
    projectPath,
    data.branch || null,
    data.upstream || null,
    data.remoteUrl || null,
    JSON.stringify(data.tags || []),
    data.unpushedCommits?.length || 0,
    data.totalAdded || 0,
    data.totalDeleted || 0,
    JSON.stringify(data.containers || []),
    JSON.stringify(data.unpushedCommits || []),
    JSON.stringify(data.changedFiles || []),
    JSON.stringify(data.commits || []),
    Date.now(),
  );
}

function getAllProjectGitCounts() {
  const rows = pgc().getAll.all();
  const map = new Map();
  for (const r of rows) map.set(r.projectPath, { unpushedCount: r.unpushedCount });
  return map;
}

// --- Project avatar ---

let _pa = null;
function pa() {
  if (_pa) return _pa;
  _pa = {
    get: db.prepare('SELECT avatarData, mimeType FROM project_avatars WHERE projectPath = ?'),
    upsert: db.prepare(`
      INSERT INTO project_avatars (projectPath, avatarData, mimeType, fetchedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(projectPath) DO UPDATE SET
        avatarData = excluded.avatarData,
        mimeType = excluded.mimeType,
        fetchedAt = excluded.fetchedAt
    `),
    del: db.prepare('DELETE FROM project_avatars WHERE projectPath = ?'),
  };
  return _pa;
}

function getStoredAvatar(projectPath) {
  const row = pa().get.get(projectPath);
  if (!row || !row.avatarData) return null;
  return { avatarData: row.avatarData, mimeType: row.mimeType || 'image/png' };
}

function setStoredAvatar(projectPath, avatarData, mimeType) {
  if (!avatarData) {
    pa().del.run(projectPath);
  } else {
    pa().upsert.run(projectPath, avatarData, mimeType || 'image/png', Date.now());
  }
}

// --- Area avatar ---
// Mirrors project avatars, keyed by Area id. Kept in its own table (area_avatars) so reading the
// Area tree never carries image bytes (VIN-82).

let _aa = null;
function aa() {
  if (_aa) return _aa;
  _aa = {
    get: db.prepare('SELECT avatarData, mimeType FROM area_avatars WHERE areaId = ?'),
    upsert: db.prepare(`
      INSERT INTO area_avatars (areaId, avatarData, mimeType, fetchedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(areaId) DO UPDATE SET
        avatarData = excluded.avatarData,
        mimeType = excluded.mimeType,
        fetchedAt = excluded.fetchedAt
    `),
    del: db.prepare('DELETE FROM area_avatars WHERE areaId = ?'),
  };
  return _aa;
}

function getAreaAvatar(areaId) {
  const row = aa().get.get(areaId);
  if (!row || !row.avatarData) return null;
  return { avatarData: row.avatarData, mimeType: row.mimeType || 'image/png' };
}

function setAreaAvatar(areaId, avatarData, mimeType) {
  if (!avatarData) {
    aa().del.run(areaId);
  } else {
    aa().upsert.run(areaId, avatarData, mimeType || 'image/png', Date.now());
  }
}

// --- Areas ---
// Lazy-initialized so the tables are guaranteed to exist (migration runs first).

let _ar = null;
function ar() {
  if (_ar) return _ar;
  _ar = {
    all: db.prepare('SELECT id, name, parentId, position, collapsed FROM areas'),
    insert: db.prepare('INSERT INTO areas (id, name, parentId, position, collapsed, createdAt) VALUES (?, ?, ?, ?, 0, ?)'),
    nextPosition: db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM areas WHERE parentId IS ?'),
    rename: db.prepare('UPDATE areas SET name = ? WHERE id = ?'),
    setCollapsed: db.prepare('UPDATE areas SET collapsed = ? WHERE id = ?'),
    assignments: db.prepare('SELECT projectPath, areaId FROM project_area'),
    byId: db.prepare('SELECT parentId FROM areas WHERE id = ?'),
    reparentChildren: db.prepare('UPDATE areas SET parentId = ?, position = position + ? WHERE parentId = ?'),
    reassignProjects: db.prepare('UPDATE project_area SET areaId = ? WHERE areaId = ?'),
    dropAssignments: db.prepare('DELETE FROM project_area WHERE areaId = ?'),
    deleteAvatar: db.prepare('DELETE FROM area_avatars WHERE areaId = ?'),
    del: db.prepare('DELETE FROM areas WHERE id = ?'),
    reparent: db.prepare('UPDATE areas SET parentId = ?, position = ? WHERE id = ?'),
    assignProject: db.prepare('INSERT INTO project_area (projectPath, areaId) VALUES (?, ?) ON CONFLICT(projectPath) DO UPDATE SET areaId = excluded.areaId'),
    unassignProject: db.prepare('DELETE FROM project_area WHERE projectPath = ?'),
  };
  return _ar;
}

function getAreas() {
  return ar().all.all();
}

function getAreaAssignments() {
  return ar().assignments.all();
}

function createArea(id, name, parentId = null) {
  const position = ar().nextPosition.get(parentId ?? null).pos;
  ar().insert.run(id, name, parentId ?? null, position, Date.now());
  return { id, name, parentId: parentId ?? null, position, collapsed: 0 };
}

function renameArea(id, name) {
  ar().rename.run(name, id);
}

// Only Areas persist their collapsed state; Projects deliberately do not.
function setAreaCollapsed(id, collapsed) {
  ar().setCollapsed.run(collapsed ? 1 : 0, id);
}

// Deleting an Area re-parents its children one level up in the same transaction; nothing cascades
// (VIN-81). Sub-Areas move to the deleted Area's parent (or the root), appended after that
// parent's existing sub-Areas. Projects follow: re-filed into the parent Area, or unfiled when
// the parent is the root, since a root Project has no Area. The Area and its avatar then go.
function deleteArea(id) {
  const a = ar();
  const row = a.byId.get(id);
  if (!row) return { ok: false };
  const newParent = row.parentId ?? null;
  const base = a.nextPosition.get(newParent).pos;
  db.transaction(() => {
    a.reparentChildren.run(newParent, base, id);
    if (newParent === null) a.dropAssignments.run(id);
    else a.reassignProjects.run(newParent, id);
    a.deleteAvatar.run(id);
    a.del.run(id);
  })();
  return { ok: true, parentId: newParent };
}

// Would making `id` a child of `newParentId` form a cycle? True if the new parent is the Area
// itself or already sits below it. Walks the parent chain up from newParentId; a bounded guard
// counter keeps a pre-existing corrupt chain from looping forever.
function wouldCycleArea(id, newParentId) {
  let cursor = newParentId ?? null;
  let guard = 0;
  while (cursor != null && guard++ < 10000) {
    if (cursor === id) return true;
    cursor = ar().byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

// Re-parent an Area by drag and drop (VIN-78). The target parent (null = root) is decided in
// src/vue/area-tree.mjs, and the cycle guard is re-checked here — the renderer is not trusted.
// The Area is appended after the new parent's existing sub-Areas, matching createArea's ordering.
function moveArea(id, newParentId) {
  const a = ar();
  const parent = newParentId ?? null;
  if (!a.byId.get(id)) return { ok: false };
  if (parent != null && !a.byId.get(parent)) return { ok: false };
  if (wouldCycleArea(id, parent)) return { ok: false, reason: 'cycle' };
  const position = a.nextPosition.get(parent).pos;
  a.reparent.run(parent, position, id);
  return { ok: true, parentId: parent, position };
}

// File or unfile a Project by drag and drop (VIN-78). A Project lives in exactly one Area, so
// assignment is an upsert keyed by path; a null Area unfiles it (drops the assignment row).
function fileProject(projectPath, areaId) {
  if (areaId == null) ar().unassignProject.run(projectPath);
  else ar().assignProject.run(projectPath, areaId);
  return { ok: true, projectPath, areaId: areaId ?? null };
}

// --- Settings functions ---

function getSetting(key) {
  const row = stmts.settingsGet.get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function setSetting(key, value) {
  stmts.settingsUpsert.run(key, JSON.stringify(value));
}

function deleteSetting(key) {
  stmts.settingsDelete.run(key);
}

function closeDb() {
  try { db.close(); } catch {}
}

module.exports = {
  getMeta, getAllMeta, setName, toggleStar, setArchived,
  isCachePopulated, getAllCached, getCachedByFolder, getCachedFolder, getCachedSession, upsertCachedSessions,
  deleteCachedSession, deleteCachedFolder,
  getFolderMeta, getAllFolderMeta, setFolderMeta,
  getProjectGitCache, setProjectGitCache, getAllProjectGitCounts,
  upsertSearchEntries, updateSearchTitle, deleteSearchSession, deleteSearchFolder, deleteSearchType,
  searchByType, isSearchIndexPopulated, searchFtsRecreated,
  getSetting, setSetting, deleteSetting,
  getStoredAvatar, setStoredAvatar,
  getAreaAvatar, setAreaAvatar,
  getAreas, getAreaAssignments, createArea, renameArea, setAreaCollapsed, deleteArea,
  moveArea, fileProject,
  closeDb,
};
