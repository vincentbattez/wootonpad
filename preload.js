const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Resolved synchronously so the root class is posed before the first paint.
let initialAppearance;
try {
  initialAppearance = ipcRenderer.sendSync('get-appearance-sync');
} catch {
  initialAppearance = null;
}
contextBridge.exposeInMainWorld('appearance', initialAppearance);

contextBridge.exposeInMainWorld('api', {
  applyAppearance: () => ipcRenderer.invoke('apply-appearance'),
  onAppearanceChanged: (callback) => {
    ipcRenderer.on('appearance-changed', (_event, appearance) => callback(appearance));
  },

  // Invoke (request-response)
  getPlans: () => ipcRenderer.invoke('get-plans'),
  readPlan: (filename) => ipcRenderer.invoke('read-plan', filename),
  savePlan: (filePath, content) => ipcRenderer.invoke('save-plan', filePath, content),
  getStats: () => ipcRenderer.invoke('get-stats'),
  refreshStats: () => ipcRenderer.invoke('refresh-stats'),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  getCachedUsage: () => ipcRenderer.invoke('get-cached-usage'),
  getMemories: () => ipcRenderer.invoke('get-memories'),
  readMemory: (filePath) => ipcRenderer.invoke('read-memory', filePath),
  saveMemory: (filePath, content) => ipcRenderer.invoke('save-memory', filePath, content),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  getActiveSessions: () => ipcRenderer.invoke('get-active-sessions'),
  getActiveTerminals: () => ipcRenderer.invoke('get-active-terminals'),
  stopSession: (id) => ipcRenderer.invoke('stop-session', id),
  toggleStar: (id) => ipcRenderer.invoke('toggle-star', id),
  renameSession: (id, name) => ipcRenderer.invoke('rename-session', id, name),
  archiveSession: (id, archived) => ipcRenderer.invoke('archive-session', id, archived),
  openTerminal: (id, projectPath, isNew, sessionOptions) => ipcRenderer.invoke('open-terminal', id, projectPath, isNew, sessionOptions),
  search: (type, query, titleOnly) => ipcRenderer.invoke('search', type, query, titleOnly),
  readSessionJsonl: (sessionId) => ipcRenderer.invoke('read-session-jsonl', sessionId),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  deleteSetting: (key) => ipcRenderer.invoke('delete-setting', key),

  // Multi-account
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  saveAccounts: (accounts) => ipcRenderer.invoke('save-accounts', accounts),
  createAccount: (name) => ipcRenderer.invoke('create-account', name),
  discoverWslClaudeHomes: () => ipcRenderer.invoke('discover-wsl-claude-homes'),
  createWslAccount: (distro, name) => ipcRenderer.invoke('create-wsl-account', distro, name),
  renameAccount: (id, name) => ipcRenderer.invoke('rename-account', id, name),
  deleteAccount: (id) => ipcRenderer.invoke('delete-account', id),
  getActiveAccountId: () => ipcRenderer.invoke('get-active-account-id'),
  setActiveAccountId: (id) => ipcRenderer.invoke('set-active-account-id', id),
  getAccountsUsage: () => ipcRenderer.invoke('get-accounts-usage'),
  getHomedir: () => ipcRenderer.invoke('get-homedir'),
  getEffectiveSettings: (projectPath) => ipcRenderer.invoke('get-effective-settings', projectPath),
  getScheduleCreatorCommand: () => ipcRenderer.invoke('get-schedule-creator-command'),
  createScheduleSession: (projectPath) => ipcRenderer.invoke('create-schedule-session', projectPath),
  runScheduleNow: (filePath) => ipcRenderer.invoke('run-schedule-now', filePath),
  getShellProfiles: () => ipcRenderer.invoke('get-shell-profiles'),

  browseFolder: () => ipcRenderer.invoke('browse-folder'),
  addProject: (projectPath) => ipcRenderer.invoke('add-project', projectPath),
  removeProject: (projectPath) => ipcRenderer.invoke('remove-project', projectPath),
  renameProject: (projectPath, name) => ipcRenderer.invoke('rename-project', projectPath, name),
  getProjectInfo: (projectPath) => ipcRenderer.invoke('get-project-info', projectPath),
  getProjectOverview: (projectPath) => ipcRenderer.invoke('get-project-overview', projectPath),
  getProjectGitCache: (projectPath) => ipcRenderer.invoke('get-project-git-cache', projectPath),
  getFileDiff: (projectPath, filePath) => ipcRenderer.invoke('get-file-diff', projectPath, filePath),
  gitBranches: (projectPath) => ipcRenderer.invoke('git-branches', projectPath),
  gitCheckout: (projectPath, branch) => ipcRenderer.invoke('git-checkout', projectPath, branch),
  gitFetch: (projectPath) => ipcRenderer.invoke('git-fetch', projectPath),
  gitPull: (projectPath) => ipcRenderer.invoke('git-pull', projectPath),
  gitCommit: (projectPath, message) => ipcRenderer.invoke('git-commit', projectPath, message),
  gitPush: (projectPath) => ipcRenderer.invoke('git-push', projectPath),
  gitCreateBranch: (projectPath, branchName, checkout) => ipcRenderer.invoke('git-create-branch', projectPath, branchName, checkout),
  getAreas: () => ipcRenderer.invoke('get-areas'),
  createArea: (name, parentId) => ipcRenderer.invoke('create-area', name, parentId),
  renameArea: (id, name) => ipcRenderer.invoke('rename-area', id, name),
  setAreaCollapsed: (id, collapsed) => ipcRenderer.invoke('set-area-collapsed', id, collapsed),
  deleteArea: (id) => ipcRenderer.invoke('delete-area', id),
  moveArea: (id, parentId) => ipcRenderer.invoke('move-area', id, parentId),
  fileProject: (projectPath, areaId) => ipcRenderer.invoke('file-project', projectPath, areaId),
  getAreaAvatar: (areaId) => ipcRenderer.invoke('get-area-avatar', areaId),
  setAreaImage: (areaId, filePath) => ipcRenderer.invoke('set-area-image', areaId, filePath),
  clearAreaImage: (areaId) => ipcRenderer.invoke('clear-area-image', areaId),
  getProjectAvatar: (projectPath) => ipcRenderer.invoke('get-project-avatar', projectPath),
  fetchGitlabAvatar: (projectPath, remoteUrl) => ipcRenderer.invoke('fetch-gitlab-avatar', projectPath, remoteUrl),
  gitGenerateCommitMsg: (projectPath, style) => ipcRenderer.invoke('git-generate-commit-msg', projectPath, style),
  getGitUserInfo: (projectPath) => ipcRenderer.invoke('get-git-user-info', projectPath),
  deleteWorktree: (projectPath, worktreePath) => ipcRenderer.invoke('delete-worktree', projectPath, worktreePath),
  getFileTree: (projectPath) => ipcRenderer.invoke('get-file-tree', projectPath),
  getProjectSessions: (projectPath) => ipcRenderer.invoke('get-project-sessions', projectPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openInExternalIde: (projectPath) => ipcRenderer.invoke('open-in-external-ide', projectPath),
  openProjectFolder: (projectPath) => ipcRenderer.invoke('open-project-folder', projectPath),
  runProject: (projectPath) => ipcRenderer.invoke('run-project', projectPath),
  forgetRunTerminal: (sessionId) => ipcRenderer.invoke('forget-run-terminal', sessionId),

  // Send (fire-and-forget)
  sendInput: (id, data) => ipcRenderer.send('terminal-input', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal-resize', id, cols, rows),
  closeTerminal: (id) => ipcRenderer.send('close-terminal', id),

  // Listeners (main → renderer)
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal-data', (_event, sessionId, data) => callback(sessionId, data));
  },
  onSessionDetected: (callback) => {
    ipcRenderer.on('session-detected', (_event, tempId, realId) => callback(tempId, realId));
  },
  onProcessExited: (callback) => {
    ipcRenderer.on('process-exited', (_event, sessionId, exitCode, info) => callback(sessionId, exitCode, info));
  },
  onTerminalNotification: (callback) => {
    ipcRenderer.on('terminal-notification', (_event, sessionId, message) => callback(sessionId, message));
  },
  onCliBusyState: (callback) => {
    ipcRenderer.on('cli-busy-state', (_event, sessionId, busy) => callback(sessionId, busy));
  },
  onSessionContext: (callback) => {
    ipcRenderer.on('session-context', (_event, sessionId, usage, model) => callback(sessionId, usage, model));
  },
  onSessionForked: (callback) => {
    ipcRenderer.on('session-forked', (_event, oldId, newId) => callback(oldId, newId));
  },
  onProjectsChanged: (callback) => {
    ipcRenderer.on('projects-changed', () => callback());
  },
  onProjectInfoUpdated: (callback) => {
    ipcRenderer.on('project-info-updated', (_event, path, data) => callback(path, data));
  },
  onProjectInfoLoading: (callback) => {
    ipcRenderer.on('project-info-loading', (_event, path) => callback(path));
  },
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (_event, text, type) => callback(text, type));
  },

  // File drag-and-drop
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Platform
  platform: process.platform,

  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Auto-updater
  updaterCheck: () => ipcRenderer.invoke('updater-check'),
  updaterDownload: () => ipcRenderer.invoke('updater-download'),
  updaterInstall: () => ipcRenderer.invoke('updater-install'),
  onUpdaterEvent: (callback) => {
    ipcRenderer.on('updater-event', (_event, type, data) => callback(type, data));
  },

  // MCP bridge (main → renderer)
  onMcpOpenDiff: (callback) => {
    ipcRenderer.on('mcp-open-diff', (_event, sessionId, diffId, data) => callback(sessionId, diffId, data));
  },
  onMcpOpenFile: (callback) => {
    ipcRenderer.on('mcp-open-file', (_event, sessionId, data) => callback(sessionId, data));
  },
  onMcpCloseAllDiffs: (callback) => {
    ipcRenderer.on('mcp-close-all-diffs', (_event, sessionId) => callback(sessionId));
  },
  onMcpCloseTab: (callback) => {
    ipcRenderer.on('mcp-close-tab', (_event, sessionId, diffId) => callback(sessionId, diffId));
  },

  // MCP bridge (renderer → main)
  mcpDiffResponse: (sessionId, diffId, action, editedContent) => {
    ipcRenderer.send('mcp-diff-response', sessionId, diffId, action, editedContent);
  },
  readFileForPanel: (filePath) => ipcRenderer.invoke('read-file-for-panel', filePath),
  saveFileForPanel: (filePath, content) => ipcRenderer.invoke('save-file-for-panel', filePath, content),
  watchFile: (filePath) => ipcRenderer.invoke('watch-file', filePath),
  unwatchFile: (filePath) => ipcRenderer.invoke('unwatch-file', filePath),
  onFileChanged: (callback) => {
    ipcRenderer.on('file-changed', (_event, filePath) => callback(filePath));
  },
  onLaunchProjectSession: (callback) => {
    ipcRenderer.on('launch-project-session', (_event, projectPath, continueSession) => callback(projectPath, continueSession));
  },
  onFocusSession: (callback) => {
    ipcRenderer.on('focus-session', (_event, sessionId) => callback(sessionId));
  },
});
