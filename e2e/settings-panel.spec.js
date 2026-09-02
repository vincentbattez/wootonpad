const { test, expect, headerId } = require('./app-fixture');

// Characterization (VIN-108): the Settings panel opens both globally and per-Project, and a
// per-Project override is written through and persisted.
test.describe('settings panel', () => {
  test('global settings open from the gear', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.click('#global-settings-btn');
    await expect(page.locator('.settings-panel')).toBeVisible();
    await expect(page.locator('.settings-panel-title')).toContainText('Global Settings');
  });

  test('a per-Project override is set and persisted', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    const header = page.locator(headerId(projectPath));
    await header.waitFor();
    await header.hover();
    await header.locator('.project-menu-btn').click();
    await page.locator('.project-menu .project-settings-btn').click();

    await expect(page.locator('.settings-panel')).toBeVisible();
    await expect(page.locator('.settings-panel-title')).toContainText('Project Settings');

    // The Run Command field defaults to "use global"; overriding it means unchecking that and
    // typing a per-Project value, then saving.
    const runField = page.locator('.settings-field', {
      has: page.locator('input[placeholder="e.g. npm run dev"]'),
    });
    await runField.locator('.settings-use-global input[type="checkbox"]').uncheck();
    await runField.locator('input.settings-input').fill('echo persisted');
    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect
      .poll(() => page.evaluate((p) => window.api.getSetting('project:' + p), projectPath))
      .toMatchObject({ runCommand: 'echo persisted' });
  });
});
