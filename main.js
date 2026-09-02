const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, screen, shell } = require('electron');
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');

if (!app.isPackaged) {
  const origUserData = app.getPath('userData');
  const devUserData = origUserData + '-dev';
  if (!fs.existsSync(devUserData) && fs.existsSync(origUserData)) {
    fs.cpSync(origUserData, devUserData, {
      recursive: true,
      filter: (src) => !/(SingletonLock|SingletonSocket|SingletonCookie)$/.test(src),
    });
  } else if (!fs.existsSync(devUserData)) {
    fs.mkdirSync(devUserData, { recursive: true });
  }
  app.setPath('userData', devUserData);
}

const log = require('electron-log');
// getFolderIndexMtimeMs moved to session-cache.js
const { startMcpServer, shutdownMcpServer, shutdownAll: shutdownAllMcp, resolvePendingDiff, rekeyMcpServer, cleanStaleLockFiles } = require('./mcp-bridge');
const { fetchAndTransformUsage } = require('./claude-auth');
const { resolveAppearance, APPEARANCE_DEFAULTS } = require('./appearance');
const { createProjectGit } = require('./project-git');
const { execFile } = require('child_process');

// A working diff can be large; the 1 MB default would truncate it into a parse error.
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
log.transports.file.level = app.isPackaged ? 'info' : 'debug';
log.transports.console.level = app.isPackaged ? 'info' : 'debug';

try { require('electron-reloader')(module, { watchRenderer: false }); } catch {};
try {
  const chokidar = require('chokidar');
  let _reloadTimer;
  chokidar.watch(['public/vue-bundle.js', 'public/style.css'], { ignoreInitial: true })
    .on('change', () => {
      clearTimeout(_reloadTimer);
      _reloadTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.reloadIgnoringCache();
        }
      }, 400);
    });
} catch {}

// Clean env for child processes — strip Electron internals that cause nested
// Electron apps (or node-pty inside them) to malfunction.
const cleanPtyEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    !k.startsWith('ELECTRON_') &&
    !k.startsWith('GOOGLE_API_KEY') &&
    k !== 'NODE_OPTIONS' &&
    k !== 'ORIGINAL_XDG_CURRENT_DESKTOP' &&
    k !== 'WT_SESSION'
  )
);

// Shell profiles → shell-profiles.js
const {
  discoverShellProfiles, getShellProfiles, resolveShell, isWindows, isWslShell,
  windowsToWslPath, shellArgs,
  wslToWindowsPath, isPosixAbsolutePath, probeWslClaudeHome, discoverWslClaudeHomes, wslExecArgs,
  withWslEnv, wslDistroFromUncPath, projectJoin,
} = require('./shell-profiles');
const { resolveIdeLaunch, launchErrorMessage } = require('./external-ide');
const { resolveRunTerminal, RUN_TERMINAL_TYPE } = require('./run-command');
const { startScheduler } = require('./schedule-runner');
const { encodeProjectPath } = require('./encode-project-path');
const { readSessionContextTail } = require('./read-session-file');



// --- Auto-updater (only in packaged builds) ---
let autoUpdater = null;
if (app.isPackaged || process.env.FORCE_UPDATER) {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;

  function sendUpdaterEvent(type, data) {
    log.info(`[updater] ${type}`, data || '');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-event', type, data);
    }
  }
  autoUpdater.on('checking-for-update', () => sendUpdaterEvent('checking'));
  autoUpdater.on('update-available', (info) => sendUpdaterEvent('update-available', info));
  autoUpdater.on('update-not-available', (info) => sendUpdaterEvent('update-not-available', info));
  autoUpdater.on('download-progress', (progress) => sendUpdaterEvent('download-progress', progress));
  autoUpdater.on('update-downloaded', (info) => sendUpdaterEvent('update-downloaded', info));
  autoUpdater.on('error', (err) => {
    log.error('[updater] Error:', err?.message || String(err));
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-event', 'error', { message: err?.message || String(err) });
    }
  });
}
const {
  getMeta, getAllMeta, toggleStar, setName, setArchived,
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
} = require('./db');

const DEFAULT_CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_DIR = DEFAULT_CLAUDE_DIR;
const STATS_CACHE_PATH = path.join(CLAUDE_DIR, 'stats-cache.json');
const MAX_BUFFER_SIZE = 256 * 1024;

// Terminal output is mostly redraw escapes; only the stripped text carries a message.
function stripAnsi(s) {
  return s
    .replace(/\x1b\[[^@-~]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[^[\]].?/g, '');
}

// --- Multi-account helpers ---

const DEFAULT_ACCOUNT = { id: 'default', name: 'Default', configDir: DEFAULT_CLAUDE_DIR };

function getAccounts() {
  const stored = getSetting('accounts');
  if (!Array.isArray(stored) || stored.length === 0) return [DEFAULT_ACCOUNT];
  // Always ensure default account is present
  if (!stored.find(a => a.id === 'default')) return [DEFAULT_ACCOUNT, ...stored];
  return stored;
}

function getActiveAccount() {
  const global = getSetting('global') || {};
  const activeId = global.activeAccountId || 'default';
  return getAccounts().find(a => a.id === activeId) || DEFAULT_ACCOUNT;
}

function getProjectsDir(account) {
  return path.join(account.configDir, 'projects');
}

// Convenience: current active projects dir
function activeProjectsDir() {
  return getProjectsDir(getActiveAccount());
}

function activeConfigDir() {
  return getActiveAccount().configDir;
}

// Plans live next to the sessions they came from, so they follow the account
// rather than the Windows home.
function activePlansDir() {
  return path.join(activeConfigDir(), 'plans');
}

// --- WSL-backed accounts ---
// An account carrying `wslDistro` points at a Claude home living inside that
// distribution. Its project paths stay in POSIX form (that is what Claude wrote
// into the .jsonl files, and what the project folder name encodes from), so
// every Windows fs call goes through hostPath() and every command that has to
// run *in* the project goes through projectExecFile() — where its git, docker
// and toolchain actually are. On accounts without the field both are identity.

function accountWslDistro(account) {
  return (account && account.wslDistro) || null;
}

function activeWslDistro() {
  return accountWslDistro(getActiveAccount());
}

// Translate a canonical project path into one a Windows fs call can open.
// Identity on any account without a distribution, and on paths that are
// already Windows-shaped — so it is safe to wrap every fs call with it.
function accountHostPath(account, p) {
  if (!accountWslDistro(account) || !isPosixAbsolutePath(p)) return p;
  return wslToWindowsPath(p, account.wslDistro, account.wslUncPrefix);
}

// Request-scoped: the account is read per call, which is right for anything
// driven by the UI. Work that outlives the current selection — a running
// session pushing diffs at us — must bind accountHostPath to its own account
// instead, or an account switch would retarget it mid-session.
function hostPath(p) {
  return accountHostPath(getActiveAccount(), p);
}

// A Windows folder picker returns \\wsl.localhost\<distro>\… for a directory
// inside a distribution. Claude records the POSIX path and the project folder
// name is encoded from it, so that is the form the app stores.
function canonicalProjectPath(p) {
  return wslDistroFromUncPath(p) ? windowsToWslPath(p) : p;
}

// Run argv in `cwd`. For a WSL account this re-targets the call into the
// distribution instead of running it on the Windows side over the 9p share.
// `cwd` and any caller-supplied `env` are dropped when redirecting: both hold
// Windows-side values that mean nothing inside the distribution, which resolves
// the working directory via --cd and the command via the distro's own PATH.
// Returns [file, args, options] for execFile/execFileSync.
function projectExecFile(argv, cwd, options = {}) {
  const distro = activeWslDistro();
  if (!distro || !isPosixAbsolutePath(cwd)) {
    return [argv[0], argv.slice(1), { ...options, cwd }];
  }
  const { cwd: _cwd, env: _env, ...rest } = options;
  return ['wsl.exe', wslExecArgs(distro, cwd, argv), rest];
}

// projectExecFile decides where git runs — inside the distribution for a WSL-backed account.
const projectGit = createProjectGit({
  run: (argv, cwd, { timeout } = {}) => new Promise(resolve => {
    const [file, args, options] = projectExecFile(['git', ...argv], cwd, {
      encoding: 'utf8', timeout, maxBuffer: GIT_MAX_BUFFER,
    });
    execFile(file, args, options, (err, stdout, stderr) => {
      resolve({
        // A timeout kills the child without an exit code; git's own codes are numbers.
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        stdout,
        // A spawn failure or timeout prints no stderr; its message is all the user gets.
        stderr: stderr || (err ? err.message : ''),
      });
    });
  }),
});

// Build stats in the same format as stats-cache.json using Switchboard's own DB.
// This ensures all accounts see charts even before running `claude /stats`.
function computeStatsFromDb(accountId) {
  const sessions = getAllCached(accountId);
  const dailyMap = {};
  let totalMessages = 0;
  for (const s of sessions) {
    const date = (s.modified || s.created || '').slice(0, 10);
    if (!date || date < '2020-01-01') continue;
    if (!dailyMap[date]) dailyMap[date] = { date, messageCount: 0, toolCallCount: 0 };
    const mc = s.messageCount || 0;
    dailyMap[date].messageCount += mc;
    totalMessages += mc;
  }
  const dailyActivity = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  return {
    dailyActivity,
    dailyModelTokens: [],
    totalSessions: sessions.length,
    totalMessages,
    modelUsage: {},
    lastComputedDate: new Date().toISOString().slice(0, 10),
  };
}

// Active PTY sessions
const activeSessions = new Map();
let mainWindow = null;

// --- Single-instance: parse --project <path> from argv ---
function parseProjectArg(argv) {
  const idx = argv.indexOf('--project');
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return null;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const projectPath = parseProjectArg(argv);
    if (projectPath) mainWindow.webContents.send('launch-project-session', projectPath);
  });
}

// --- URL scheme IPC for external launchers ---
// macOS routes wootonpad:// URLs to the running app via Apple Events — no
// server, no polling, zero overhead. The OS resolves the handler from its
// Launch Services registry and delivers the URL whether the app is open or not.
//
// New session:      open wootonpad://{dir}
// Continue latest:  open wootonpad://+{dir}
//
// Events may arrive before the window is ready — queue them and flush after
// did-finish-load.
const pendingOpenPaths = [];

// In dev, Electron is the "default app" so we pass the script path explicitly.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('wootonpad', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('wootonpad');
}

function dispatchProjectOpen(filePath, continueSession) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('launch-project-session', filePath, continueSession);
  } else {
    pendingOpenPaths.push({ filePath, continueSession });
  }
}

// Raise the window and select the session carrying this focus token.
// Returns false when the token is unknown (session closed since spawn).
function dispatchSessionFocus(token) {
  if (!token) return false;
  for (const [sessionId, session] of activeSessions) {
    if (session.focusToken !== token) continue;
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('focus-session', session.realSessionId || sessionId);
    }
    return true;
  }
  return false;
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  // wootonpad://focus/{token}      →  raise an already-running session
  if (url.startsWith('wootonpad://focus/')) {
    const token = decodeURIComponent(url.slice('wootonpad://focus/'.length));
    if (dispatchSessionFocus(token)) return;
    // Session gone: still bring the app forward rather than doing nothing.
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    return;
  }
  // wootonpad://+/path/to/project  →  continue last session
  // wootonpad:///path/to/project   →  new session
  const continueSession = url.startsWith('wootonpad://+');
  const prefix = continueSession ? 'wootonpad://+' : 'wootonpad://';
  const filePath = decodeURIComponent(url.slice(prefix.length));
  if (filePath) dispatchProjectOpen(filePath, continueSession);
});

// --- Appearance ---
// The DB is synchronous, so the resolved appearance is available before the
// window exists — that's what removes the launch flash.
function currentAppearance() {
  const global = getSetting('global') || {};
  return resolveAppearance(global, { systemPrefersDark: nativeTheme.shouldUseDarkColors });
}

// Drives the native chrome (scrollbars, context menus, system dialogs).
function applyThemeSource() {
  nativeTheme.themeSource = currentAppearance().theme;
}

