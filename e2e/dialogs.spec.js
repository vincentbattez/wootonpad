const { test, expect } = require('./app-fixture');

// Characterization (VIN-108): the four dialogs — New Session, Resume Session, Add Project and
// Area — open and dismiss. New Session and Resume Session are opened through the frozen
// window.vueDialogs bridge that public/app.js uses; the others through their own gestures.
test.describe('dialogs', () => {
  test('the Add Project dialog opens and closes', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.click('#add-project-btn');
    const dialog = page.locator('.add-project-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h3')).toHaveText('Add Project');

    await dialog.locator('.add-project-cancel-btn').click();
    await expect(dialog).toBeHidden();
  });

  test('the New Session dialog opens and Escape closes it', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    await page.evaluate((p) => window.vueDialogs.openNewSession({ projectPath: p }, {}, () => {}), projectPath);
    const heading = page.getByRole('heading', { name: /^New Session/ });
    await expect(heading).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(heading).toBeHidden();
  });

  test('the Resume Session dialog opens and Escape closes it', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    await page.evaluate(
      (p) => window.vueDialogs.openResumeSession({ sessionId: 'x', projectPath: p, summary: 'hi', name: 'hi' }, {}, () => {}),
      projectPath,
    );
    const heading = page.getByRole('heading', { name: /^Resume Session/ });
    await expect(heading).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(heading).toBeHidden();
  });

  test('the Area dialog opens from an Area', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.click('#filters-btn');
    await page.click('#add-area-btn'); // creates the Area and drops into inline naming
    const nameInput = page.locator('.area-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.press('Enter'); // commit the placeholder name, leaving rename mode

    const areaHeader = page.locator('.area-header').first();
    await areaHeader.hover();
    await areaHeader.locator('.area-edit-btn').click();

    const dialog = page.locator('.area-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h3')).toHaveText('Area');

    await dialog.locator('.add-project-cancel-btn').click();
    await expect(dialog).toBeHidden();
  });
});
