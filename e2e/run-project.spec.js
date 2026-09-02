const { test, expect, headerId } = require('./app-fixture');

// A marker the shell will echo, so the assertion reads the real PTY output
// rather than the command the renderer believes it sent.
const MARKER = 'WOOTON_RUN_MARKER_OK';

async function setRunCommand(page, projectPath, command) {
  await page.evaluate(([p, cmd]) =>
    window.api.setSetting('project:' + p, { runCommand: cmd }), [projectPath, command]);
}

async function clickRun(page, projectPath) {
  const header = page.locator(headerId(projectPath));
  await header.waitFor();
  await header.hover();
  await header.locator('.project-menu-btn').click();
  await page.locator('.project-menu .project-run-btn').click();
}

// xterm renders to a canvas, so the assertion reads its buffer, not the DOM.
const terminalText = (page, sessionId) => page.evaluate((id) => {
  const buffer = window._openSessions.get(id)?.terminal?.buffer?.active;
  if (!buffer) return '';
  const lines = [];
  for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
  return lines.join('\n');
}, sessionId);

const runTerminalIds = (page) =>
  page.evaluate(() => [...window._openSessions.entries()]
    .filter(([, entry]) => entry.session?.type === 'run-terminal')
    .map(([id]) => id));

test.describe('Run Project', () => {
  test('the Run Command reaches the shell, and a second click opens no second terminal', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    await setRunCommand(page, projectPath, `echo ${MARKER}`);

    await clickRun(page, projectPath);

    await expect.poll(() => runTerminalIds(page)).toHaveLength(1);
    const [first] = await runTerminalIds(page);

    // The command is written into the login shell, so it shows up echoed and run.
    await expect.poll(() => terminalText(page, first), { timeout: 20_000 }).toContain(MARKER);

    await clickRun(page, projectPath);

    await expect.poll(() => runTerminalIds(page)).toEqual([first]);
  });

  test('a Project with no Run Command opens its settings instead of a terminal', async ({ page, sandbox }) => {
    const { page: appPage, projectPath } = sandbox;
    await setRunCommand(appPage, projectPath, '');

    await clickRun(appPage, projectPath);

    await expect(appPage.locator('.settings-panel')).toBeVisible();
    expect(await runTerminalIds(appPage)).toEqual([]);
  });

  test('a Project whose folder is gone reports the failure and opens no terminal', async ({ sandbox }) => {
    const { page, ghostPath } = sandbox;
    await setRunCommand(page, ghostPath, `echo ${MARKER}`);

    await clickRun(page, ghostPath);

    await expect(page.locator('#status-bar')).toContainText('no longer exists');
    expect(await runTerminalIds(page)).toEqual([]);
  });
});
