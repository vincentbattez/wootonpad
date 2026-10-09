const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const { getFolderIndexMtimeMs } = require('./folder-index-state');
const { deriveProjectPath } = require('./derive-project-path');
const { readSessionFile } = require('./read-session-file');
const { encodeProjectPath } = require('./encode-project-path');
const { resolveSessionTitle, resolveSessionSearchTitle } = require('./session-title');
const { localSourceFromCtx } = require('./session-source');

/**
 * Session cache module.
 *
 * The cache indexes a set of Sources (see session-source.js) side by side, not a
 * single projects directory. Call init(ctx) once with the shared context object:
 * it binds the database and registers the Local Host's active Account as the one
 * source. Remote Hosts register further sources at runtime (VIN-150); each is
 * refreshed (refreshFolder / populateCacheViaWorker per source) and evicted
 * (unregisterSource) independently, and folders of the same name on different
 * sources never collide because every database identifier is qualified through
 * its source.
 *
 * Per-source *watching* is not wired here. main.js runs a single filesystem
 * watcher over the Local Host's projects directory and passes localSource()
 * explicitly to the per-folder functions; driving a watcher per registered
 * source belongs to the VIN-150 integration that introduces Remote Host mirrors
 * and their sync, and is deliberately deferred to it. Until then no Source but
 * the local one is registered, so nothing is left unwatched in this branch.
 */
let activeSessions, getMainWindow, log;
let deleteCachedFolder, getCachedByFolder, upsertCachedSessions, deleteCachedSession;
let deleteSearchFolder, deleteSearchSession, upsertSearchEntries;
let setFolderMeta, getAllFolderMeta, getAllMeta, getAllCached, getSetting, getMeta, setName, getAllProjectGitCounts;

// The registered Sources, keyed by id, and the id of the Local Host's source.
// The per-folder functions all take their source explicitly; localSource() is
// how the single local watcher in main.js names it.
const sources = new Map();
let localSourceId = null;

function init(ctx) {
  activeSessions = ctx.activeSessions;
  getMainWindow = ctx.getMainWindow;
  log = ctx.log;
  // DB functions
  deleteCachedFolder = ctx.db.deleteCachedFolder;
  getCachedByFolder = ctx.db.getCachedByFolder;
  upsertCachedSessions = ctx.db.upsertCachedSessions;
  deleteCachedSession = ctx.db.deleteCachedSession;
  deleteSearchFolder = ctx.db.deleteSearchFolder;
  deleteSearchSession = ctx.db.deleteSearchSession;
  upsertSearchEntries = ctx.db.upsertSearchEntries;
  setFolderMeta = ctx.db.setFolderMeta;
  getAllFolderMeta = ctx.db.getAllFolderMeta;
  getAllMeta = ctx.db.getAllMeta;
  getAllCached = ctx.db.getAllCached;
  getSetting = ctx.db.getSetting;
  getMeta = ctx.db.getMeta;
  setName = ctx.db.setName;
  getAllProjectGitCounts = ctx.db.getAllProjectGitCounts;

  // Re-point at the active Account: drop any previously registered sources and
  // register the Local Host's one. Identity qualifiers keep local behaviour and
  // persisted local rows unchanged.
  sources.clear();
  const local = localSourceFromCtx(ctx);
  localSourceId = local.id;
  sources.set(local.id, local);
}

// --- Source registry ---

function registerSource(source) {
  sources.set(source.id, source);
  return source;
}

function getSource(id) {
  return sources.get(id) || null;
}

function getSources() {
  return [...sources.values()];
}

function localSource() {
  return sources.get(localSourceId) || null;
}

/** Raised when a source id names no registered source. */
class UnknownSourceError extends Error {
  constructor(id) {
    super(`Unknown source: ${id}`);
    this.name = 'UnknownSourceError';
    this.sourceId = id;
  }
}