// Synchronous so the preload can expose the value before any renderer script runs.
ipcMain.on('get-appearance-sync', (event) => {
  event.returnValue = currentAppearance();
});

function broadcastAppearance() {
  const appearance = currentAppearance();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(appearance.backgroundColor);
    mainWindow.webContents.send('appearance-changed', appearance);
  }
  return appearance;
}

// Only 'system' follows the OS; an explicit choice is already broadcast by apply-appearance.
nativeTheme.on('updated', () => {
  if (currentAppearance().theme === 'system') broadcastAppearance();
});

ipcMain.handle('apply-appearance', () => {
  applyThemeSource();
  return broadcastAppearance();
});

function createWindow() {
  applyThemeSource();
  const appearance = currentAppearance();

  // Restore saved window bounds
  const savedBounds = getSetting('global')?.windowBounds;
  let bounds = { width: 1400, height: 900 };

  let restorePosition = null;
  if (savedBounds && savedBounds.width && savedBounds.height) {
    bounds.width = savedBounds.width;
    bounds.height = savedBounds.height;

    // Only restore position if it's on a visible display
    if (savedBounds.x != null && savedBounds.y != null) {
      const displays = screen.getAllDisplays();
      const onScreen = displays.some(d => {
        const b = d.bounds;
        return savedBounds.x >= b.x - 100 && savedBounds.x < b.x + b.width &&
               savedBounds.y >= b.y - 100 && savedBounds.y < b.y + b.height;
      });
      if (onScreen) {
        restorePosition = { x: savedBounds.x, y: savedBounds.y };
      }
    }
  }

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 500,
    title: 'Wooton Pad',
    backgroundColor: appearance.backgroundColor,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Set position after creation to prevent macOS from clamping size
  if (restorePosition) {
    mainWindow.setBounds({ ...restorePosition, width: bounds.width, height: bounds.height });
  }

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  // Open external links in the system browser instead of a child BrowserWindow
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    }
  });
  // Override window.open so xterm WebLinksAddon's default handler (which does
  // window.open() then sets location.href) routes through our IPC instead of
  // creating a child BrowserWindow.
  mainWindow.webContents.on('did-finish-load', () => {
    const startupProject = parseProjectArg(process.argv);
    if (startupProject) mainWindow.webContents.send('launch-project-session', startupProject);
    for (const { filePath, continueSession } of pendingOpenPaths.splice(0)) {
      mainWindow.webContents.send('launch-project-session', filePath, continueSession);
    }

    mainWindow.webContents.executeJavaScript(`
      window.open = function(url) {
        if (url && /^https?:\\/\\//i.test(url)) { window.api.openExternal(url); return null; }
        const proxy = {};
        Object.defineProperty(proxy, 'location', { get() {
          const loc = {};
          Object.defineProperty(loc, 'href', {
            set(u) { if (/^https?:\\/\\//i.test(u)) window.api.openExternal(u); }
          });
          return loc;
        }});
        return proxy;
      };
      void 0;
    `);
  });

  // Prevent Cmd+R / Ctrl+Shift+R from reloading the page (Chromium built-in).
  // Ctrl+R alone on macOS is NOT a reload shortcut and must pass through to xterm
  // for reverse-i-search.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'r' && input.meta) event.preventDefault();
    if (key === 'r' && input.control && input.shift) event.preventDefault();
  });

  // Save window bounds on move/resize (debounced)
  let boundsTimer = null;
  const saveBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
      const b = mainWindow.getBounds();
      const global = getSetting('global') || {};
      global.windowBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      setSetting('global', global);
    }, 500);
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Also save immediately before close (debounce may not have flushed)
  mainWindow.on('close', () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    if (!mainWindow.isMinimized()) {
      const b = mainWindow.getBounds();
      const global = getSetting('global') || {};
      global.windowBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      setSetting('global', global);
    }
  });

  mainWindow.on('closed', () => {
    // On macOS the app stays alive in the dock after the last window closes.
    // Kill all running PTY processes so orphaned `claude` processes don't
    // accumulate in the background with no way for the user to interact.
    for (const [id, session] of activeSessions) {
      if (!session.exited) {
        try { session.pty.kill(); } catch {}
      }
      activeSessions.delete(id);
    }
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Session cache helpers ---

const { deriveProjectPath } = require('./derive-project-path');

// Session cache → session-cache.js
const sessionCache = require('./session-cache');

function initSessionCache() {
  const account = getActiveAccount();
  sessionCache.init({
    PROJECTS_DIR: getProjectsDir(account),
    accountId: account.id,
    activeSessions,
    getMainWindow: () => mainWindow,
    log,
    db: {
      deleteCachedFolder, getCachedByFolder, upsertCachedSessions, deleteCachedSession,
      deleteSearchFolder, deleteSearchSession, upsertSearchEntries,
      setFolderMeta, getAllFolderMeta, getAllMeta, getAllCached, getSetting, getMeta, setName, getAllProjectGitCounts,
    },
  });
}

initSessionCache();
const { readSessionFile, readFolderFromFilesystem, refreshFolder, populateCacheFromFilesystem,
        buildProjectsFromCache, notifyRendererProjectsChanged, sendStatus, populateCacheViaWorker } = sessionCache;

/**
 * Read the tail of a Session's .jsonl and push its live context to the renderer (VIN-143).
 * Called on a busy→idle transition. Plain terminals and un-located sessions have no
 * transcript, so they are skipped silently.
 */
function pushSessionContext(session, currentId) {
  if (!session || session.isPlainTerminal || !session.projectFolder) return;
  try {
    const filePath = path.join(activeProjectsDir(), session.projectFolder, currentId + '.jsonl');
    const ctx = readSessionContextTail(filePath);
    if (ctx && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('session-context', currentId, ctx.contextUsage, ctx.contextModel);
    }
  } catch {}
}


// --- IPC: browse-folder ---
ipcMain.handle('browse-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Project Folder',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// --- IPC: add-project ---
ipcMain.handle('add-project', (_event, rawProjectPath) => {
  const projectPath = canonicalProjectPath(rawProjectPath);
  // A folder picked inside a distribution only belongs to that distribution's
  // account: its Claude home is the one that would record the sessions. Say so,
  // rather than failing later on a path this account cannot resolve.
  const pickedDistro = wslDistroFromUncPath(rawProjectPath);
  const account = getActiveAccount();
  if (pickedDistro && accountWslDistro(account) !== pickedDistro) {
    return { error: `That folder is inside WSL (${pickedDistro}). Switch to the "${pickedDistro}" account to add it.` };
  }
  if (!pickedDistro && isPosixAbsolutePath(projectPath) && !accountWslDistro(account) && isWindows) {
    return { error: `Cannot add "${projectPath}" from a Windows account — switch to the WSL account that owns it.` };
  }
  try {
    // Validate the path exists and is a directory
    const stat = fs.statSync(hostPath(projectPath));
    if (!stat.isDirectory()) return { error: 'Path is not a directory' };

    // Unhide if previously hidden
    const global = getSetting('global') || {};
    if (global.hiddenProjects && global.hiddenProjects.includes(projectPath)) {
      global.hiddenProjects = global.hiddenProjects.filter(p => p !== projectPath);
      setSetting('global', global);
    }

    // Create the corresponding folder in ~/.claude/projects/ so it persists
    const folder = encodeProjectPath(projectPath);
    const folderPath = path.join(activeProjectsDir(), folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Seed a minimal .jsonl so deriveProjectPath can read the cwd
    if (!fs.readdirSync(folderPath).some(f => f.endsWith('.jsonl'))) {
      const seedId = require('crypto').randomUUID();
      const seedFile = path.join(folderPath, seedId + '.jsonl');
      const now = new Date().toISOString();
      const line = JSON.stringify({ type: 'user', cwd: projectPath, sessionId: seedId, uuid: require('crypto').randomUUID(), timestamp: now, message: { role: 'user', content: 'New project' } });
      fs.writeFileSync(seedFile, line + '\n');
    }

    // Immediately index the new folder so it's in cache before frontend renders
    refreshFolder(folder);
    notifyRendererProjectsChanged();
    // Kick off du -sk once on add; subsequent refreshes use the long random TTL
    cacheProjectSize(projectPath);

    return { ok: true, folder, projectPath };
  } catch (err) {
    return { error: err.message };
  }
});

// --- IPC: rename-project ---
// A label, not an identity: the POSIX projectPath stays the key everywhere. An empty
// name clears the override and the sidebar falls back to the path.
ipcMain.handle('rename-project', (_event, projectPath, name) => {
  try {
    const settings = getSetting('project:' + projectPath) || {};
    const trimmed = (name || '').trim();
    if (trimmed) settings.displayName = trimmed;
    else delete settings.displayName;
    setSetting('project:' + projectPath, settings);
    notifyRendererProjectsChanged();
    return { ok: true, displayName: trimmed || null };
  } catch (err) {
    return { error: err.message };
  }
});

// --- IPC: remove-project ---
ipcMain.handle('remove-project', (_event, projectPath) => {
  try {
    // Add to hidden projects list
    const global = getSetting('global') || {};
    const hidden = global.hiddenProjects || [];
    if (!hidden.includes(projectPath)) hidden.push(projectPath);
    global.hiddenProjects = hidden;
    setSetting('global', global);

    // Clean up DB cache and search index for this folder
    const folder = encodeProjectPath(projectPath);
    deleteCachedFolder(folder);
    deleteSearchFolder(folder);
    deleteSetting('project:' + projectPath);

    notifyRendererProjectsChanged();
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

// --- IPC: get-project-info (git branch/diff + docker compose, cached with jittered TTL) ---
const PROJECT_INFO_TTL_MS = 60 * 1000;
// du -sk is expensive; cache with a random long TTL so projects don't all expire at once
const SIZE_TTL_OPTIONS_MS = [3 * 3600000, 20 * 3600000, 24 * 3600000];

const DOCKER_PATH = (process.env.PATH || '') + ':/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin';

// ±30 s jitter so projects cached at the same time don't all expire simultaneously
function infoJitter() {
  return PROJECT_INFO_TTL_MS + (Math.random() * 60000 - 30000);
}

// Docker is not git and keeps its own route: inside the distribution, where the daemon is.
function dockerComposePs(projectPath, { withPorts = false } = {}) {
  return new Promise((resolve) => {
    const [file, args, options] = projectExecFile(['docker', 'compose', 'ps', '--format', 'json'], projectPath, {
      encoding: 'utf8', timeout: 8000, env: { ...process.env, PATH: DOCKER_PATH },
    });
    execFile(file, args, options, (err, stdout) => {
      if (err) return resolve(null);
      resolve(parseComposeContainers(stdout, withPorts));
    });
  });
}

// One JSON object per line. Only the Project Viewer renders ports.
function parseComposeContainers(stdout, withPorts) {
  const lines = (stdout || '').trim().split('\n').filter(Boolean);
  if (!lines.length) return null;
  return lines.map(line => {
    try {
      const c = JSON.parse(line);
      const container = { name: c.Service || c.Name, state: (c.State || '').toLowerCase(), status: c.Status || '' };
      if (!withPorts) return container;
      container.ports = (c.Publishers || [])
        .map(p => `${p.PublishedPort}→${p.TargetPort}/${p.Protocol}`)
        .filter(p => !p.startsWith('0→'))
        .join(', ');
      return container;
    } catch { return null; }
  }).filter(Boolean);
}

function fetchProjectInfo(projectPath) {
  return Promise.all([
    projectGit.lightSnapshot(projectPath),
    dockerComposePs(projectPath),
  ]).then(([{ branch, added, deleted }, containers]) => ({ branch, added, deleted, containers }));
}

// du -sk: only run on add-project and when the long-TTL size cache expires
function fetchProjectSize(projectPath) {
  return new Promise((resolve) => {
    const [file, args, options] = projectExecFile(['du', '-sk', '.'], projectPath, { encoding: 'utf8', timeout: 15000 });
    execFile(file, args, options, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const kb = parseInt((stdout || '').split(/\s+/)[0]);
      resolve(isNaN(kb) ? null : Math.round(kb / 1024));
    });
  });
}

function cacheProjectSize(projectPath) {
  fetchProjectSize(projectPath).then(sizeMb => {
    if (sizeMb === null) return;
    const ttl = SIZE_TTL_OPTIONS_MS[Math.floor(Math.random() * SIZE_TTL_OPTIONS_MS.length)];
    setSetting('project-size:' + projectPath, { sizeMb, fetchedAt: Date.now(), ttl });
  }).catch(() => {});
}

ipcMain.handle('get-project-info', (_event, projectPath) => {
  if (!projectPath || !fs.existsSync(hostPath(projectPath))) return null;
  const cacheKey = 'project-info:' + projectPath;
  const cached = getSetting(cacheKey);
  const cachedSize = getSetting('project-size:' + projectPath);

  const gitFresh = cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < (cached.ttl || PROJECT_INFO_TTL_MS);
  const sizeFresh = cachedSize && cachedSize.fetchedAt && (Date.now() - cachedSize.fetchedAt) < (cachedSize.ttl || SIZE_TTL_OPTIONS_MS[0]);
  const sizeMb = cachedSize?.sizeMb ?? null;

  if (!gitFresh) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project-info-loading', projectPath);
    }
    fetchProjectInfo(projectPath).then(data => {
      const merged = sizeMb !== null ? { ...data, sizeMb } : data;
      setSetting(cacheKey, { data: merged, fetchedAt: Date.now(), ttl: infoJitter() });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('project-info-updated', projectPath, merged);
      }
    }).catch(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('project-info-updated', projectPath, null);
      }
    });
  }

  // Refresh size in background if its long-TTL has expired
  if (!sizeFresh) cacheProjectSize(projectPath);

  const base = cached?.data ?? null;
  return base && sizeMb !== null ? { ...base, sizeMb } : base;
});

// --- IPC: get-project-overview (full Git Snapshot + docker containers, no cache) ---
// One call: the Project Viewer assigns it wholesale and re-reads it after every mutation.
ipcMain.handle('get-project-overview', async (_event, projectPath) => {
  if (!projectPath || !fs.existsSync(hostPath(projectPath))) return null;

  const { ok: _ok, ...snapshot } = await projectGit.snapshot(projectPath);
  const overview = { ...snapshot, containers: [], readmePath: null };
  for (const name of ['README.md', 'readme.md', 'Readme.md', 'README.rst', 'README']) {
    const fp = projectJoin(projectPath, name);
    if (fs.existsSync(hostPath(fp))) { overview.readmePath = fp; break; }
  }

  overview.containers = await dockerComposePs(projectPath, { withPorts: true }) || [];
  try {
    // Dropped, not merely unwritten: the panel deletes every Worktree a Snapshot omits.
    const { worktreePaths: _paths, ...cacheable } = overview;
    setProjectGitCache(projectPath, cacheable);
    notifyRendererProjectsChanged();
  } catch {}
  return overview;
});

ipcMain.handle('get-project-git-cache', (_event, projectPath) => {
  try { return getProjectGitCache(projectPath); } catch { return null; }
});

ipcMain.handle('open-external', (_event, url) => {
  log.info('[open-external IPC]', url);
  if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
});

// --- IPC: MCP bridge ---
ipcMain.on('mcp-diff-response', (_event, sessionId, diffId, action, editedContent) => {
  resolvePendingDiff(sessionId, diffId, action, editedContent);
});

// --- IPC: git operations (everything git knows lives in project-git.js, docs/adr/0007) ---
ipcMain.handle('git-branches', (_event, projectPath) => projectGit.branches(projectPath));

ipcMain.handle('git-checkout', (_event, projectPath, branch) => projectGit.checkout(projectPath, branch));

ipcMain.handle('git-fetch', (_event, projectPath) => projectGit.fetch(projectPath));

ipcMain.handle('git-pull', (_event, projectPath) => projectGit.pull(projectPath));

ipcMain.handle('git-commit', (_event, projectPath, message) => projectGit.commit(projectPath, message));

ipcMain.handle('git-push', (_event, projectPath) => projectGit.push(projectPath));

ipcMain.handle('git-create-branch', (_event, projectPath, branchName, checkout) =>
  projectGit.createBranch(projectPath, branchName, { checkout }));

// --- IPC: areas ---
// Thin CRUD. Ordering and visibility are decided in src/vue/area-tree.mjs, not here.
ipcMain.handle('get-areas', () => ({ areas: getAreas(), assignments: getAreaAssignments() }));

ipcMain.handle('create-area', (_event, name, parentId) => {
  const id = 'area-' + require('crypto').randomUUID().replace(/-/g, '').slice(0, 12);
  return createArea(id, (name || '').trim() || 'New Area', parentId || null);
});

ipcMain.handle('rename-area', (_event, id, name) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return { ok: false };
  renameArea(id, trimmed);
  return { ok: true, name: trimmed };
});

