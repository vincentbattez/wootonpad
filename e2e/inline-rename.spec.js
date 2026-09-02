const { test, expect, headerId, FIXTURE_SESSION_ID } = require('./app-fixture');

// Characterization (VIN-108): inline rename on a Project, an Area and a Session.
test.describe('inline rename', () => {
  test('a Project enters and leaves inline rename', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    const header = page.locator(headerId(projectPath));
    await header.waitFor();
    await header.hover();
    await header.locator('.project-menu-btn').click();
    await page.locator('.project-menu .project-rename-btn').click();

    const input = header.locator('.project-name-input');
    await expect(input).toBeVisible();
    await input.press('Escape');
    await expect(input).toBeHidden();
    await expect(header.locator('.project-name')).toBeVisible();
  });

  test('an Area is renamed inline', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.click('#filters-btn');
    await page.click('#add-area-btn'); // creates the Area and drops into inline naming
    const input = page.locator('.area-name-input');
    await expect(input).toBeVisible();
    await input.fill('Renamed Area');
    await input.press('Enter');

    await expect(page.locator('.area-name')).toHaveText('Renamed Area');
  });

  test('a Session is renamed inline', async ({ sandbox }) => {
    const { page } = sandbox;
    const row = page.locator('#si-' + FIXTURE_SESSION_ID);
    await row.locator('.session-summary').dblclick();

    const input = row.locator('.session-rename-input');
    await expect(input).toBeVisible();
    await input.fill('Renamed Session');
    await input.press('Enter');

    await expect(row.locator('.session-summary')).toContainText('Renamed Session');
  });
});
