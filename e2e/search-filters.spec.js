const { test, expect } = require('./app-fixture');

// Characterization (VIN-108): search narrows the Sessions tree, and the three sidebar filters
// toggle — with Running and Starred mutually exclusive.
test.describe('sidebar search and filters', () => {
  test('a non-matching query empties the tree; clearing restores it', async ({ sandbox }) => {
    const { page } = sandbox;
    const projects = page.locator('#sidebar-content .project-header');
    await expect.poll(() => projects.count()).toBeGreaterThan(0);

    await page.fill('#search-input', 'zzz-nothing-matches-this');
    await expect(page.locator('#search-bar')).toHaveClass(/has-query/);
    await expect.poll(() => projects.count()).toBe(0);

    await page.click('#search-clear');
    await expect(page.locator('#search-bar')).not.toHaveClass(/has-query/);
    await expect.poll(() => projects.count()).toBeGreaterThan(0);
  });

  test('a matching query keeps at least the matching Project', async ({ sandbox }) => {
    const { page } = sandbox;
    const projects = page.locator('#sidebar-content .project-header');
    await page.fill('#search-input', 'hello');
    // The seeded Sessions all carry "hello from the fixture", so the tree stays populated.
    await expect.poll(() => projects.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('the three filters toggle, and Running clears Starred', async ({ sandbox }) => {
    const { page } = sandbox;
    const flags = () => page.evaluate(() => ({
      running: window.vueStore.showRunningOnly,
      starred: window.vueStore.showStarredOnly,
      today: window.vueStore.showTodayOnly,
    }));

    // The filter menu is Teleported to the body and stays open across in-menu clicks.
    await page.click('#filters-btn');

    await page.click('#star-toggle');
    expect(await flags()).toMatchObject({ starred: true, running: false });

    await page.click('#running-toggle');
    expect(await flags()).toMatchObject({ running: true, starred: false });

    await page.click('#today-toggle');
    expect(await flags()).toMatchObject({ running: true, today: true });
  });
});