/**
 * Resolve a source argument: a Source or a source id. The source is required —
 * there is no undefined→local default, so a caller that forgets it fails loudly
 * rather than silently scanning or evicting the local source. The result is
 * dereferenced straight away (source.projectsDir, …), so an id that names no
 * registered source throws here with a clear message rather than NPE-ing
 * downstream with an opaque TypeError.
 */
function resolveSource(sourceOrId) {
  if (!sourceOrId) throw new Error('resolveSource: a source is required');
  if (typeof sourceOrId === 'string') {
    const source = sources.get(sourceOrId);
    if (!source) throw new UnknownSourceError(sourceOrId);
    return source;
  }
  return sourceOrId;
}

/** Remove a source and evict everything it put in the cache, search and meta. */
function unregisterSource(id) {
  const source = sources.get(id);
  if (!source) return;
  // Drop it from the registry first, then cancel any in-flight scan: a late
  // worker message checks the registry and bails rather than resurrecting rows
  // evictSource is about to delete.
  sources.delete(id);
  cancelScan(id);
  evictSource(source);
}

function evictSource(source) {
  const folders = new Set();
  for (const row of getAllCached(source.accountId)) {
    if (source.ownsFolder(row.folder)) folders.add(row.folder);
  }
  for (const folderKey of getAllFolderMeta().keys()) {
    if (source.ownsFolder(folderKey)) folders.add(folderKey);
  }
  for (const folderKey of folders) {
    deleteCachedFolder(folderKey, source.accountId); // also drops cache_meta
    deleteSearchFolder(folderKey);
  }
}

// readSessionFile is imported from read-session-file.js (shared with worker)