// Written through the moment the header is toggled, so a collapse survives a restart.
ipcMain.handle('set-area-collapsed', (_event, id, collapsed) => {
  setAreaCollapsed(id, collapsed);
  return { ok: true };
});

// Re-parents the Area's children one level up, then removes it — the promotion decided in
// src/vue/area-tree.mjs, done here as one transaction. No confirmation: the caller just deletes.
ipcMain.handle('delete-area', (_event, id) => deleteArea(id));

// Drag and drop filing (VIN-78). The renderer resolves the drop target through the pure module,
// but the cycle guard is re-checked here on the move — the main process is the source of truth.
ipcMain.handle('move-area', (_event, id, parentId) => moveArea(id, parentId ?? null));
ipcMain.handle('file-project', (_event, projectPath, areaId) => fileProject(projectPath, areaId ?? null));

// --- IPC: area image (VIN-82) ---
// Areas carry a custom image alongside the initials-and-colour fallback. The image is stored as
// bytes (its own table), so it survives the source file being deleted or moved; it is resized to
// ~128px before storing so the sidebar never holds a full-resolution photo.
ipcMain.handle('get-area-avatar', (_event, areaId) => {
  const result = getAreaAvatar(areaId);
  if (!result) return null;
  return `data:${result.mimeType};base64,${result.avatarData.toString('base64')}`;
});

// Reads the dropped/selected file (the renderer passes its OS path, as the terminal drop does),
// downscales the longest side to 128px via Electron's nativeImage, and stores it as PNG.
ipcMain.handle('set-area-image', (_event, areaId, filePath) => {
  if (!areaId || !filePath) return null;
  let img = nativeImage.createFromPath(filePath);
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const longest = Math.max(width, height);
  if (longest > 128) {
    const scale = 128 / longest;
    img = img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' });
  }
  const buffer = img.toPNG();
  if (!buffer || !buffer.length) return null;
  setAreaAvatar(areaId, buffer, 'image/png');
  return `data:image/png;base64,${buffer.toString('base64')}`;
});

// Clearing returns the Area to its initials and colour without deleting and recreating it.
ipcMain.handle('clear-area-image', (_event, areaId) => {
  setAreaAvatar(areaId, null, null);
  return { ok: true };
});

// --- IPC: project avatar (GitLab) ---
ipcMain.handle('get-project-avatar', (_event, projectPath) => {
  const result = getStoredAvatar(projectPath);
  if (!result) return null;
  return `data:${result.mimeType};base64,${result.avatarData.toString('base64')}`;
});

ipcMain.handle('fetch-gitlab-avatar', async (_event, projectPath, remoteUrl) => {
  let base = remoteUrl.trim();
  const ssh = base.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  let host, projectApiPath;
  if (ssh) {
    host = `https://${ssh[1]}`;
    projectApiPath = ssh[2];
  } else {
    base = base.replace(/\.git$/, '');
    const m = base.match(/^(https?:\/\/[^/]+)\/(.+)$/);
    if (!m) throw new Error('Cannot parse remote URL');
    host = m[1];
    projectApiPath = m[2];
  }
  const globalSettings = getSetting('global') || {};
  const token = globalSettings.gitlabToken;
  const headers = token ? { 'PRIVATE-TOKEN': token } : {};
  const apiUrl = `${host}/api/v4/projects/${encodeURIComponent(projectApiPath)}`;
  const resp = await fetch(apiUrl, { headers });
  if (!resp.ok) throw new Error(`GitLab API error: ${resp.status}`);
  const data = await resp.json();
  if (!data.avatar_url) {
    setStoredAvatar(projectPath, null, null);
    return null;
  }
  // Use the API avatar endpoint (authenticated) instead of downloading avatar_url directly
  // (avatar_url points to CDN/storage that may reject PRIVATE-TOKEN header).
  const avatarApiUrl = `${host}/api/v4/projects/${data.id}/avatar`;
  const imgResp = await fetch(avatarApiUrl, { headers });
  if (!imgResp.ok) throw new Error(`Avatar download error: ${imgResp.status}`);
  const contentType = imgResp.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await imgResp.arrayBuffer());
  setStoredAvatar(projectPath, buffer, contentType);
  return `data:${contentType};base64,${buffer.toString('base64')}`;
});

// Only the diff is git. The claude spawn below is this file's own business.
ipcMain.handle('git-generate-commit-msg', async (_event, projectPath, style = 'short') => {
  const { spawn } = require('child_process');
  try {
    const res = await projectGit.diff(projectPath);
    if (!res.ok) return res;
    const diff = res.diff;
    if (!diff.trim()) return { ok: false, stderr: 'No changes to describe' };
    const globalSettings = getSetting('global') || {};
    const baseInstruction = globalSettings.commitMessagePrompt || COMMIT_MSG_PROMPT_DEFAULT;
    const styleSuffix = style === 'descriptive'
      ? ' Write a short title line followed by a blank line and a concise bullet list of key changes (3-5 bullets max). Use conventional commit format.'
      : ' Write a single short sentence (max 72 chars). Use conventional commit format (feat/fix/refactor/docs/chore).';
    const prompt = `${baseInstruction}${styleSuffix}\n\nOutput ONLY the commit message, no explanation:\n\n${diff.slice(0, 8000)}`;
    const msg = await new Promise((resolve, reject) => {
      // The claude binary lives wherever the project does — inside the
      // distribution for a WSL-backed one, so this call is routed there too.
      const [file, args, options] = projectExecFile(
        ['claude', '-p', prompt, '--no-session-persistence'], projectPath, {}
      );
      const child = spawn(file, args, options);
      let stdout = '', stderr = '';
      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out after 60s')); }, 60000);
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) reject(new Error(stderr.trim() || `claude exited with code ${code}`));
        else resolve(stdout.trim());
      });
      child.on('error', err => { clearTimeout(timer); reject(err); });
    });
    if (!msg) return { ok: false, stderr: 'No output from claude' };
    const clean = msg.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    return { ok: true, message: clean };
  } catch (e) { return { ok: false, stderr: e.message }; }
});

ipcMain.handle('delete-worktree', async (_event, projectPath, worktreePath) => {
  const { setProjectGitCache } = require('./db');
  const res = await projectGit.removeWorktree(projectPath, worktreePath);
  if (!res.ok) return res;
  // Clear the git cache for the worktree path so stale data doesn't show
  try { setProjectGitCache(worktreePath, { branch: null, upstream: null, remoteUrl: null, tags: [], commits: [], unpushedCommits: [], changedFiles: [], totalAdded: 0, totalDeleted: 0, containers: [] }); } catch {}
  return res;
});

ipcMain.handle('get-git-user-info', (_event, projectPath) => projectGit.userInfo(projectPath));

