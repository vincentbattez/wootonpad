const { test: base, _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeProjectPath } = require('../encode-project-path');

const repoRoot = path.join(__dirname, '..');
const FIXTURE_SESSION_ID = '00000000-0000-4000-8000-000000000001';

function fixtureSessionJsonl(cwd) {
  const base = { sessionId: FIXTURE_SESSION_ID, cwd, version: '2.1.126', timestamp: '2026-01-01T00:00:00.000Z' };
  return [
    { ...base, type: 'user', message: { role: 'user', content: 'hello from the fixture' } },
    { ...base, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } },
  ].map((entry) => JSON.stringify(entry)).join('\n') + '\n';
}

// Every launch gets a throwaway HOME: the app reads ~/.claude/projects and writes
// ~/.wootonpad/switchboard.db, and tests must never touch the developer's real ones.
function makeSandboxHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-e2e-'));
  const projectPath = path.join(home, 'sample-project');
  fs.mkdirSync(projectPath, { recursive: true });

  const folder = path.join(home, '.claude', 'projects', encodeProjectPath(projectPath));
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${FIXTURE_SESSION_ID}.jsonl`), fixtureSessionJsonl(projectPath));

  return { home, projectPath };
}

const test = base.extend({
  sandbox: async ({}, use) => {
    const { home, projectPath } = makeSandboxHome();
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
    await use({ app, page, home, projectPath });
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

module.exports = { test, expect: base.expect, openTerminalSession, cols, waitForCols };
