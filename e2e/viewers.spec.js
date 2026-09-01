const { test, expect, FIXTURE_SESSION_ID } = require('./app-fixture');

// Characterization (VIN-108): opening the four main-surface viewers — Plan, Agent File, Stats
// and JSONL — from the gestures a user takes.
test.describe('opening viewers', () => {
  test('the JSONL viewer opens from a Session', async ({ sandbox }) => {
    const { page } = sandbox;
    const row = page.locator('#si-' + FIXTURE_SESSION_ID);
    await row.hover();
    await row.locator('.session-jsonl-btn').click();

    await expect(page.locator('#jsonl-viewer')).toBeVisible();
    expect(await page.evaluate(() => window.vueStore.showJsonl)).toBe(true);
  });

  test('the Stats viewer opens from the Stats tab', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.locator('.sidebar-tab[data-tab="stats"]').click();

    await expect(page.locator('#stats-viewer')).toBeVisible();
    expect(await page.evaluate(() => window.vueStore.showStats)).toBe(true);
  });

  test('the Plan viewer opens from a plan in the Plans tab', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.locator('.sidebar-tab[data-tab="plans"]').click();
    const plan = page.locator('#plans-content .plan-item').first();
    await expect(plan).toBeVisible();
    await plan.click();

    await expect(page.locator('#plan-viewer')).toBeVisible();
    expect(await page.evaluate(() => window.vueStore.planViewerOpen)).toBe(true);
  });

  test('the Agent File viewer opens from a file in the Agent Files tab', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.locator('.sidebar-tab[data-tab="memory"]').click();
    const file = page.locator('#memory-content .memory-item').first();
    await expect(file).toBeVisible();
    await file.click();

    await expect(page.locator('#memory-viewer')).toBeVisible();
    expect(await page.evaluate(() => window.vueStore.memoryViewerOpen)).toBe(true);
  });
});