ipcMain.handle('get-file-tree', (_event, projectPath) => {
  const IGNORE = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv', '.DS_Store', 'target', '.cache', 'coverage', '.turbo']);
  function walk(dir, rel, depth) {
    if (depth > 5) return [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    return entries
      .filter(e => !IGNORE.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => {
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        const isDir = e.isDirectory();
        return { name: e.name, path: relPath, isDir, children: isDir ? walk(path.join(dir, e.name), relPath, depth + 1) : null };
      });
  }
  // Only the walk root is translated: entry paths below it are built relative
  // with forward slashes, which is what the renderer joins back onto the
  // canonical project path.
  try { return { ok: true, tree: walk(hostPath(projectPath), '', 0) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('get-project-sessions', (_event, projectPath) => {
  try {
    const { buildProjectsFromCache } = require('./session-cache');
    const projects = buildProjectsFromCache();
    const proj = projects.find(p => p.projectPath === projectPath);
    const sessions = (proj?.sessions || []).filter(s => !s.archived).slice(0, 10).map(s => ({
      id: s.sessionId, name: s.name || s.aiTitle || s.summary?.slice(0, 40) || s.sessionId?.slice(0, 8), updatedAt: s.modified, running: false,
    }));
    return { ok: true, sessions };
  } catch (e) { return { ok: false, sessions: [] }; }
});

// git exits 128 both for a file absent from HEAD and for a repository it cannot read,
// so empty old content stands for either — the likelier being a new file, as shown.
ipcMain.handle('get-file-diff', async (_event, projectPath, filePath) => {
  const shown = await projectGit.showFile(projectPath, filePath);
  try {
    const newContent = fs.readFileSync(hostPath(projectJoin(projectPath, filePath)), 'utf8');
    return { ok: true, oldContent: shown.ok ? shown.content : '', newContent };
  } catch (e) {
    return { ok: false, stderr: e.message };
  }
});

ipcMain.handle('read-file-for-panel', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(hostPath(filePath), 'utf8');
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('save-file-for-panel', async (_event, filePath, content) => {
  try {
    const resolved = path.resolve(hostPath(filePath));
    if (!fs.existsSync(resolved)) return { ok: false, error: 'File does not exist' };
    fs.writeFileSync(resolved, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── File Watching (for viewer panels) ────────────────────────────────
const fileWatchers = new Map(); // filePath → FSWatcher

ipcMain.handle('watch-file', (_event, filePath) => {
  const resolved = path.resolve(hostPath(filePath));
  if (fileWatchers.has(resolved)) return { ok: true };
  try {
    let debounce = null;
    const watcher = fs.watch(resolved, (eventType) => {
      if (eventType !== 'change') return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-changed', resolved);
        }
      }, 300);
    });
    fileWatchers.set(resolved, watcher);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('unwatch-file', (_event, filePath) => {
  const resolved = path.resolve(hostPath(filePath));
  const watcher = fileWatchers.get(resolved);
  if (watcher) {
    watcher.close();
    fileWatchers.delete(resolved);
  }
  return { ok: true };
});

ipcMain.handle('get-projects', () => {
  try {
    const needsPopulate = !isCachePopulated(getActiveAccount().id) || !isSearchIndexPopulated();

    if (needsPopulate) {
      populateCacheViaWorker();
      return [];
    }

    return buildProjectsFromCache();
  } catch (err) {
    console.error('Error listing projects:', err);
    return [];
  }
});

// --- IPC: get-plans ---
ipcMain.handle('get-plans', () => {
  try {
    const plansDir = activePlansDir();
    if (!fs.existsSync(plansDir)) return [];
    const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.md'));
    const plans = [];
    for (const file of files) {
      const filePath = path.join(plansDir, file);
      try {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const firstLine = content.split('\n').find(l => l.trim());
        const title = firstLine && firstLine.startsWith('# ')
          ? firstLine.slice(2).trim()
          : file.replace(/\.md$/, '');
        plans.push({ filename: file, title, modified: stat.mtime.toISOString() });
      } catch {}
    }
    plans.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    // Index plans for FTS
    try {
      deleteSearchType('plan');
      upsertSearchEntries(plans.map(p => ({
        id: p.filename, type: 'plan', folder: null,
        title: p.title,
        body: fs.readFileSync(path.join(plansDir, p.filename), 'utf8'),
      })));
    } catch {}

    return plans;
  } catch (err) {
    console.error('Error reading plans:', err);
    return [];
  }
});

// --- IPC: read-plan ---
ipcMain.handle('read-plan', (_event, filename) => {
  try {
    const filePath = path.join(activePlansDir(), path.basename(filename));
    const content = fs.readFileSync(filePath, 'utf8');
    return { content, filePath };
  } catch (err) {
    console.error('Error reading plan:', err);
    return { content: '', filePath: '' };
  }
});

// --- IPC: save-plan ---
ipcMain.handle('save-plan', (_event, filePath, content) => {
  try {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(activePlansDir())) {
      return { ok: false, error: 'path outside plans directory' };
    }
    fs.writeFileSync(resolved, content, 'utf8');
    return { ok: true };
  } catch (err) {
    console.error('Error saving plan:', err);
    return { ok: false, error: err.message };
  }
});

// --- IPC: get-stats ---
ipcMain.handle('get-stats', () => {
  const activeAccount = getActiveAccount();
  const dbStats = computeStatsFromDb(activeAccount.id);
  try {
    const statsPath = path.join(activeConfigDir(), 'stats-cache.json');
    if (fs.existsSync(statsPath)) {
      const fileStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      // Prefer file stats (has rich token data) but fall back to DB for activity data
      if (!fileStats.dailyActivity?.length && dbStats.dailyActivity.length) {
        fileStats.dailyActivity = dbStats.dailyActivity;
      }
      if (!fileStats.totalSessions) fileStats.totalSessions = dbStats.totalSessions;
      if (!fileStats.totalMessages) fileStats.totalMessages = dbStats.totalMessages;
      return fileStats;
    }
  } catch (err) {
    console.error('Error reading stats cache:', err);
  }
  // No file cache — return DB-computed stats so charts always render
  return dbStats;
});

// --- IPC: refresh-stats (run /stats + /usage via PTY) ---
ipcMain.handle('refresh-stats', async () => {
  // For stats, use the configured shell profile — unless the account lives in a
  // distribution, in which case that is where its `claude` binary and its
  // credentials are, and a Windows shell could reach neither.
  const globalSettings = getSetting('global') || {};
  const statsDistro = activeWslDistro();
  const statsProfileId = globalSettings.shellProfile || SETTING_DEFAULTS.shellProfile;
  const statsShellProfile = resolveShell(statsDistro ? 'wsl:' + statsDistro : statsProfileId);
  const statsShell = statsShellProfile.path;
  const statsShellExtraArgs = statsShellProfile.args || [];
  const statsInWsl = isWslShell(statsShell);
  if (statsDistro && !statsInWsl) {
    // Same shape as the handler's other failure path — the renderer reads
    // .stats/.usage and would silently ignore anything else.
    log.error(`[stats] WSL distribution "${statsDistro}" is not available`);
    return { stats: null, usage: {} };
  }
  const configDir = activeConfigDir();
  const ptyEnv = {
    ...cleanPtyEnv,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'WarpTerminal',
    TERM_PROGRAM_VERSION: 'v0.2026.07.30.08.12.stable_01',
    FORCE_COLOR: '3',
    // No ITERM_SESSION_ID: without it Claude CLI won't try to reach iTerm2 via AppleScript,
    // which avoids the macOS "would like to access data from other apps" permission prompt.
    // CLAUDE_CONFIG_DIR is skipped for a WSL account: its configDir is the
    // Windows view of a home that is already the default inside the distro.
    ...(configDir !== DEFAULT_CLAUDE_DIR && !statsDistro ? { CLAUDE_CONFIG_DIR: configDir } : {}),
  };
  if (statsInWsl) {
    Object.assign(ptyEnv, withWslEnv(ptyEnv, [
      'TERM', 'COLORTERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'FORCE_COLOR',
    ]));
  }

  // Helper: spawn claude with args, collect output, auto-accept trust, kill when idle
  // waitFor: optional regex tested against stripped output — finish only when matched
  function runClaude(args, { timeoutMs = 15000, waitFor = null } = {}) {
    return new Promise((resolve) => {
      let output = '';
      let settled = false;
      let trustAccepted = false;
      // Track idle: ✳ in OSC title means Claude is idle and waiting for input
      let sawActivity = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        try { p.kill(); } catch {}
        resolve(output);
      };

      const claudeCmd = `claude ${args}`;
      log.info(`[claude-cmd] session=stats cmd=${JSON.stringify(claudeCmd)}`);
      const p = pty.spawn(statsShell, shellArgs(statsShell, claudeCmd, statsShellExtraArgs), {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: os.homedir(),
        env: ptyEnv,
      });

      p.onExit(({ exitCode, signal }) => {
        log.info(
          `[pty-exit] session=stats code=${exitCode} signal=${signal ?? 'none'} ` +
          `settled=${settled} tail=${JSON.stringify(stripAnsi(output).slice(-600))}`
        );
        finish();
      });

      p.onData((data) => {
        output += data;

        // Auto-accept trust directory prompt (Enter selects "1. Yes")
        if (!trustAccepted) {
          if (/trust\s*this\s*folder/i.test(stripAnsi(output))) {
            trustAccepted = true;
            try { p.write('\r'); } catch {}
            return;
          }
        }

        // If waitFor is set, finish when that pattern appears in stripped output
        if (waitFor) {
          if (waitFor.test(stripAnsi(output))) {
            finish();
          }
          return;
        }

        // Default: detect busy→idle transition via OSC title containing ✳
        if (!sawActivity) {
          const oscTitle = data.match(/\x1b\]0;([^\x07\x1b]*)/);
          if (oscTitle) {
            const first = oscTitle[1].charAt(0);
            if (first.charCodeAt(0) >= 0x2800 && first.charCodeAt(0) <= 0x28FF) {
              sawActivity = true;
            }
          }
        } else if (data.includes('\u2733')) {
          finish();
        }
      });

      p.onExit(() => finish());
      setTimeout(finish, timeoutMs);
    });
  }

  try {
    // Run /stats via PTY (for heatmap/chart data) and fetch usage via API in parallel
    const [, usage] = await Promise.all([
      runClaude('"/stats"', { waitFor: /streak/i, timeoutMs: 10000 }),
      fetchAndTransformUsage(configDir).catch(() => ({})),
    ]);

    // Read refreshed stats cache (written to active account's config dir)
    const activeAccount = getActiveAccount();
    const dbStats = computeStatsFromDb(activeAccount.id);
    let stats = dbStats;
    try {
      const statsPath = path.join(configDir, 'stats-cache.json');
      if (fs.existsSync(statsPath)) {
        const fileStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        if (!fileStats.dailyActivity?.length && dbStats.dailyActivity.length) {
          fileStats.dailyActivity = dbStats.dailyActivity;
        }
        if (!fileStats.totalSessions) fileStats.totalSessions = dbStats.totalSessions;
        if (!fileStats.totalMessages) fileStats.totalMessages = dbStats.totalMessages;
        stats = fileStats;
      }
    } catch {}

    return { stats, usage: usage || {} };
  } catch (err) {
    log.error('Error refreshing stats:', err);
    return { stats: null, usage: {} };
  }
});

// --- IPC: get-usage (lightweight, API-only, no PTY) ---
ipcMain.handle('get-usage', async () => {
  const cacheKey = 'usage:' + ((getSetting('global') || {}).activeAccountId || 'default');
  try {
    const usage = await fetchAndTransformUsage(activeConfigDir()) || {};
    if (!usage._error && !usage._rateLimited && Object.keys(usage).length) {
      setSetting(cacheKey, usage);
      return usage;
    }
    const cached = getSetting(cacheKey);
    return cached ? { ...cached, _cached: true } : usage;
  } catch (err) {
    log.error('Error fetching usage:', err);
    const cached = getSetting(cacheKey);
    return cached ? { ...cached, _cached: true } : {};
  }
});

// --- IPC: get-cached-usage (DB-only, no Keychain/API access) ---
ipcMain.handle('get-cached-usage', () => {
  const cacheKey = 'usage:' + ((getSetting('global') || {}).activeAccountId || 'default');
  const cached = getSetting(cacheKey);
  return cached ? { ...cached, _cached: true } : {};
});

// --- IPC: get-memories ---
function folderToShortPath(folder) {
  // Convert "-Users-home-dev-MyClaude" → "dev/MyClaude"
  const parts = folder.replace(/^-/, '').split('-');
  const meaningful = parts.filter(Boolean);
  return meaningful.slice(-2).join('/');
}

/** Scan a directory for .md files (non-recursive). Returns array of { filename, filePath, modified }. */
// `dir` is canonical: a Windows path, or the POSIX path of a WSL-backed
// project. Reported filePaths keep that same flavour; only the fs calls are
// translated.
function scanMdFiles(dir) {
  const results = [];
  try {
    if (!fs.existsSync(hostPath(dir))) return results;
    const entries = fs.readdirSync(hostPath(dir), { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md')) {
        const fp = projectJoin(dir, e.name);
        const content = fs.readFileSync(hostPath(fp), 'utf8').trim();
        if (content) {
          const stat = fs.statSync(hostPath(fp));
          results.push({ filename: e.name, filePath: fp, modified: stat.mtime.toISOString() });
        }
      }
    }
  } catch {}
  return results;
}

ipcMain.handle('get-memories', () => {
  const global = getSetting('global') || {};
  const hiddenProjects = new Set(global.hiddenProjects || []);

  // --- Global files ---
  // The active account's Claude home, not the Windows one: a WSL account's
  // global CLAUDE.md lives inside the distribution.
  const globalFiles = scanMdFiles(activeConfigDir()).map(f => ({ ...f, displayPath: '~/.claude' }));

  // --- Per-project files ---
  const projects = [];
  try {
    const memoriesProjectsDir = activeProjectsDir();
    if (fs.existsSync(memoriesProjectsDir)) {
      const folders = fs.readdirSync(memoriesProjectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== '.git')
        .map(d => d.name);

      for (const folder of folders) {
        const folderPath = path.join(memoriesProjectsDir, folder);
        const projectPath = deriveProjectPath(folderPath, folder);
        if (projectPath && hiddenProjects.has(projectPath)) continue;

        // Use same 2-deep short path as Sessions tab (e.g. "dev/MyClaude")
        const shortName = projectPath
          ? projectPath.split('/').filter(Boolean).slice(-2).join('/')
          : folderToShortPath(folder);
        const files = [];
        const seenPaths = new Set();

        // 1. ~/.claude/projects/{folder}/ — claude-home .md files
        const claudeHomeFiles = scanMdFiles(folderPath);
        for (const f of claudeHomeFiles) {
          files.push({ ...f, displayPath: '~/.claude', source: 'claude-home' });
          seenPaths.add(f.filePath);
        }
        // memory/MEMORY.md
        const memoryDir = path.join(folderPath, 'memory');
        const memoryFiles = scanMdFiles(memoryDir);
        for (const f of memoryFiles) {
          files.push({ ...f, displayPath: '~/.claude', source: 'claude-home' });
          seenPaths.add(f.filePath);
        }

        // 2. {projectPath}/ — project root CLAUDE.md, agents.md
        if (projectPath) {
          for (const name of ['CLAUDE.md', 'GEMINI.md', 'agents.md']) {
            const fp = projectJoin(projectPath, name);
            try {
              if (fs.existsSync(hostPath(fp))) {
                const content = fs.readFileSync(hostPath(fp), 'utf8').trim();
                if (content && !seenPaths.has(fp)) {
                  const stat = fs.statSync(hostPath(fp));
                  files.push({ filename: name, filePath: fp, modified: stat.mtime.toISOString(), displayPath: shortName + '/', source: 'project' });
                  seenPaths.add(fp);
                }
              }
            } catch {}
          }

          // 3. {projectPath}/.claude/ — commands/*.md and other .md files
          const dotClaudeDir = projectJoin(projectPath, '.claude');
          const dotClaudeFiles = scanMdFiles(dotClaudeDir);
          for (const f of dotClaudeFiles) {
            if (!seenPaths.has(f.filePath)) {
              files.push({ ...f, displayPath: shortName + '/.claude/', source: 'project' });
              seenPaths.add(f.filePath);
            }
          }
          // commands/*.md
          const commandsDir = projectJoin(dotClaudeDir, 'commands');
          const commandFiles = scanMdFiles(commandsDir);
          for (const f of commandFiles) {
            if (!seenPaths.has(f.filePath)) {
              files.push({ ...f, displayPath: shortName + '/.claude/commands/', source: 'project' });
              seenPaths.add(f.filePath);
            }
          }
        }

        if (files.length > 0) {
          projects.push({ folder, projectPath: projectPath || '', shortName, files });
        }
      }
    }
  } catch (err) {
    console.error('Error scanning memories:', err);
  }

  // Sort projects by most recent file modified date
  projects.sort((a, b) => {
    const aMax = Math.max(...a.files.map(f => new Date(f.modified).getTime()));
    const bMax = Math.max(...b.files.map(f => new Date(f.modified).getTime()));
    return bMax - aMax;
  });

  const result = { global: { files: globalFiles }, projects };

  // Index all files for FTS
  try {
    deleteSearchType('memory');
    const allFiles = [
      ...globalFiles.map(f => ({ ...f, label: 'Global' })),
      ...projects.flatMap(p => p.files.map(f => ({ ...f, label: p.shortName }))),
    ];
    // filePath is canonical; one unreadable file would otherwise throw out of
    // the whole batch and leave memory search unindexed entirely.
    upsertSearchEntries(allFiles.map(f => {
      let body = '';
      try { body = fs.readFileSync(hostPath(f.filePath), 'utf8'); } catch {}
      return {
        id: f.filePath, type: 'memory', folder: null,
        title: f.label + ' ' + f.filename,
        body,
      };
    }));
  } catch {}

  return result;
});

// --- IPC: read-memory ---
ipcMain.handle('read-memory', (_event, filePath) => {
  try {
    const resolved = path.resolve(hostPath(filePath));
    // Allow paths under the active account's Claude home, or any .md that exists
    if (!resolved.endsWith('.md')) return '';
    if (!resolved.startsWith(activeConfigDir()) && !fs.existsSync(resolved)) return '';
    return fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    console.error('Error reading memory file:', err);
    return '';
  }
});

// --- IPC: save-memory ---
ipcMain.handle('save-memory', (_event, filePath, content) => {
  try {
    const resolved = path.resolve(hostPath(filePath));
    if (!resolved.endsWith('.md')) return { ok: false, error: 'not a .md file' };
    if (!fs.existsSync(resolved)) return { ok: false, error: 'file does not exist' };
    fs.writeFileSync(resolved, content, 'utf8');
    return { ok: true };
  } catch (err) {
    console.error('Error saving memory file:', err);
    return { ok: false, error: err.message };
  }
});

// --- IPC: search ---
ipcMain.handle('search', (_event, type, query, titleOnly) => {
  return searchByType(type, query, 50, !!titleOnly);
});

// --- IPC: settings ---
ipcMain.handle('get-setting', (_event, key) => {
  return getSetting(key);
});

ipcMain.handle('set-setting', (_event, key, value) => {
  setSetting(key, value);
  return { ok: true };
});

ipcMain.handle('delete-setting', (_event, key) => {
  deleteSetting(key);
  return { ok: true };
});

// --- Multi-account IPCs ---

ipcMain.handle('get-accounts', () => getAccounts());

ipcMain.handle('save-accounts', (_event, accounts) => {
  const withDefault = accounts.find(a => a.id === 'default')
    ? accounts
    : [DEFAULT_ACCOUNT, ...accounts];
  setSetting('accounts', withDefault);
  return { ok: true };
});

ipcMain.handle('create-account', (_event, name) => {
  const { randomUUID } = require('crypto');
  const id = 'acc-' + randomUUID().replace(/-/g, '').slice(0, 12);
  const configDir = path.join(os.homedir(), '.wootonpad', 'accounts', id);
  fs.mkdirSync(configDir, { recursive: true });
  const account = { id, name, configDir };
  const existing = getAccounts();
  setSetting('accounts', [...existing, account]);
  return account;
});

// Distributions that hold a reachable Claude home, for the "add account" UI.
ipcMain.handle('discover-wsl-claude-homes', async () => {
  try { return await discoverWslClaudeHomes(); } catch { return []; }
});

// Attach an account to the Claude home inside a WSL distribution. Additive:
// accounts without `wslDistro` keep behaving exactly as before.
ipcMain.handle('create-wsl-account', async (_event, distro, name) => {
  const existingForDistro = getAccounts().find(a => a.wslDistro === distro);
  if (existingForDistro) return existingForDistro;
  const probe = await probeWslClaudeHome(distro);
  if (!probe) return { error: `No reachable Claude home in WSL distribution "${distro}"` };
  const { randomUUID } = require('crypto');
  const id = 'wsl-' + randomUUID().replace(/-/g, '').slice(0, 12);
  const account = {
    id,
    name: name || `WSL — ${distro}`,
    configDir: probe.configDir,
    wslDistro: probe.distro,
    wslUncPrefix: probe.uncPrefix,
    wslHome: probe.home,
  };
  setSetting('accounts', [...getAccounts(), account]);
  return account;
});

ipcMain.handle('rename-account', (_event, id, name) => {
  const updated = getAccounts().map(a => a.id === id ? { ...a, name } : a);
  setSetting('accounts', updated);
  return { ok: true };
});

ipcMain.handle('delete-account', (_event, id) => {
  if (id === 'default') return { ok: false };
  const updated = getAccounts().filter(a => a.id !== id);
  setSetting('accounts', updated);
  return { ok: true };
});

ipcMain.handle('get-homedir', () => os.homedir());

ipcMain.handle('get-active-account-id', () => {
  return (getSetting('global') || {}).activeAccountId || 'default';
});

ipcMain.handle('set-active-account-id', (_event, accountId) => {
  const global = getSetting('global') || {};
  global.activeAccountId = accountId;
  setSetting('global', global);

  // Re-init session cache for new account and trigger re-scan. Fork/plan-accept
  // detection holds its own copy of the projects directory, so it has to be
  // re-pointed too — otherwise it keeps watching the previous account's folder.
  initSessionCache();
  require('./session-transitions').init({
    PROJECTS_DIR: activeProjectsDir(), activeSessions, getMainWindow: () => mainWindow, log, rekeyMcpServer,
  });
  restartProjectsWatcher();
  populateCacheViaWorker();
  return { ok: true };
});

ipcMain.handle('get-accounts-usage', async () => {
  const accounts = getAccounts();
  const results = {};
  await Promise.all(accounts.map(async (account) => {
    const cacheKey = 'usage:' + account.id;
    try {
      const usage = await fetchAndTransformUsage(account.configDir);
      if (usage && !usage._error && !usage._rateLimited && Object.keys(usage).length) {
        setSetting(cacheKey, usage);
        results[account.id] = usage;
      } else {
        const cached = getSetting(cacheKey);
        results[account.id] = cached ? { ...cached, _cached: true } : (usage || {});
      }
    } catch {
      const cached = getSetting(cacheKey);
      results[account.id] = cached ? { ...cached, _cached: true } : {};
    }
  }));
  return results;
});

// --- Scheduled tasks ---
const scheduleIpc = require('./schedule-ipc');

const COMMIT_MSG_PROMPT_DEFAULT = `Write a concise git commit message (max 72 chars for first line) for these changes. Use conventional commit format (feat/fix/refactor/docs/chore). Output ONLY the commit message, no explanation:`;

const SETTING_DEFAULTS = {
  permissionMode: null,
  dangerouslySkipPermissions: false,
  worktree: false,
  worktreeName: '',
  chrome: false,
  preLaunchCmd: '',
  externalIdeCommand: '',
  runCommand: '',
  addDirs: '',
  visibleSessionCount: 5,
  sidebarWidth: 340,
  terminalTheme: APPEARANCE_DEFAULTS.terminalTheme,
  mcpEmulation: false,
  shellProfile: 'auto',
  showAvatars: true,
  commitMessagePrompt: '',
  theme: APPEARANCE_DEFAULTS.theme,
  neutralTone: APPEARANCE_DEFAULTS.neutralTone,
};

// Appearance is a preference of the person, not a property of a Project:
// these keys never take a per-project override.
const GLOBAL_ONLY_SETTINGS = new Set(['theme', 'neutralTone']);

ipcMain.handle('get-shell-profiles', () => {
  _shellProfiles = null; // refresh on each request
  return getShellProfiles();
});

function effectiveSettings(projectPath) {
  const global = getSetting('global') || {};
  const project = projectPath ? (getSetting('project:' + projectPath) || {}) : {};
  const effective = { ...SETTING_DEFAULTS };
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    if (global[key] !== undefined && global[key] !== null) {
      effective[key] = global[key];
    }
    if (!GLOBAL_ONLY_SETTINGS.has(key) && project[key] !== undefined && project[key] !== null) {
      effective[key] = project[key];
    }
  }
  return effective;
}

ipcMain.handle('get-effective-settings', (_event, projectPath) => effectiveSettings(projectPath));

// --- IPC: open a Project in the user's External IDE ---
// The renderer only ever sends a projectPath; the command comes from settings,
// read here. See docs/adr/0003-external-ide-shell-command.md.
const EXTERNAL_IDE_LAUNCH_WATCH_MS = 3000;

ipcMain.handle('open-in-external-ide', (_event, projectPath) => {
  const settings = effectiveSettings(projectPath);
  const profile = resolveShell(settings.shellProfile);
  const launch = resolveIdeLaunch(
    { externalIdeCommand: settings.externalIdeCommand, projectPath },
    {
      shellPath: profile.path,
      shellExtraArgs: profile.args,
      folderExists: !!projectPath && fs.existsSync(projectPath),
    }
  );
  if (!launch.ok) return launch;

  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    let child;
    try {
      child = spawn(launch.shell, launch.args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      return resolve({ ok: false, reason: 'launch-failed', message: String(err?.message || err) });
    }
    child.unref();

    let stderr = '';
    let timer;
    const onStderr = (chunk) => { stderr += chunk.toString(); };
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      // A foreground editor (`code --wait`, `nvim`) outlives this promise: stop
      // listening rather than buffer its output for nobody.
      clearTimeout(timer);
      child.stderr?.off('data', onStderr);
      child.removeAllListeners('exit');
      child.removeAllListeners('error');
      resolve(result);
    };

    child.stderr?.on('data', onStderr);
    child.on('error', (err) => done({ ok: false, reason: 'launch-failed', message: String(err?.message || err) }));
    child.on('exit', (code) => {
      if (code) done({ ok: false, reason: 'launch-failed', message: launchErrorMessage(stderr, code) });
      else done({ ok: true });
    });

    // Past this window the External IDE is considered up.
    timer = setTimeout(() => done({ ok: true }), EXTERNAL_IDE_LAUNCH_WATCH_MS);
  });
});

// --- IPC: open a Project Folder in the system file manager ---
// Electron's native API, not the External IDE's shell template: a file manager is a
// predictable target the OS already picks. See docs/adr/0004-native-open-for-predictable-targets.md.
ipcMain.handle('open-project-folder', async (_event, projectPath) => {
  let stat;
  try {
    stat = fs.statSync(projectPath);
  } catch {
    return { ok: false, reason: 'missing-folder' };
  }
  // openPath on a file would launch its default app — an "open the folder" must stay one.
  if (!stat.isDirectory()) return { ok: false, reason: 'not-a-directory' };

  const message = await shell.openPath(projectPath);
  return message ? { ok: false, reason: 'open-failed', message } : { ok: true };
});

// --- IPC: run a Project's Run Command in a Run Terminal ---
// The renderer only ever sends a projectPath; the command comes from settings,
// read here. See docs/adr/0006-run-command-in-a-run-terminal.md.
//
// activeSessions drops an exited session; this binding outlives it, so reuse-on-exit works.
const runTerminals = new Map(); // projectPath -> sessionId

function sessionsForRunLookup() {
  const sessions = [];
  for (const [sessionId, session] of activeSessions) {
    sessions.push({
      sessionId,
      projectPath: session.projectPath,
      type: session.sessionType || (session.isPlainTerminal ? 'terminal' : 'session'),
      exited: !!session.exited,
    });
  }
  for (const [projectPath, sessionId] of runTerminals) {
    if (activeSessions.has(sessionId)) continue;
    sessions.push({ sessionId, projectPath, type: RUN_TERMINAL_TYPE, exited: true });
  }
  return sessions;
}

ipcMain.handle('run-project', (_event, projectPath) => {
  const settings = effectiveSettings(projectPath);
  return resolveRunTerminal(
    { runCommand: settings.runCommand, projectPath },
    {
      folderExists: !!projectPath && fs.existsSync(projectPath),
      sessions: sessionsForRunLookup(),
    }
  );
});

// A Run Terminal the user closed by hand is gone for good: the next click starts a new one.
ipcMain.handle('forget-run-terminal', (_event, sessionId) => {
  for (const [projectPath, id] of runTerminals) {
    if (id === sessionId) runTerminals.delete(projectPath);
  }
  return { ok: true };
});

// --- IPC: get-active-sessions ---
ipcMain.handle('get-active-sessions', () => {
  const active = [];
  for (const [sessionId, session] of activeSessions) {
    if (!session.exited) active.push(sessionId);
  }
  return active;
});

// --- IPC: get-active-terminals --- (plain terminal sessions for renderer restore)
ipcMain.handle('get-active-terminals', () => {
  const terminals = [];
  for (const [sessionId, session] of activeSessions) {
    if (!session.exited && session.isPlainTerminal) {
      // The type travels: a reload must rebuild a Run Terminal as one, not as a plain Terminal.
      terminals.push({
        sessionId,
        projectPath: session.projectPath,
        type: session.sessionType || 'terminal',
      });
    }
  }
  return terminals;
});

// --- IPC: stop-session ---
ipcMain.handle('stop-session', (_event, sessionId) => {
  const session = activeSessions.get(sessionId);
  if (!session || session.exited) return { ok: false, error: 'not running' };
  // Marks the exit as deliberate so the renderer doesn't report it as a crash.
  session._stoppedByUser = true;
  session.pty.kill();
  return { ok: true };
});

// --- IPC: toggle-star ---
ipcMain.handle('toggle-star', (_event, sessionId) => {
  const starred = toggleStar(sessionId);
  return { starred };
});

// --- IPC: rename-session ---
ipcMain.handle('rename-session', (_event, sessionId, name) => {
  setName(sessionId, name || null);
  // Update search index title to include the new name
  const cached = getCachedSession(sessionId);
  const summary = cached?.summary || '';
  updateSearchTitle(sessionId, 'session', (name ? name + ' ' : '') + summary);
  return { name: name || null };
});

// --- IPC: archive-session ---
ipcMain.handle('read-session-jsonl', (_event, sessionId) => {
  const folder = getCachedFolder(sessionId);
  if (!folder) return { error: 'Session not found in cache' };
  const jsonlPath = path.join(activeProjectsDir(), folder, sessionId + '.jsonl');
  try {
    const content = fs.readFileSync(jsonlPath, 'utf-8');
    const entries = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch {}
    }
    return { entries };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('archive-session', (_event, sessionId, archived) => {
  const val = archived ? 1 : 0;
  setArchived(sessionId, val);
  return { archived: val };
});

// --- IPC: open-terminal ---
ipcMain.handle('open-terminal', async (_event, sessionId, projectPath, isNew, sessionOptions) => {
  if (!mainWindow) return { ok: false, error: 'no window' };

  // Reattach to existing session
  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.rendererAttached = true;
    session.firstResize = !session.isPlainTerminal;

    // If TUI is in alternate screen mode, send escape to switch into it
    if (session.altScreen && !session.isPlainTerminal) {
      mainWindow.webContents.send('terminal-data', sessionId, '\x1b[?1049h');
    }

    // Send buffered output for reattach
    for (const chunk of session.outputBuffer) {
      mainWindow.webContents.send('terminal-data', sessionId, chunk);
    }

    if (!session.isPlainTerminal) {
      // Hide cursor after buffer replay — the live PTY stream or resize nudge
      // will re-show it at the correct position, avoiding a stale cursor artifact
      mainWindow.webContents.send('terminal-data', sessionId, '\x1b[?25l');
    }

    return { ok: true, reattached: true, mcpActive: !!session.mcpServer };
  }

  // Spawn new PTY
  if (!fs.existsSync(hostPath(projectPath))) {
    return { ok: false, error: `project directory no longer exists: ${projectPath}` };
  }

  // A Run Terminal is a Plain Terminal that starts on the Project's Run Command:
  // same PTY path, same shell, distinct only in identity and in what is written to it.
  const sessionType = sessionOptions?.type === RUN_TERMINAL_TYPE ? RUN_TERMINAL_TYPE
    : sessionOptions?.type === 'terminal' ? 'terminal'
    : 'session';
  const isPlainTerminal = sessionType !== 'session';

  // Resolve shell profile from effective settings
  const effectiveProfileId = (() => {
    const global = getSetting('global') || {};
    const project = projectPath ? (getSetting('project:' + projectPath) || {}) : {};
    let profileId = SETTING_DEFAULTS.shellProfile;
    if (global.shellProfile !== undefined && global.shellProfile !== null) profileId = global.shellProfile;
    if (project.shellProfile !== undefined && project.shellProfile !== null) profileId = project.shellProfile;
    return profileId;
  })();
  const activeAccount = getActiveAccount();
  const accountDistro = accountWslDistro(activeAccount);

  // A WSL-backed account holds both Claude and the projects inside the
  // distribution, so its sessions must run there whatever shell the settings
  // name — a Windows shell cannot even chdir into a POSIX project path.
  const requestedProfile = resolveShell(accountDistro ? 'wsl:' + accountDistro : effectiveProfileId);
  if (accountDistro && !isWslShell(requestedProfile.path)) {
    return { ok: false, error: `WSL distribution "${accountDistro}" is not available` };
  }
  const shellProfile = (!accountDistro && isWslShell(requestedProfile.path) && !isPlainTerminal)
    ? resolveShell('auto')
    : requestedProfile;
  const shell = shellProfile.path;
  const shellExtraArgs = [...(shellProfile.args || [])];
  const isWsl = isWslShell(shell);
  // --cd takes the path as the distribution sees it: already POSIX for a
  // WSL-backed project, /mnt/<drive>/… for one on a Windows volume. The spawn
  // cwd itself must stay a valid Windows path, for wsl.exe rather than for the
  // shell inside it.
  if (isWsl) {
    shellExtraArgs.unshift('--cd', isPosixAbsolutePath(projectPath) ? projectPath : windowsToWslPath(projectPath));
  }
  log.info(`[shell] profile=${shellProfile.id} shell=${shell} args=${JSON.stringify(shellExtraArgs)}`);

  let knownJsonlFiles = new Set();
  let sessionSlug = null;
  let projectFolder = null;

  if (!isPlainTerminal) {
    // Snapshot existing .jsonl files before spawning (for new session + fork/plan detection)
    projectFolder = encodeProjectPath(projectPath);
    const claudeProjectDir = path.join(getProjectsDir(activeAccount), projectFolder);
    if (fs.existsSync(claudeProjectDir)) {
      try {
        knownJsonlFiles = new Set(
          fs.readdirSync(claudeProjectDir).filter(f => f.endsWith('.jsonl'))
        );
      } catch {}
    }

    // Read slug from the session's jsonl file (for plan-accept detection)
    if (!isNew) {
      try {
        const jsonlPath = path.join(claudeProjectDir, sessionId + '.jsonl');
        const head = fs.readFileSync(jsonlPath, 'utf8').slice(0, 8000);
        const firstLines = head.split('\n').filter(Boolean);
        for (const line of firstLines) {
          const entry = JSON.parse(line);
          if (entry.slug) { sessionSlug = entry.slug; break; }
        }
      } catch {}
    }
  }

  let ptyProcess;
  let mcpServer = null;
  let focusToken = null;
  try {
    if (isPlainTerminal) {
      // Plain terminal: interactive login shell, no claude command
      // Inject a shell function to override `claude` with a helpful message
      const claudeShim = 'claude() { echo "\\033[33mTo start a Claude session, use the + button in the sidebar.\\033[0m"; return 1; }; export -f claude 2>/dev/null;';
      ptyProcess = pty.spawn(shell, shellArgs(shell, undefined, shellExtraArgs), {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: isWsl ? os.homedir() : projectPath,
        env: {
          ...cleanPtyEnv,
          TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'WarpTerminal', TERM_PROGRAM_VERSION: 'v0.2026.07.30.08.12.stable_01', FORCE_COLOR: '3',
          CLAUDECODE: '1',
          // ZDOTDIR trick won't work reliably; instead inject via ENV (sh/bash) or precmd
          ENV: claudeShim,
          BASH_ENV: claudeShim,
        },
      });
      // For zsh, ENV/BASH_ENV don't apply — write the function after shell starts.
      // The Run Command rides along in this write: ordered by construction, first line after clear (ADR 0006).
      const runCommand = sessionType === RUN_TERMINAL_TYPE
        ? String(sessionOptions?.runCommand || '').trim()
        : '';
      setTimeout(() => {
        if (!ptyProcess._isDisposed) {
          try {
            ptyProcess.write(claudeShim + ' clear\n' + (runCommand ? runCommand + '\n' : ''));
          } catch {}
        }
      }, 300);
    } else {
      // Build claude command with session options
      let claudeCmd;
      if (sessionOptions?.forkFrom) {
        claudeCmd = `claude --resume "${sessionOptions.forkFrom}" --fork-session`;
      } else if (isNew) {
        claudeCmd = `claude --session-id "${sessionId}"`;
      } else {
        claudeCmd = `claude --resume "${sessionId}"`;
      }

      if (sessionOptions) {
        if (sessionOptions.dangerouslySkipPermissions) {
          claudeCmd += ' --dangerously-skip-permissions';
        } else if (sessionOptions.permissionMode) {
          claudeCmd += ` --permission-mode "${sessionOptions.permissionMode}"`;
        }
        if (sessionOptions.worktree) {
          // Ensure .claude/worktrees/ is in .gitignore so worktree dirs aren't tracked
          try {
            const gitignorePath = hostPath(projectJoin(projectPath, '.gitignore'));
            const entry = '.claude/worktrees/';
            let content = '';
            try { content = fs.readFileSync(gitignorePath, 'utf8'); } catch {}
            const lines = content.split('\n').map(l => l.trim());
            const alreadyCovered = lines.some(l => l === entry || l === '.claude/' || l === '.claude');
            if (!alreadyCovered) {
              const addition = (content.length && !content.endsWith('\n') ? '\n' : '') + entry + '\n';
              fs.appendFileSync(gitignorePath, addition, 'utf8');
            }
          } catch {}
          claudeCmd += ' --worktree';
          if (sessionOptions.worktreeName) {
            claudeCmd += ` "${sessionOptions.worktreeName}"`;
          }
        }
        if (sessionOptions.chrome) {
          claudeCmd += ' --chrome';
        }
        if (sessionOptions.addDirs) {
          const dirs = sessionOptions.addDirs.split(',').map(d => d.trim()).filter(Boolean);
          for (const dir of dirs) {
            claudeCmd += ` --add-dir "${dir}"`;
          }
        }
      }

      if (sessionOptions?.appendSystemPrompt) {
        // Write to a temp file and use shell substitution to avoid quoting issues.
        // The `cat` runs inside the distribution for a WSL session, so it needs
        // the /mnt/<drive>/… view of the Windows temp file.
        const tmpPrompt = path.join(os.tmpdir(), `switchboard-prompt-${sessionId}.md`);
        fs.writeFileSync(tmpPrompt, sessionOptions.appendSystemPrompt);
        const promptPathForShell = isWsl ? windowsToWslPath(tmpPrompt) : tmpPrompt;
        claudeCmd += ` --append-system-prompt "$(cat '${promptPathForShell}')"`;
      }

      if (sessionOptions?.preLaunchCmd) {
        claudeCmd = sessionOptions.preLaunchCmd + ' ' + claudeCmd;
      }

      // Start MCP server for this session so Claude CLI sends diffs/file opens to Switchboard
      // (skip if user disabled IDE emulation in global settings)
      if (sessionOptions?.mcpEmulation !== false) {
        try {
          // From inside a distribution the CLI resolves the IDE host itself: it
          // reads `runningInWindows` from the lock file, takes the default
          // gateway from `ip route show` and TCP-probes it. So the workspace
          // folder is reported the way a Windows IDE would (UNC), and the
          // server binds somewhere that gateway actually reaches.
          mcpServer = await startMcpServer(sessionId, [hostPath(projectPath)], mainWindow, log, {
            runningInWindows: isWsl,
            // File paths arrive from the CLI in the distribution's own form.
            // Bound to the account this session was launched under: the session
            // keeps running across an account switch, and a diff arriving after
            // one must still resolve against its own distribution.
            hostPath: (p) => accountHostPath(activeAccount, p),
          });
          claudeCmd += ' --ide';
        } catch (err) {
          log.error(`[mcp] Failed to start MCP server for ${sessionId}: ${err.message}`);
        }
      }

      // Opaque, spawn-time handle for click-to-focus. Not the session id: that key
      // is reassigned once Claude's real jsonl id is discovered (session-transitions),
      // while this token rides along on the session object and stays valid.
      focusToken = require('crypto').randomUUID();

      const ptyEnv = {
        ...cleanPtyEnv,
        TERM: 'xterm-256color', COLORTERM: 'truecolor',
        TERM_PROGRAM: 'WarpTerminal', TERM_PROGRAM_VERSION: 'v0.2026.07.30.08.12.stable_01', FORCE_COLOR: '3',
        // peon-ping click-to-focus: TERM_PROGRAM is spoofed to Warp, so peon resolves
        // the wrong bundle id. This env var is read by its notify.sh and never
        // overwritten, so it wins and routes the click back to this exact session.
        PEON_CLICK_COMMAND: `open 'wootonpad://focus/${focusToken}'`,
      };
      // A WSL account's configDir is the Windows view of ~/.claude inside the
      // distribution — meaningless as CLAUDE_CONFIG_DIR there, where that home
      // is already the default. Setting it would point Claude at a path it
      // cannot resolve.
      if (activeAccount.id !== 'default' && !accountWslDistro(activeAccount)) {
        ptyEnv.CLAUDE_CONFIG_DIR = activeAccount.configDir;
      }
      if (mcpServer) {
        ptyEnv.CLAUDE_CODE_SSE_PORT = String(mcpServer.port);
      }
      // wsl.exe hands nothing but WSLENV-listed variables to the distribution,
      // so everything the CLI reads is named there explicitly — the IDE port,
      // and the terminal identification Claude checks before emitting OSC 9
      // notifications, which would otherwise be silently dropped at the
      // boundary. USERPROFILE is deliberately absent: the CLI only scans the
      // Windows %USERPROFILE%\.claude\ide for lock files while it is unset.
      if (isWsl) {
        Object.assign(ptyEnv, withWslEnv(ptyEnv, [
          'CLAUDE_CODE_SSE_PORT',
          'TERM', 'COLORTERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'FORCE_COLOR', 'ITERM_SESSION_ID',
        ]));
      }

      // Assembled from a dozen conditionals above: reading it back is the only way
      // to tell which of them fired when a session dies at startup.
      log.info(`[claude-cmd] session=${sessionId} cmd=${JSON.stringify(claudeCmd)}`);

      ptyProcess = pty.spawn(shell, shellArgs(shell, claudeCmd, shellExtraArgs), {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: isWsl ? os.homedir() : projectPath,
        // TERM_PROGRAM=WarpTerminal: Claude Code checks this to decide whether to emit
        // OSC 9 notifications (e.g. "needs your attention"). Without it, the packaged
        // app's minimal Electron environment won't trigger those sequences.
        env: ptyEnv,
      });

    }
  } catch (err) {
    return { ok: false, error: `Error spawning PTY: ${err.message}` };
  }

  const session = {
    pty: ptyProcess, rendererAttached: true, exited: false,
    outputBuffer: [], outputBufferSize: 0, altScreen: false,
    projectPath, firstResize: true,
    projectFolder, knownJsonlFiles, sessionSlug,
    isPlainTerminal, sessionType, forkFrom: sessionOptions?.forkFrom || null,
    mcpServer, focusToken, _openedAt: Date.now(),
  };
  activeSessions.set(sessionId, session);
  // Binds this Project to its one Run Terminal, and survives the PTY's exit.
  if (sessionType === RUN_TERMINAL_TYPE) runTerminals.set(projectPath, sessionId);

  ptyProcess.onData(data => {
    const currentId = session.realSessionId || sessionId;

    // Parse OSC sequences (title changes, progress, notifications, etc.)
    if (data.includes('\x1b]')) {
      const oscMatches = data.matchAll(/\x1b\](\d+);([^\x07\x1b]*)(?:\x07|\x1b\\)/g);
      for (const m of oscMatches) {
        const code = m[1];
        const payload = m[2].slice(0, 120);
        // Detect Claude CLI busy state from OSC 0 title (spinner chars = busy, ✳ = idle)
        if (code === '0') {
          const firstChar = payload.charAt(0);
          const isBusy = firstChar.charCodeAt(0) >= 0x2800 && firstChar.charCodeAt(0) <= 0x28FF;
          const isIdle = firstChar === '\u2733'; // ✳
          log.debug(`[OSC 0] session=${currentId} char=U+${firstChar.charCodeAt(0).toString(16).toUpperCase()} busy=${isBusy} idle=${isIdle} wasBusy=${!!session._cliBusy}`);
          if (isBusy && !session._cliBusy) {
            session._cliBusy = true;
            session._oscIdle = false;
            log.debug(`[OSC 0] session=${currentId} → BUSY`);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('cli-busy-state', currentId, true);
            }
          } else if (isIdle && session._cliBusy) {
            session._cliBusy = false;
            session._oscIdle = true;
            log.debug(`[OSC 0] session=${currentId} → IDLE`);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('cli-busy-state', currentId, false);
            }
            // Context gauge fast path (VIN-143): a turn just ended, so the .jsonl's last
            // assistant usage changed. Read only its tail and push the new context, one
            // read per turn, exactly when the value moves. Never touches the CLI or
            // ~/.claude/settings.json.
            pushSessionContext(session, currentId);
          }
        }
      }
      // Parse iTerm2 OSC 9 sequences (terminated by BEL \x07 or ST \x1b\\)
      const osc9Matches = data.matchAll(/\x1b\]9;([^\x07\x1b]*)(?:\x07|\x1b\\)/g);
      for (const osc9 of osc9Matches) {
        const payload = osc9[1];
        // OSC 9;4 progress: 4;0; = clear/done, 4;1;N = running at N%, 4;2;N = error, 4;3; = indeterminate
        if (payload.startsWith('4;')) {
          const level = payload.split(';')[1];
          if (level === '0') continue; // 4;0 is also used for clearing, making it unreliable as an idle signal
          log.debug(`[OSC 9;4] session=${currentId} level=${level} payload="${payload}" wasBusy=${!!session._cliBusy}`);
          if ((level === '1' || level === '2' || level === '3') && !session._cliBusy) {
            session._cliBusy = true;
            session._oscIdle = false;
            log.debug(`[OSC 9;4] session=${currentId} → BUSY`);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('cli-busy-state', currentId, true);
            }
          }
        } else {
          // Regular notification (attention, permission, etc.)
          log.info(`[OSC 9] session=${currentId} message="${payload}"`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal-notification', currentId, payload);
          }
        }
      }
    }

    // Standalone BEL (not part of an OSC sequence)
    if (data.includes('\x07') && !data.includes('\x1b]')) {
      log.info(`[BEL] session=${currentId}`);
    }

    // Track alternate screen mode (only if data contains the marker)
    if (data.includes('\x1b[?')) {
      if (data.includes('\x1b[?1049h') || data.includes('\x1b[?47h')) {
        session.altScreen = true;
        log.info(`[altscreen] session=${currentId} ON`);
      }
      if (data.includes('\x1b[?1049l') || data.includes('\x1b[?47l')) {
        session.altScreen = false;
        log.info(`[altscreen] session=${currentId} OFF`);
      }
    }

    // Buffer output (skip resize-triggered redraws for plain terminals)
    if (!session._suppressBuffer) {
      session.outputBuffer.push(data);
      session.outputBufferSize += data.length;
      while (session.outputBufferSize > MAX_BUFFER_SIZE && session.outputBuffer.length > 1) {
        session.outputBufferSize -= session.outputBuffer.shift().length;
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', currentId, data);
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    session.exited = true;
    // The tail carries the error of whatever actually failed, which may not be Claude.
    const tail = stripAnsi((session.outputBuffer || []).join('')).slice(-600);
    log.info(
      `[pty-exit] session=${sessionId} code=${exitCode} signal=${signal ?? 'none'} ` +
      `plain=${!!session.isPlainTerminal} tail=${JSON.stringify(tail)}`
    );
    // Clean up MCP server
    const mcpId = session.realSessionId || sessionId;
    shutdownMcpServer(mcpId);
    session.mcpServer = null;

    const realId = session.realSessionId || sessionId;
    const exitInfo = { stoppedByUser: !!session._stoppedByUser, signal: signal ?? null };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process-exited', realId, exitCode, exitInfo);
      // If a fork/plan-accept transition re-keyed this session under realId
      // but the PTY exited before transition detection ran, also notify the
      // renderer for the original sessionId so it doesn't stay stuck as "Running".
      if (realId !== sessionId && activeSessions.has(sessionId)) {
        mainWindow.webContents.send('process-exited', sessionId, exitCode, exitInfo);
      }
    }
    activeSessions.delete(realId);
    // Clean up the original key too in case transition detection hasn't run yet
    activeSessions.delete(sessionId);
  });

  if (sessionOptions?.forkFrom) {
    log.info(`[fork-spawn] tempId=${sessionId} forkFrom=${sessionOptions.forkFrom} folder=${projectFolder} knownFiles=${knownJsonlFiles.size}`);
  }

  return { ok: true, reattached: false, mcpActive: !!mcpServer };
});

// --- IPC: terminal-input (fire-and-forget) ---
ipcMain.on('terminal-input', (_event, sessionId, data) => {
  const session = activeSessions.get(sessionId);
  if (session && !session.exited) {
    session.pty.write(data);
  }
});

// --- IPC: terminal-resize (fire-and-forget) ---
ipcMain.on('terminal-resize', (_event, sessionId, cols, rows) => {
  const session = activeSessions.get(sessionId);
  if (session && !session.exited) {
    // For plain terminals, suppress buffering during resize to avoid
    // accumulating prompt redraws that pollute reattach replay
    if (session.isPlainTerminal) session._suppressBuffer = true;

    session.pty.resize(cols, rows);

    if (session.isPlainTerminal) {
      setTimeout(() => { session._suppressBuffer = false; }, 200);
    }

    // First resize: nudge to force TUI redraw on reattach (skip for plain terminals — causes duplicate prompts)
    if (session.firstResize && !session.isPlainTerminal) {
      session.firstResize = false;
      setTimeout(() => {
        try {
          session.pty.resize(cols + 1, rows);
          setTimeout(() => {
            try { session.pty.resize(cols, rows); } catch {}
          }, 50);
        } catch {}
      }, 50);
    }
  }
});

// --- IPC: close-terminal ---
ipcMain.on('close-terminal', (_event, sessionId) => {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.rendererAttached = false;
    if (session.exited) {
      activeSessions.delete(sessionId);
    }
  }
});

