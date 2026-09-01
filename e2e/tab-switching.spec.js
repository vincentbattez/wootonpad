const { test, expect } = require('./app-fixture');

// Characterization (VIN-108): pins the current front so the VIN-107 refactor can prove it
// changed no behaviour. Every sidebar tab owns a button and a content panel; clicking a tab
// activates its button, reveals its panel and records the tab on the store.
const TABS = [
  { id: 'sessions', panel: '#sidebar-content' },
  { id: 'plans', panel: '#plans-content' },
  { id: 'memory', panel: '#memory-content' },
  { id: 'stats', panel: '#stats-content' },
  { id: 'projects', panel: '#projects-content' },
  { id: 'accounts', panel: '#accounts-content' },
];

test.describe('sidebar tab switching', () => {
  test('every tab activates its own button and reveals its own panel', async ({ sandbox }) => {
    const { page } = sandbox;
    for (const { id, panel } of TABS) {
      await page.locator(`.sidebar-tab[data-tab="${id}"]`).click();
      await expect(page.locator(`.sidebar-tab[data-tab="${id}"]`)).toHaveClass(/active/);
      await expect(page.locator(panel)).toBeVisible();
      expect(await page.evaluate(() => window.vueStore.activeTab)).toBe(id);
    }
  });

  test('leaving a tab hides its panel', async ({ sandbox }) => {
    const { page } = sandbox;
    await page.locator('.sidebar-tab[data-tab="plans"]').click();
    await expect(page.locator('#plans-content')).toBeVisible();

    await page.locator('.sidebar-tab[data-tab="sessions"]').click();
    await expect(page.locator('#plans-content')).toBeHidden();
    await expect(page.locator('#sidebar-content')).toBeVisible();
  });
});
