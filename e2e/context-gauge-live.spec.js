const { test, expect, appendAssistantUsage, GAUGE_SESSION_ID } = require('./app-fixture');

// VIN-149 — the reported symptom, driven end to end on the real app: a Session's .jsonl grows
// while its row is on screen, and the row's context gauge shows a value that changes, without
// the Session ever starting or stopping. Nothing less would have caught it — the calc was
// already covered, the break was the disk-write → tail read → IPC → store → prop → pixel chain.
test.describe('live context gauge', () => {
  test('the gauge value changes when the .jsonl grows, with no stop', async ({ sandbox }) => {
    const { page, gaugeProjectPath } = sandbox;
    const label = page.locator(`#si-${GAUGE_SESSION_ID} .session-context-label`);

    // At rest the seeded usage block reads 100k — the fixture writes a usage entry (AC).
    await expect(label).toHaveText('100k');

    // The turn writes a larger assistant entry: the recursive fs.watch sees the write, the
    // live push reads the tail and emits, and the row's gauge moves — live, not on stop.
    appendAssistantUsage(sandbox.home, gaugeProjectPath, GAUGE_SESSION_ID, { input_tokens: 180000 });

    await expect(label).toHaveText('180k', { timeout: 15_000 });
    // The meter is still there, so it moved rather than blanking.
    await expect(page.locator(`#si-${GAUGE_SESSION_ID} .session-context-meter`)).toBeVisible();
  });
});
