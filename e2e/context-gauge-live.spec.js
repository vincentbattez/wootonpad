const { test, expect, appendAssistantUsage, GAUGE_SESSION_ID } = require('./app-fixture');

// VIN-149 — the reported symptom, driven end to end on the real app: a Session's .jsonl grows
// while its row is on screen, and the row's context gauge shows a value that changes, without
// the Session ever starting or stopping. Nothing less would have caught it — the calc was
// already covered, the break was the disk-write → tail read → IPC → store → prop → pixel chain.
test.describe('live context gauge', () => {
  test('the gauge value changes when the .jsonl grows, with no stop', async ({ sandbox }) => {
    const { page, gaugeProjectPath } = sandbox;
    const row = page.locator(`#si-${GAUGE_SESSION_ID}`);
    const label = page.locator(`#si-${GAUGE_SESSION_ID} .session-context-label`);
    const fill = page.locator(`#si-${GAUGE_SESSION_ID} .session-context-meter .sb-meter-fill`);
    const dot = page.locator(`#si-${GAUGE_SESSION_ID} .session-status-dot`);

    // At rest the seeded usage block reads 100k — the fixture writes a usage entry (AC). 100k
    // sits in the warn tier (context-gauge.mjs: WARN 90k, HIGH 120k, CRIT 150k).
    await expect(label).toHaveText('100k');
    await expect(fill).toHaveClass(/\bwarn\b/);

    // Snapshot the row's run/stop state before the write. A still-visible meter also survives a
    // stop (a stopped Session keeps its last value by design), so proving "did not stop" needs
    // the state indicator itself: the status dot's classes and the row's cli-busy/has-running-pty
    // flags. Captured raw so the assertion after the move is against the exact strings.
    const stateOf = async () => ({
      dot: await dot.getAttribute('class'),
      busy: await row.evaluate((el) => el.classList.contains('cli-busy')),
      runningPty: await row.evaluate((el) => el.classList.contains('has-running-pty')),
    });
    const stateBefore = await stateOf();

    // The turn writes a larger assistant entry: the recursive fs.watch sees the write, the
    // live push reads the tail and emits, and the row's gauge moves — live, not on stop.
    appendAssistantUsage(sandbox.home, gaugeProjectPath, GAUGE_SESSION_ID, { input_tokens: 180000 });

    await expect(label).toHaveText('180k', { timeout: 15_000 });
    // 180k crosses two thresholds, so the colour flips to danger mid-turn — the severity is
    // reactive, so the bascule happens during the turn, not on stop (AC).
    await expect(fill).toHaveClass(/\bdanger\b/, { timeout: 15_000 });
    // The meter is still there, so it moved rather than blanking.
    await expect(page.locator(`#si-${GAUGE_SESSION_ID} .session-context-meter`)).toBeVisible();

    // The row's run/stop state is byte-for-byte what it was before the write: the gauge moved
    // because the .jsonl grew, not because the Session started or stopped (AC).
    expect(await stateOf()).toEqual(stateBefore);
  });
});
