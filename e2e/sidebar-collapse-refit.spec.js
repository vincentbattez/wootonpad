const { test, expect, openTerminalSession, cols, waitForCols } = require('./app-fixture');

// Regression: collapsing the sidebar widened the terminal area but left the
// terminal stuck on its old column count until the window was resized by hand.
test.describe('terminal refit on sidebar collapse', () => {
  test('single-Session view: collapsing widens, expanding restores', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    const sessionId = await openTerminalSession({ page, projectPath });
    const initial = await cols(page, sessionId);

    await page.click('#sidebar-collapse-btn');
    await waitForCols(page, sessionId, { above: initial });

    await page.click('#sidebar-expand-btn');
    await waitForCols(page, sessionId, { equals: initial });
  });

  test('grid view: visible terminals refit too', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    const sessionId = await openTerminalSession({ page, projectPath });

    await page.evaluate(() => window.showGridView());
    await waitForCols(page, sessionId, { above: 0 });
    const initial = await cols(page, sessionId);

    await page.click('#sidebar-collapse-btn');
    await waitForCols(page, sessionId, { above: initial });
  });

  // Story 16: a Session hidden behind another tab must not be sized against a
  // zero-width container — it would freeze at absurd dimensions.
  test('a hidden terminals container is never refit', async ({ sandbox }) => {
    const { page, projectPath } = sandbox;
    const sessionId = await openTerminalSession({ page, projectPath });
    const initial = await cols(page, sessionId);

    await page.evaluate(() => window.__sb.onTabChange('stats'));
    await page.click('#sidebar-collapse-btn');
    await page.waitForTimeout(400); // comfortably past the 80 ms refit debounce

    expect(await cols(page, sessionId)).toBe(initial);
  });
});
