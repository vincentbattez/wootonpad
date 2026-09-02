const { test, expect, headerId } = require('./app-fixture');

// The OS open API is the boundary with the outside world. Replaced by a recorder in the
// main process before any click, so the suite never opens a burst of Finder windows.
async function recordOpenPath(app) {
  await app.evaluate(({ shell }) => {
    globalThis.__openedPaths = [];
    shell.openPath = async (p) => { globalThis.__openedPaths.push(p); return ''; };
  });
}

const openedPaths = (app) => app.evaluate(() => globalThis.__openedPaths);

async function clickFolderButton(page, projectPath) {
  const header = page.locator(headerId(projectPath));
  await header.waitFor();
  await header.hover();
  await header.locator('.project-menu-btn').click();
  await page.locator('.project-menu .project-folder-btn').click();
}

test.describe('Open Project Folder', () => {
  test('a Project header hands its own path to the system', async ({ sandbox }) => {
    const { app, page, projectPath } = sandbox;
    await recordOpenPath(app);

    await clickFolderButton(page, projectPath);

    await expect.poll(() => openedPaths(app)).toEqual([projectPath]);
  });

  // The one real trap: a Worktree Project must open its own tree, not its parent's.
  test('a Worktree Project header opens the worktree, not its parent', async ({ sandbox }) => {
    const { app, page, worktreePath } = sandbox;
    await recordOpenPath(app);

    await clickFolderButton(page, worktreePath);

    await expect.poll(() => openedPaths(app)).toEqual([worktreePath]);
  });

  test('a Project whose folder is gone opens nothing and reports the failure', async ({ sandbox }) => {
    const { app, page, ghostPath } = sandbox;
    await recordOpenPath(app);

    await clickFolderButton(page, ghostPath);

    await expect(page.locator('#status-bar')).toContainText('no longer exists');
    expect(await openedPaths(app)).toEqual([]);
  });

  test('clicking the button does not collapse the Project', async ({ sandbox }) => {
    const { app, page, projectPath } = sandbox;
    await recordOpenPath(app);

    const header = page.locator(headerId(projectPath));
    await header.waitFor();
    const before = await header.evaluate((el) => el.classList.contains('collapsed'));

    await clickFolderButton(page, projectPath);

    await expect.poll(() => openedPaths(app)).toHaveLength(1);
    expect(await header.evaluate((el) => el.classList.contains('collapsed'))).toBe(before);
  });
});