// Session transitions → session-transitions.js
const sessionTransitions = require('./session-transitions');
sessionTransitions.init({ PROJECTS_DIR: activeProjectsDir(), activeSessions, getMainWindow: () => mainWindow, log, rekeyMcpServer });
const { detectSessionTransitions } = sessionTransitions;

// --- fs.watch on projects directory ---
let projectsWatcher = null;
let projectsPoller = null;

// How often the polling fallback sweeps the projects directory. Only used when
// a recursive fs.watch cannot be trusted — see startProjectsWatcher.
const PROJECTS_POLL_MS = 5000;

// A WSL account's projects directory is reached over the 9p share, which does
// not deliver Windows change notifications: fs.watch there succeeds and then
// stays silent, so the absence of events is not something we can detect. Sweep
// folder mtimes instead, reusing the same signal the incremental cache uses.
function startProjectsPolling(watchDir, queueFolder) {
  const { getFolderIndexMtimeMs } = require('./folder-index-state');
  let previous = null;
  let warnedSlow = false;

  const sweep = () => {
    const startedAt = Date.now();
    const current = new Map();
    let entries;
    try {
      entries = fs.readdirSync(watchDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.git') continue;
      current.set(entry.name, getFolderIndexMtimeMs(path.join(watchDir, entry.name)));
    }

    if (previous) {
      for (const [folder, mtime] of current) {
        if (previous.get(folder) !== mtime) queueFolder(folder);
      }
      for (const folder of previous.keys()) {
        if (!current.has(folder)) queueFolder(folder);
      }
    }
    previous = current;

    // The per-folder cost over 9p is the open question here; report it once
    // instead of assuming the interval is comfortable.
    const elapsed = Date.now() - startedAt;
    if (!warnedSlow && elapsed > PROJECTS_POLL_MS / 2) {
      warnedSlow = true;
      log.warn(`[watcher] polling sweep of ${current.size} folders took ${elapsed}ms (interval ${PROJECTS_POLL_MS}ms)`);
    }
  };

  // The seeding sweep is deferred rather than run inline: it stats every folder
  // over the 9p share, and startProjectsWatcher is called during app startup.
  setTimeout(sweep, 0);
  return setInterval(sweep, PROJECTS_POLL_MS);
}

function startProjectsWatcher() {
  const watchDir = activeProjectsDir();
  if (!fs.existsSync(watchDir)) return;

  const pendingFolders = new Set();
  let debounceTimer = null;

  function flushChanges() {
    debounceTimer = null;
    const folders = new Set(pendingFolders);
    pendingFolders.clear();

    let changed = false;
    for (const folder of folders) {
      const folderPath = path.join(watchDir, folder);
      if (fs.existsSync(folderPath)) {
        detectSessionTransitions(folder);
        refreshFolder(folder);
      } else {
        deleteCachedFolder(folder, getActiveAccount().id);
      }
      changed = true;
    }

    if (changed) {
      notifyRendererProjectsChanged();
    }
  }

  function queueFolder(folder) {
    if (!folder || folder === '.git') return;
    pendingFolders.add(folder);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushChanges, 500);
  }

  if (activeWslDistro()) {
    projectsPoller = startProjectsPolling(watchDir, queueFolder);
    log.info(`[watcher] WSL-backed account: polling ${watchDir} every ${PROJECTS_POLL_MS}ms`);
    return;
  }

  try {
    projectsWatcher = fs.watch(watchDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;

      // filename is relative, e.g. "folder-name/sessions-index.json" or "folder-name/abc.jsonl"
      const parts = filename.split(path.sep);
      const folder = parts[0];

      // Only care about .jsonl changes or top-level folder add/remove
      const basename = parts[parts.length - 1];
      if (parts.length !== 1 && !basename.endsWith('.jsonl')) return;

      queueFolder(folder);
    });

    projectsWatcher.on('error', (err) => {
      console.error('Projects watcher error:', err);
      if (!projectsPoller) projectsPoller = startProjectsPolling(watchDir, queueFolder);
    });
  } catch (err) {
    console.error('Failed to start projects watcher:', err);
    projectsPoller = startProjectsPolling(watchDir, queueFolder);
  }
}

