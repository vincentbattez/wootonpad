// --- Dialogs & session launch helpers ---
// Depends on globals: launchNewSession, cachedProjects, sessionMap,
// pendingSessions, openSessions, activePtyIds, refreshSidebar, pollActiveSessions (app.js)
// Depends on: ICONS (icons.js)

// --- New session dialog ---
async function resolveDefaultSessionOptions(project) {
  const effective = await window.api.getEffectiveSettings(project.projectPath);
  const options = {};
  if (effective.dangerouslySkipPermissions) {
    options.dangerouslySkipPermissions = true;
  } else if (effective.permissionMode) {
    options.permissionMode = effective.permissionMode;
  }
  if (effective.worktree) {
    options.worktree = true;
    if (effective.worktreeName) options.worktreeName = effective.worktreeName;
  }
  if (effective.chrome) options.chrome = true;
  if (effective.preLaunchCmd) options.preLaunchCmd = effective.preLaunchCmd;
  if (effective.addDirs) options.addDirs = effective.addDirs;
  if (effective.mcpEmulation === false) options.mcpEmulation = false;
  return options;
}

async function forkSession(session, project) {
  const options = await resolveDefaultSessionOptions(project);
  options.forkFrom = session.sessionId;
  launchNewSession(project, options);
}

async function launchScheduleCreator(project) {
  const options = await resolveDefaultSessionOptions(project);
  // Pre-create a JSONL session with the schedule creation prompt, then resume into it
  const result = await window.api.createScheduleSession(project.projectPath);
  if (!result || !result.sessionId) return;

  const session = {
    sessionId: result.sessionId,
    summary: 'Create scheduled task',
    firstPrompt: '',
    projectPath: project.projectPath,
    name: null,
    starred: 0,
    archived: 0,
    messageCount: 1,
    modified: new Date().toISOString(),
    created: new Date().toISOString(),
  };

  // Inject into sidebar
  const folder = encodeProjectPath(project.projectPath);
  pendingSessions.set(result.sessionId, { session, projectPath: project.projectPath, folder });
  sessionMap.set(result.sessionId, session);
  let proj = cachedProjects.find(p => p.projectPath === project.projectPath);
  if (!proj) {
    proj = { folder, projectPath: project.projectPath, sessions: [] };
    cachedProjects.unshift(proj);
  }
  proj.sessions.unshift(session);
  refreshSidebar();

  const entry = createTerminalEntry(session);
  // Resume the pre-seeded session
  options.appendSystemPrompt = result.systemPrompt;
  const openResult = await window.api.openTerminal(result.sessionId, project.projectPath, false, options);
  if (!openResult.ok) {
    entry.terminal.write(`\r\nError: ${openResult.error}\r\n`);
    entry.closed = true;
    return;
  }
  if (typeof setSessionMcpActive === 'function') setSessionMcpActive(result.sessionId, !!openResult.mcpActive);
  showSession(result.sessionId);
  pollActiveSessions();
}

async function showNewSessionPopover(project, anchorEl) {
  const callbacks = {
    onClaude: async (proj) => { launchNewSession(proj, await resolveDefaultSessionOptions(proj)); },
    onClaudeConfig: (proj) => showNewSessionDialog(proj),
    onTerminal: (proj) => launchTerminalSession(proj),
  };
  window.vueDialogs?.openPopover(project, anchorEl, callbacks);
}

// Both kinds of internal terminal take this path: a Run Terminal differs only by
// its type, its label, and the Run Command written into it (ADR 0006).
async function spawnInternalTerminal(projectPath, { sessionId = crypto.randomUUID(), type = 'terminal', summary = 'Terminal', runCommand } = {}) {
  const session = {
    sessionId,
    summary,
    firstPrompt: '',
    projectPath,
    name: null,
    starred: 0,
    archived: 0,
    messageCount: 0,
    modified: new Date().toISOString(),
    created: new Date().toISOString(),
    type,
  };

  // Track as pending
  const folder = encodeProjectPath(projectPath);
  pendingSessions.set(sessionId, { session, projectPath, folder });

  // Inject into cached project data
  sessionMap.set(sessionId, session);
  let proj = cachedProjects.find(p => p.projectPath === projectPath);
  if (!proj) {
    proj = { folder, projectPath, sessions: [] };
    cachedProjects.unshift(proj);
  }
  proj.sessions = proj.sessions.filter(s => s.sessionId !== sessionId);
  proj.sessions.unshift(session);
  refreshSidebar();

  const entry = createTerminalEntry(session);

  const result = await window.api.openTerminal(sessionId, projectPath, true, { type, runCommand });
  if (!result.ok) {
    entry.terminal.write(`\r\nError: ${result.error}\r\n`);
    entry.closed = true;
    return;
  }

  showSession(sessionId);
  pollActiveSessions();
}

async function launchTerminalSession(project) {
  await spawnInternalTerminal(project.projectPath);
}

// Reuse revives the tab in place: the same sessionId keeps this Project's single
// Run Terminal single, alive or being relaunched.
async function launchRunTerminal(projectPath, command, sessionId) {
  if (sessionId) destroySession(sessionId);
  await spawnInternalTerminal(projectPath, {
    sessionId,
    type: 'run-terminal',
    summary: 'Run',
    runCommand: command,
  });
}

async function showNewSessionDialog(project) {
  const effective = await window.api.getEffectiveSettings(project.projectPath);
  window.vueDialogs?.openNewSession(project, effective, (options) => launchNewSession(project, options));
}

async function showResumeSessionDialog(session) {
  const effective = await window.api.getEffectiveSettings(session.projectPath);
  window.vueDialogs?.openResumeSession(session, effective, (options) => openSession(session, options));
}

function showAddProjectDialog() {
  window.vueDialogs?.openAddProject(async () => { await loadProjects(); });
}
