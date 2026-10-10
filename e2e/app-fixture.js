const { test: base, _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeProjectPath } = require('../encode-project-path');

const repoRoot = path.join(__dirname, '..');
const FIXTURE_SESSION_ID = '00000000-0000-4000-8000-000000000001';
const WORKTREE_SESSION_ID = '00000000-0000-4000-8000-000000000002';
const GHOST_SESSION_ID = '00000000-0000-4000-8000-000000000003';
// Two Sessions sharing a Slug: a lineage groups only when it carries more than one.
const SLUG_SESSION_A = '00000000-0000-4000-8000-000000000004';
const SLUG_SESSION_B = '00000000-0000-4000-8000-000000000005';
const SLUG_NAME = 'shared-lineage';
// A Session that carries a usage block, so its context gauge has a value at rest (VIN-149).
const GAUGE_SESSION_ID = '00000000-0000-4000-8000-000000000006';

// The assistant turn's usage block, in Claude Code's raw jsonl shape (read-session-file.js
// reads input_tokens etc). Given a usage, the fixture writes a gauge-bearing Session; without
// one the assistant turn stays plain, as the characterization suite has always seeded it.
function assistantMessage(usage, model) {
  const message = { role: 'assistant', content: [{ type: 'text', text: 'hi' }] };
  if (usage) { message.usage = usage; message.model = model || 'claude-opus-4-1'; }
  return message;
}

// `slug` is read off the jsonl entries (read-session-file.js); the rest of the shape mirrors
// what Claude Code writes. `modified` is the file mtime, so a freshly-seeded Session reads recent.
function fixtureSessionJsonl(cwd, sessionId = FIXTURE_SESSION_ID, { slug = null, usage = null, model = null } = {}) {
  const base = { sessionId, cwd, version: '2.1.126', timestamp: '2026-01-01T00:00:00.000Z', ...(slug ? { slug } : {}) };
  return [
    { ...base, type: 'user', message: { role: 'user', content: 'hello from the fixture' } },
    { ...base, type: 'assistant', message: assistantMessage(usage, model) },
  ].map((entry) => JSON.stringify(entry)).join('\n') + '\n';
}

// Append an assistant turn carrying a usage block to a seeded Session's .jsonl — the way a live
// turn grows the transcript (VIN-149). The path mirrors seedSession's, so a test drives the
// real fs.watch → live push → gauge chain by writing the same file the app is watching.
function appendAssistantUsage(home, cwd, sessionId, usage, model = 'claude-opus-4-1') {
  const folder = path.join(home, '.claude', 'projects', encodeProjectPath(cwd));
  const line = JSON.stringify({
    sessionId, cwd, type: 'assistant', message: assistantMessage(usage, model),
  }) + '\n';
  fs.appendFileSync(path.join(folder, `${sessionId}.jsonl`), line);
}