function restartProjectsWatcher() {
  if (projectsWatcher) {
    projectsWatcher.close();
    projectsWatcher = null;
  }
  if (projectsPoller) {
    clearInterval(projectsPoller);
    projectsPoller = null;
  }
  startProjectsWatcher();
}

// --- IPC: app version ---
ipcMain.handle('get-app-version', () => app.getVersion());

// --- IPC: auto-updater ---
ipcMain.handle('updater-check', () => {
  if (!autoUpdater) return { available: false, dev: true };
  return autoUpdater.checkForUpdates();
});
ipcMain.handle('updater-download', () => {
  if (!autoUpdater) return;
  return autoUpdater.downloadUpdate();
});
ipcMain.handle('updater-install', () => {
  if (!autoUpdater) return;
  autoUpdater.quitAndInstall();
});

// --- App lifecycle ---
app.whenReady().then(() => {
  buildMenu();
  createWindow();
  startProjectsWatcher();

  // Both schedule modules resolve their directories per call, so schedules
  // follow the active account instead of the Windows home, and project paths
  // recorded inside a distribution are translated before any fs call. This has
  // to happen before the first use below, which writes the creator command.
  const scheduleDirs = {
    getProjectsDir: () => activeProjectsDir(),
    getCommandsDir: () => path.join(activeConfigDir(), 'commands'),
    hostPath,
    projectJoin,
  };
  scheduleIpc.configure(scheduleDirs);
  require('./schedule-runner').configure(scheduleDirs);

  scheduleIpc.ensureScheduleCreatorCommand();

  // Shared runCommand for both cron scheduler and manual "run now"
  const { spawn: cpSpawn } = require('child_process');
  function runScheduleCommand(cmd, cwd, name, onDone) {
    const globalSettings = getSetting('global') || {};
    const profileId = globalSettings.shellProfile || SETTING_DEFAULTS.shellProfile;
    // A scheduled command belongs to its project, so one in a distribution runs
    // there — the shell setting cannot chdir into a POSIX path from Windows.
    const distro = activeWslDistro();
    const inWsl = Boolean(distro) && isPosixAbsolutePath(cwd);
    const profile = resolveShell(inWsl ? 'wsl:' + distro : profileId);
    const shell = profile.path;
    const extraArgs = [...(profile.args || [])];
    if (inWsl) extraArgs.unshift('--cd', cwd);
    const args = shellArgs(shell, cmd, extraArgs);

    log.info(`[schedule] Running: ${shell} ${args.join(' ')}`);
    const child = cpSpawn(shell, args, {
      cwd: inWsl ? os.homedir() : cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...cleanPtyEnv, FORCE_COLOR: '0' },
    });

    let stderr = '';
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('exit', (code) => {
      if (stderr.trim()) log.error(`[schedule] ${name} stderr:\n${stderr.trim()}`);
      log.info(`[schedule] ${name} finished (exit ${code})`);
      if (onDone) onDone();
    });

    child.on('error', (err) => {
      log.error(`[schedule] ${name} error:`, err.message);
      if (onDone) onDone();
    });
  }

  scheduleIpc.init(log, runScheduleCommand);
  startScheduler(log, runScheduleCommand);

  // Re-index search if FTS table was recreated (e.g. tokenizer config change)
  if (searchFtsRecreated) populateCacheViaWorker();

  // Check for updates after launch
  if (autoUpdater) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(e => log.error('[updater] check failed:', e?.message || String(e))), 5000);
    // Re-check every 4 hours for long-running sessions
    setInterval(() => autoUpdater.checkForUpdates().catch(e => log.error('[updater] check failed:', e?.message || String(e))), 4 * 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Shut down all MCP servers
  shutdownAllMcp();

  // Close filesystem watcher
  if (projectsWatcher) {
    projectsWatcher.close();
    projectsWatcher = null;
  }


  // Kill all PTY processes on quit
  for (const [, session] of activeSessions) {
    if (!session.exited) {
      try { session.pty.kill(); } catch {}
    }
  }
});

// Close SQLite after all windows are closed to avoid "connection is not open" errors
app.on('will-quit', () => {
  closeDb();
});
