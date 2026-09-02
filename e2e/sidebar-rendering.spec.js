const { test, expect, headerId, sessionsId, FIXTURE_SESSION_ID } = require('./app-fixture');

// Characterization (VIN-108): the sidebar tree renders Ungrouped Projects and their Sessions,
// Worktrees nested inside their Project, Slug groups, Areas, and each Project's own archive.
test.describe('sidebar rendering', () => {
  test('Ungrouped Projects and their Sessions render at the root', async ({ sandbox }) => {
    const { page, projectPath, ghostPath } = sandbox;
    await expect(page.locator(headerId(projectPath))).toBeVisible();
    // A Project whose folder is gone still lists at the root.
    await expect(page.locator(headerId(ghostPath))).toBeVisible();
    await expect(page.locator('#si-' + FIXTURE_SESSION_ID)).toBeVisible();
  });

  test('a Worktree renders nested inside its parent Project', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    const nested = page.locator(`${sessionsId(projectPath)} .worktree-header`);
    await expect(nested).toBeVisible();
    await expect(page.locator(`${sessionsId(projectPath)} .worktree-name`)).toHaveText('feature-x');
  });

  test('two Sessions under one Slug render as a Slug group', async ({ sandbox }) => {
    const { page, slugProjectPath } = sandbox;
    await expect(page.locator(headerId(slugProjectPath))).toBeVisible();
    await expect(page.locator(`${sessionsId(slugProjectPath)} .slug-group`)).toBeVisible();
  });

  test('a created Area renders as a group in the tree', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.click('#filters-btn');
    await page.click('#add-area-btn'); // creates the Area, then drops into inline naming
    await expect(page.locator('.area-group')).toBeVisible();
    await expect(page.locator('.area-name-input')).toBeVisible();
  });

  test('archiving a Session reveals its Project archive', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    const row = page.locator('#si-' + FIXTURE_SESSION_ID);
    await row.hover();
    await row.locator('.session-archive-btn').click();

    const archiveToggle = page.locator(`${sessionsId(projectPath)} .sessions-archive-toggle`);
    await expect(archiveToggle).toBeVisible();
    await expect(archiveToggle).toContainText('archived');
  });
});