// Every launch gets a throwaway HOME: the app reads ~/.claude/projects and writes
// ~/.wootonpad/switchboard.db, and tests must never touch the developer's real ones.
function makeSandboxHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-e2e-'));
  const projectsRoot = path.join(home, '.claude', 'projects');

  const seedSession = (cwd, sessionId, opts = {}) => {
    const folder = path.join(projectsRoot, encodeProjectPath(cwd));
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `${sessionId}.jsonl`), fixtureSessionJsonl(cwd, sessionId, opts));
  };

  const projectPath = path.join(home, 'sample-project');
  const worktreePath = path.join(projectPath, '.claude', 'worktrees', 'feature-x');
  // Never created on disk: a Project still listed in the sidebar whose folder is gone.
  const ghostPath = path.join(home, 'ghost-project');
  // A Project holding two Sessions under one Slug, so the sidebar renders a Slug group.
  const slugProjectPath = path.join(home, 'slug-project');
  // A Project whose Session carries a usage block, so its gauge has a value at rest (VIN-149).
  const gaugeProjectPath = path.join(home, 'gauge-project');

  fs.mkdirSync(worktreePath, { recursive: true });
  seedSession(projectPath, FIXTURE_SESSION_ID);
  seedSession(worktreePath, WORKTREE_SESSION_ID);
  seedSession(ghostPath, GHOST_SESSION_ID);
  seedSession(slugProjectPath, SLUG_SESSION_A, { slug: SLUG_NAME });
  seedSession(slugProjectPath, SLUG_SESSION_B, { slug: SLUG_NAME });
  // 100k tokens at rest, so the gauge reads "100k" before the test grows the file.
  seedSession(gaugeProjectPath, GAUGE_SESSION_ID, { usage: { input_tokens: 100000 } });

  // A Plan and a global Agent File on disk, so the Plans and Agent Files viewers have
  // something to open. Plans live in ~/.claude/plans; global Agent Files are the .md files
  // sitting directly in ~/.claude (main.js: activePlansDir / scanMdFiles of the config dir).
  const claudeDir = path.join(home, '.claude');
  const plansDir = path.join(claudeDir, 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  const planFile = path.join(plansDir, 'sample-plan.md');
  fs.writeFileSync(planFile, '# Sample Plan\n\nA seeded plan for the characterization suite.\n');
  const agentFile = path.join(claudeDir, 'CLAUDE.md');
  fs.writeFileSync(agentFile, '# Seeded Agent File\n\nGlobal instructions for the fixture.\n');

  return { home, projectPath, worktreePath, ghostPath, slugProjectPath, gaugeProjectPath, planFile, agentFile };
}

const test = base.extend({
  sandbox: async ({}, use) => {
    const { home, projectPath, worktreePath, ghostPath, slugProjectPath, gaugeProjectPath, planFile, agentFile } = makeSandboxHome();
    const app = await electron.launch({
      // --user-data-dir is required on top of HOME: on macOS Electron resolves its own
      // paths from the OS home, not from $HOME, so without it the test instance loses
      // the single-instance lock to a running WootonPad and quits on startup.
      args: [repoRoot, `--user-data-dir=${path.join(home, 'electron-user-data')}`],
      cwd: repoRoot,
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    const page = await app.firstWindow();
    await page.waitForSelector('#terminals');
    await use({ app, page, home, projectPath, worktreePath, ghostPath, slugProjectPath, gaugeProjectPath, planFile, agentFile });
    await app.close();
    fs.rmSync(home, { recursive: true, force: true });
  },
});

function cols(page, sessionId) {
  return page.evaluate((id) => window._openSessions.get(id)?.terminal.cols ?? 0, sessionId);
}

function waitForCols(page, sessionId, { above = -1, equals = null } = {}) {
  return page.waitForFunction(
    ([id, min, exact]) => {
      const c = window._openSessions.get(id)?.terminal.cols ?? 0;
      return exact === null ? c > min : c === exact;
    },
    [sessionId, above, equals],
  );
}

// Open a shell-backed Session and wait until its terminal is sized.
// Uses the renderer's own entry point; the behaviour under test is driven by real clicks.
async function openTerminalSession({ page, projectPath }) {
  const sessionId = await page.evaluate(async (p) => {
    const before = new Set(window._openSessions.keys());
    await window.launchTerminalSession({ projectPath: p });
    return [...window._openSessions.keys()].find((id) => !before.has(id));
  }, projectPath);

  await waitForCols(page, sessionId, { above: 0 });
  return sessionId;
}

// Mirrors ProjectGroup.vue's folderId — the sidebar header and Sessions-list DOM ids.
const folderId = (projectPath) => 'project-' + projectPath.replace(/[^a-zA-Z0-9_-]/g, '_');
const headerId = (projectPath) => '#ph-' + folderId(projectPath);
const sessionsId = (projectPath) => '#sessions-' + folderId(projectPath);

module.exports = {
  test,
  expect: base.expect,
  openTerminalSession,
  cols,
  waitForCols,
  headerId,
  sessionsId,
  appendAssistantUsage,
  FIXTURE_SESSION_ID,
  WORKTREE_SESSION_ID,
  SLUG_SESSION_A,
  SLUG_SESSION_B,
  SLUG_NAME,
  GAUGE_SESSION_ID,
};