/** Parse the cached contextUsage JSON blob back into the four-counter object, or null. */
function parseContextUsage(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Read one folder from filesystem by scanning .jsonl files directly */
function readFolderFromFilesystem(folder, sourceOrId) {
  const source = resolveSource(sourceOrId);
  const folderPath = path.join(source.projectsDir, folder);
  const rawProjectPath = deriveProjectPath(folderPath, folder);
  if (!rawProjectPath) return { projectPath: null, sessions: [] };
  const projectPath = source.qualifyProjectPath(rawProjectPath);
  const folderKey = source.qualifyFolder(folder);
  const sessions = [];

  try {
    const jsonlFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl'));
    for (const file of jsonlFiles) {
      const s = readSessionFile(path.join(folderPath, file), folderKey, projectPath);
      if (s) sessions.push(s);
    }
  } catch {}

  return { projectPath, sessions };
}

/** Refresh a single folder incrementally: only re-read changed/new .jsonl files */
function refreshFolder(folder, sourceOrId) {
  const source = resolveSource(sourceOrId);
  const accountId = source.accountId;
  const folderKey = source.qualifyFolder(folder);
  const folderPath = path.join(source.projectsDir, folder);
  if (!fs.existsSync(folderPath)) {
    deleteCachedFolder(folderKey, accountId);
    return;
  }

  const rawProjectPath = deriveProjectPath(folderPath, folder);
  if (!rawProjectPath) {
    setFolderMeta(folderKey, null, getFolderIndexMtimeMs(folderPath));
    return;
  }
  const projectPath = source.qualifyProjectPath(rawProjectPath);

  // Get what's currently cached for this folder
  const cachedSessions = getCachedByFolder(folderKey, accountId);
  const cachedMap = new Map(); // sessionId → modified ISO string
  for (const row of cachedSessions) {
    cachedMap.set(row.sessionId, row.modified);
  }

  // Scan current .jsonl files
  let jsonlFiles;
  try {
    jsonlFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl'));
  } catch { return; }

  const currentIds = new Set();
  let changed = false;

  // Collect all changes first, then batch DB writes to minimize lock duration
  const sessionsToUpsert = [];
  const searchEntriesToUpsert = [];
  const namesToSet = [];
  const sessionsToDelete = [];

  for (const file of jsonlFiles) {
    const filePath = path.join(folderPath, file);
    const sessionId = path.basename(file, '.jsonl');
    currentIds.add(sessionId);

    // Check if file mtime changed
    let fileMtime;
    try { fileMtime = fs.statSync(filePath).mtime.toISOString(); } catch { continue; }

    if (cachedMap.has(sessionId) && cachedMap.get(sessionId) === fileMtime) {
      continue; // unchanged, skip
    }

    // File is new or modified — re-read it
    const s = readSessionFile(filePath, folderKey, projectPath);
    if (s) {
      sessionsToUpsert.push(s);
      // Title precedence lives in session-title.js. Only customTitle (Claude /title) promotes to
      // session_meta.name — AI titles stay in session_cache.aiTitle and are preserved once written
      // (COALESCE in the upsert).
      const existingName = getMeta(s.sessionId)?.name;
      if (!existingName && s.customTitle) namesToSet.push({ id: s.sessionId, name: s.customTitle });
      searchEntriesToUpsert.push({
        id: s.sessionId, type: 'session', folder: s.folder,
        title: resolveSessionSearchTitle({ ...s, name: existingName }), body: s.textContent,
      });
    }
    changed = true;
  }

  // Remove sessions whose .jsonl files were deleted
  for (const sessionId of cachedMap.keys()) {
    if (!currentIds.has(sessionId)) {
      sessionsToDelete.push(sessionId);
      changed = true;
    }
  }

  // Batch all DB writes to reduce lock contention
  if (sessionsToUpsert.length > 0) {
    upsertCachedSessions(sessionsToUpsert, accountId);
  }
  for (const entry of searchEntriesToUpsert) {
    deleteSearchSession(entry.id);
  }
  if (searchEntriesToUpsert.length > 0) {
    upsertSearchEntries(searchEntriesToUpsert);
  }
  for (const { id, name } of namesToSet) {
    setName(id, name);
  }
  for (const sessionId of sessionsToDelete) {
    deleteCachedSession(sessionId);
    deleteSearchSession(sessionId);
  }

  // Update folder mtime
  setFolderMeta(folderKey, projectPath, getFolderIndexMtimeMs(folderPath));
}

/** Populate entire cache from filesystem (cold start), for one source */
function populateCacheFromFilesystem(sourceOrId) {
  const source = resolveSource(sourceOrId);
  try {
    const folders = fs.readdirSync(source.projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.git')
      .map(d => d.name);

    for (const folder of folders) {
      refreshFolder(folder, source);
    }
  } catch (err) {
    console.error('Error populating cache:', err);
  }
}

// The capabilities a Remote Project declares (ADR 0014 spirit): Sessions are listed and their
// JSONL is readable from the mirror, but nothing else is wired yet. The renderer hides what is not
// declared — no Run, External IDE, Project Folder or Project Viewer button. A local Project carries
// no gate; the renderer treats an absent capability as allowed, so local behaviour is unchanged.
function remoteProjectCapabilities() {
  return { run: false, externalIde: false, projectFolder: false, projectViewer: false };
}

// A fresh sidebar Project group, carrying the Host facts of the Source it came from so the renderer
// can draw the remote icon (hostId), hide unsupported buttons (capabilities) and — once the payload
// is annotated with the Host store — grey it when Unreachable. A local Source leaves `remote` false
// and `hostId` null, so every persisted local row renders exactly as before.
function newProjectGroup(projectPath, source) {
  const remote = !!(source && source.hostId);
  return {
    folder: encodeProjectPath(projectPath),
    projectPath,
    sessions: [],
    remote,
    hostId: (source && source.hostId) || null,
    capabilities: remote ? remoteProjectCapabilities() : null,
  };
}

/** The registered source that owns a database folder key (ssh://… remote, bare local), or null. */
function sourceForFolder(folderKey) {
  for (const source of sources.values()) {
    if (source.ownsFolder(folderKey)) return source;
  }
  return null;
}

/**
 * The on-disk directory a folder key's `.jsonl` files live in: the mirror for a Remote Host,
 * the local projects dir for the Local Host. Lets a reader (the JSONL viewer) reach a remote
 * Session's transcript off the mirror instead of the local Account's dir. Falls back to the local
 * source for an unqualified key whose source is gone, so local reads never break.
 */
function folderDiskPath(folderKey) {
  const source = sourceForFolder(folderKey) || localSource();
  if (!source) return null;
  return path.join(source.projectsDir, source.rawFolder(folderKey));
}

/** Build projects response from cached data, unioning every registered source */
function buildProjectsFromCache() {
  const metaMap = getAllMeta();
  const global = getSetting('global') || {};
  const hiddenProjects = new Set(global.hiddenProjects || []);
  const gitCounts = getAllProjectGitCounts?.() || new Map();
  const folderMeta = getAllFolderMeta();

  // Group by projectPath, not on-disk folder name. Multiple ~/.claude/projects/<folder>/
  // directories can resolve to the same projectPath (Claude Code's folder-name encoding
  // scheme has changed over time, leaving legacy stragglers around), so we merge them into
  // a single sidebar group to avoid duplicate-id collisions in the morphdom render. The
  // projectPath is already qualified per source (identity locally, ssh://<hostId>/… for a
  // Remote Host), so the same path on two Hosts stays two Projects.
  // Archived Sessions ship in the payload: each Project group reveals its own archive
  // (ADR 0005), so a fully-archived Project stays browsable in the sidebar.
  const projectMap = new Map();
  for (const source of sources.values()) {
    for (const row of getAllCached(source.accountId)) {
      if (!source.ownsFolder(row.folder)) continue;
      if (!row.projectPath) continue;
      if (hiddenProjects.has(row.projectPath)) continue;
      const meta = metaMap.get(row.sessionId);
      const s = {
        sessionId: row.sessionId,
        summary: row.summary,
        firstPrompt: row.firstPrompt,
        created: row.created,
        modified: row.modified,
        messageCount: row.messageCount,
        projectPath: row.projectPath,
        slug: row.slug || null,
        aiTitle: row.aiTitle || null,
        name: meta?.name || null,
        starred: meta?.starred || 0,
        archived: meta?.archived || 0,
        // Declared, never inferred (ADR 0015) — user data, carried like starred and archived.
        done: meta?.done || 0,
        accountId: row.accountId || 'default',
        // Context gauge (VIN-143): the last assistant turn's usage breakdown and model,
        // a property of the Session so every row carries it, running or not.
        contextUsage: parseContextUsage(row.contextUsage),
        contextModel: row.contextModel || null,
      };
      s.title = resolveSessionTitle(s);
      if (!projectMap.has(row.projectPath)) {
        projectMap.set(row.projectPath, newProjectGroup(row.projectPath, source));
      }
      projectMap.get(row.projectPath).sessions.push(s);
    }
  }

  // Include empty project directories (no sessions yet). Resolve folder→projectPath
  // through cache_meta (populated by the indexer) instead of re-reading a JSONL off
  // disk for every directory on every render. Fall back to deriveProjectPath only
  // for folders the indexer hasn't seen yet, and backfill cache_meta so subsequent
  // renders are pure DB reads. Done per source so an empty folder is attributed to
  // the Host it lives on.
  for (const source of sources.values()) {
    try {
      const dirs = fs.readdirSync(source.projectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== '.git');
      for (const d of dirs) {
        const folderKey = source.qualifyFolder(d.name);
        let projectPath = folderMeta.get(folderKey)?.projectPath;
        if (!projectPath) {
          const raw = deriveProjectPath(path.join(source.projectsDir, d.name), d.name);
          projectPath = raw ? source.qualifyProjectPath(raw) : null;
          if (projectPath) setFolderMeta(folderKey, projectPath, 0);
        }
        if (!projectPath) continue;
        if (hiddenProjects.has(projectPath)) continue;
        if (!projectMap.has(projectPath)) {
          projectMap.set(projectPath, newProjectGroup(projectPath, source));
        }
      }
    } catch {}
  }

  // Inject active plain terminal sessions so they participate in sorting
  for (const [sessionId, session] of activeSessions) {
    if (session.exited || !session.isPlainTerminal) continue;
    if (!session.projectPath) continue;
    if (hiddenProjects.has(session.projectPath)) continue;
    if (!projectMap.has(session.projectPath)) {
      // A Plain Terminal runs on this machine, so it belongs to the Local Host.
      projectMap.set(session.projectPath, newProjectGroup(session.projectPath, localSource()));
    }
    const proj = projectMap.get(session.projectPath);
    if (!proj.sessions.some(s => s.sessionId === sessionId)) {
      const synthetic = {
        sessionId, summary: 'Terminal', firstPrompt: '', projectPath: session.projectPath,
        name: null, starred: 0, archived: 0, messageCount: 0,
        modified: new Date(session._openedAt).toISOString(),
        created: new Date(session._openedAt).toISOString(),
        type: 'terminal',
      };
      synthetic.title = resolveSessionTitle(synthetic);
      proj.sessions.push(synthetic);
    }
  }

  const projects = [];
  for (const proj of projectMap.values()) {
    proj.sessions.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    const gc = gitCounts.get(proj.projectPath);
    if (gc) proj.unpushedCount = gc.unpushedCount || 0;
    // Cosmetic only: the sidebar label. projectPath stays the canonical key.
    const displayName = getSetting('project:' + proj.projectPath)?.displayName;
    if (displayName) proj.displayName = displayName;
    projects.push(proj);
  }

  projects.sort((a, b) => {
    // Empty projects go to the bottom
    if (a.sessions.length === 0 && b.sessions.length > 0) return 1;
    if (b.sessions.length === 0 && a.sessions.length > 0) return -1;
    // Split on both separators: a projectPath may be POSIX or Windows-shaped.
    const aName = a.projectPath.split(/[\\/]/).filter(Boolean).pop() || a.projectPath;
    const bName = b.projectPath.split(/[\\/]/).filter(Boolean).pop() || b.projectPath;
    return aName.localeCompare(bName);
  });

  return projects;
}


function notifyRendererProjectsChanged() {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('projects-changed');
  }
}

function sendStatus(text, type) {
  if (text) log.info(`[status] (${type || 'info'}) ${text}`);
  const mw = getMainWindow();
  if (mw && !mw.isDestroyed()) {
    mw.webContents.send('status-update', text, type || 'info');
  }
}

// --- Worker-based cache population (non-blocking) ---
// One in-flight scan per source, so Remote Hosts refresh without blocking local.
const populatingSources = new Set();
// The live Worker for each in-flight scan, so an unregister can cancel it.
const sourceWorkers = new Map();

/**
 * Stop an in-flight scan for a source. Without this, a source unregistered
 * mid-scan would have the worker's later `message` write qualified rows and
 * folder-meta back into the DB — a resurrection eviction can't catch.
 */
function cancelScan(id) {
  const worker = sourceWorkers.get(id);
  if (worker) worker.terminate();
  sourceWorkers.delete(id);
  populatingSources.delete(id);
}

/** Scan one source on a worker thread. The source is required (see resolveSource). */
function populateCacheViaWorker(sourceOrId) {
  populateSourceViaWorker(resolveSource(sourceOrId));
}

/** Scan every registered source — the cold-start / full re-index fan-out. */
function populateAllSourcesViaWorker() {
  for (const source of getSources()) populateSourceViaWorker(source);
}

function populateSourceViaWorker(source) {
  if (populatingSources.has(source.id)) return;
  populatingSources.add(source.id);
  sendStatus('Scanning projects…', 'active');

  const worker = new Worker(path.join(__dirname, 'workers', 'scan-projects.js'), {
    workerData: { projectsDir: source.projectsDir, accountId: source.accountId },
  });
  sourceWorkers.set(source.id, worker);

  worker.on('message', (msg) => {
    // Progress updates from worker
    if (msg.type === 'progress') {
      sendStatus(msg.text, 'active');
      return;
    }

    // The source was unregistered while this scan was running: its rows have
    // already been evicted, so writing these results back would resurrect them.
    if (!sources.has(source.id)) {
      populatingSources.delete(source.id);
      sourceWorkers.delete(source.id);
      return;
    }

    if (!msg.ok) {
      console.error('Worker scan error:', msg.error);
      sendStatus('Scan failed: ' + msg.error, 'error');
      populatingSources.delete(source.id);
      sourceWorkers.delete(source.id);
      return;
    }

    sendStatus(`Indexing ${msg.results.length} projects…`, 'active');

    // Write results to DB on main thread (fast). The worker returns raw folder
    // names and cwds; qualify them through the source before they touch the DB.
    let sessionCount = 0;
    for (const { folder, projectPath: rawProjectPath, sessions, indexMtimeMs } of msg.results) {
      const folderKey = source.qualifyFolder(folder);
      const projectPath = source.qualifyProjectPath(rawProjectPath);
      deleteCachedFolder(folderKey, source.accountId);
      deleteSearchFolder(folderKey);
      if (sessions.length > 0) {
        sessionCount += sessions.length;
        const qualified = sessions.map(s => ({ ...s, folder: folderKey, projectPath }));
        upsertCachedSessions(qualified, source.accountId);
        for (const s of qualified) {
          // Only JSONL custom-title (genuine user title) promotes to the DB name column,
          // and only when no manual sidebar rename already exists — a manual rename must
          // survive the v10 migration re-index. Matches the refreshFolder guard above.
          // AI titles must not promote — see refreshFolder for the rationale.
          if (!getMeta(s.sessionId)?.name && s.customTitle) setName(s.sessionId, s.customTitle);
        }
        upsertSearchEntries(qualified.map(s => ({
          id: s.sessionId, type: 'session', folder: folderKey,
          title: resolveSessionSearchTitle({ ...s, name: getMeta(s.sessionId)?.name }),
          body: s.textContent,
        })));
      }
      setFolderMeta(folderKey, projectPath, indexMtimeMs);
    }

    populatingSources.delete(source.id);
    sourceWorkers.delete(source.id);
    sendStatus(`Indexed ${sessionCount} sessions across ${msg.results.length} projects`, 'done');
    // Clear status after a few seconds
    setTimeout(() => sendStatus(''), 5000);
    notifyRendererProjectsChanged();
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
    sendStatus('Worker error: ' + err.message, 'error');
    populatingSources.delete(source.id);
    sourceWorkers.delete(source.id);
  });

  // If the worker exits abnormally (SIGSEGV, OOM, uncaught exception) without
  // sending a message, neither the 'message' nor 'error' handler will fire.
  // Reset the flag here to prevent a permanent lockout where the session list
  // stays empty because populateCacheViaWorker() returns immediately.
  worker.on('exit', (code) => {
    sourceWorkers.delete(source.id);
    if (populatingSources.has(source.id)) {
      populatingSources.delete(source.id);
      if (code !== 0) {
        sendStatus('Scan worker exited unexpectedly', 'error');
      }
    }
  });
}

module.exports = {
  init,
  registerSource,
  unregisterSource,
  getSource,
  getSources,
  localSource,
  sourceForFolder,
  folderDiskPath,
  UnknownSourceError,
  readSessionFile,
  readFolderFromFilesystem,
  refreshFolder,
  populateCacheFromFilesystem,
  buildProjectsFromCache,
  notifyRendererProjectsChanged,
  sendStatus,
  populateCacheViaWorker,
  populateAllSourcesViaWorker,
};
