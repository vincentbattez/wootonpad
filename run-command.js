// Single place where the decision to run a Project is made.
// Pure Node — no fs, no Electron: the caller injects everything (see docs/adr/0006).

const RUN_TERMINAL_TYPE = 'run-terminal';

// Identity is type + Project, never a renameable summary. A click never restarts a server.
function resolveRunTerminal(settings = {}, env = {}) {
  const command = typeof settings.runCommand === 'string' ? settings.runCommand.trim() : '';
  if (!command) return { ok: false, reason: 'not-configured' };
  if (!env.folderExists) return { ok: false, reason: 'missing-folder' };

  const projectPath = settings.projectPath || '';
  const mine = (env.sessions || []).filter(
    s => s && s.type === RUN_TERMINAL_TYPE && s.projectPath === projectPath
  );

  const live = mine.find(s => !s.exited);
  if (live) return { ok: true, action: 'focus', sessionId: live.sessionId };
  if (mine.length) return { ok: true, action: 'reuse', sessionId: mine[0].sessionId, command };

  return { ok: true, action: 'launch', command };
}

module.exports = { resolveRunTerminal, RUN_TERMINAL_TYPE };
