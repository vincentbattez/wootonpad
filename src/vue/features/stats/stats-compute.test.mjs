import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyMap,
  buildMonthLabels,
  buildHeatmapCells,
  buildDailyChartCols,
  calculateStreak,
  buildSummaryCards,
  buildUsageCards,
  buildRateLimitedText,
  USAGE_ITEMS,
  DAY_NAMES,
} from './stats-compute.mjs';

// A fixed "today" at local midnight, and a helper that yields the same dateStr the
// module derives (UTC-sliced), so the fixtures line up regardless of the test TZ.
function fixedToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}
function dayKey(today, offsetBack) {
  const d = new Date(today);
  d.setDate(d.getDate() - offsetBack);
  return d.toISOString().slice(0, 10);
}

test('buildDailyMap flattens an array of activity entries', () => {
  const map = buildDailyMap({ dailyActivity: [
    { date: '2026-08-01', messageCount: 3 },
    { date: '2026-08-02', messageCount: 0 },
    { date: '2026-08-03' },
  ] });
  assert.deepEqual(map, { '2026-08-01': 3, '2026-08-02': 0, '2026-08-03': 0 });
});

test('buildDailyMap reads number, messageCount, messages or count from a keyed object', () => {
  const map = buildDailyMap({ dailyActivity: {
    '2026-08-01': 5,
    '2026-08-02': { messageCount: 7 },
    '2026-08-03': { messages: 9 },
    '2026-08-04': { count: 11 },
    '2026-08-05': {},
  } });
  assert.deepEqual(map, {
    '2026-08-01': 5, '2026-08-02': 7, '2026-08-03': 9, '2026-08-04': 11, '2026-08-05': 0,
  });
});

test('buildDailyMap of empty stats is an empty map', () => {
  assert.deepEqual(buildDailyMap(null), {});
  assert.deepEqual(buildDailyMap({}), {});
});

test('buildHeatmapCells spans the start Sunday through today, one cell per day', () => {
  const today = fixedToday();
  const cells = buildHeatmapCells({ dailyActivity: {} }, today);
  // 52 weeks + the current weekday, inclusive of today.
  const expected = 52 * 7 + today.getDay() + 1;
  assert.equal(cells.length, expected);
  assert.equal(cells[cells.length - 1].dateStr, today.toISOString().slice(0, 10));
  assert.equal(cells[0].level, 0);
});

test('buildHeatmapCells buckets counts into levels by quartile', () => {
  const today = fixedToday();
  // Non-zero counts 1..8 sorted → q1=nz[2]=3, q2=nz[4]=5, q3=nz[6]=7.
  const dailyActivity = {};
  for (let i = 0; i < 8; i++) dailyActivity[dayKey(today, i)] = i + 1;
  const cells = buildHeatmapCells({ dailyActivity }, today);
  const byDate = Object.fromEntries(cells.map(c => [c.dateStr, c]));
  assert.equal(byDate[dayKey(today, 0)].level, 1); // 1 <= q1(3)
  assert.equal(byDate[dayKey(today, 3)].level, 2); // 4 <= q2(5), > q1
  assert.equal(byDate[dayKey(today, 5)].level, 3); // 6 <= q3(7), > q2
  assert.equal(byDate[dayKey(today, 7)].level, 4); // 8 > q3(7)
});

test('buildHeatmapCells titles carry the count or a no-activity note', () => {
  const today = fixedToday();
  const cells = buildHeatmapCells({ dailyActivity: { [dayKey(today, 0)]: 4 } }, today);
  const last = cells[cells.length - 1];
  assert.match(last.title, /: 4 messages$/);
  assert.match(cells[0].title, /: No activity$/);
});

test('buildMonthLabels emits one label per month change, positioned by week column', () => {
  const today = fixedToday();
  const labels = buildMonthLabels(today);
  assert.ok(labels.length >= 12, 'a year of weeks crosses at least twelve months');
  assert.match(labels[0].left, /^0px$|^\d+px$/);
  // Columns are strictly increasing (each label is a later week than the last).
  const lefts = labels.map(l => parseInt(l.left, 10));
  for (let i = 1; i < lefts.length; i++) assert.ok(lefts[i] > lefts[i - 1]);
});

test('buildDailyChartCols returns exactly 30 columns ending today', () => {
  const today = fixedToday();
  const cols = buildDailyChartCols({}, today);
  assert.equal(cols.length, 30);
  assert.equal(cols[29].dateStr, today.toISOString().slice(0, 10));
  assert.equal(cols[0].dateStr, dayKey(today, 29));
});

test('buildDailyChartCols scales bars to the window maxima and abbreviates tokens', () => {
  const today = fixedToday();
  const cols = buildDailyChartCols({
    dailyModelTokens: [
      { date: dayKey(today, 0), tokensByModel: { opus: 1_500_000, sonnet: 500_000 } },
      { date: dayKey(today, 1), tokensByModel: { opus: 1_000 } },
    ],
    dailyActivity: [
      { date: dayKey(today, 0), messageCount: 10, toolCallCount: 4 },
      { date: dayKey(today, 1), messageCount: 5 },
    ],
  }, today);
  const last = cols[29];
  assert.equal(last.tokenPct, 100, 'the day holding the max is a full-height bar');
  assert.match(last.tooltip, /2\.0M tokens/);
  assert.match(last.tooltip, /10 messages/);
  assert.match(last.tooltip, /4 tool calls/);
  // A day with no data has zero-height bars.
  assert.equal(cols[0].tokenPct, 0);
  assert.equal(cols[0].msgPct, 0);
});

test('calculateStreak counts the current and longest active runs', () => {
  const today = fixedToday();
  // Active today and the two days before → current streak 3.
  const dailyMap = {
    [dayKey(today, 0)]: 2,
    [dayKey(today, 1)]: 1,
    [dayKey(today, 2)]: 4,
    // gap at 3
    [dayKey(today, 4)]: 1,
    [dayKey(today, 5)]: 1,
  };
  const { current, longest } = calculateStreak(dailyMap, today);
  assert.equal(current, 3);
  assert.equal(longest, 3);
});

test('calculateStreak is zero when today is inactive but keeps the longest past run', () => {
  const today = fixedToday();
  const dailyMap = {
    [dayKey(today, 2)]: 1,
    [dayKey(today, 3)]: 1,
    [dayKey(today, 4)]: 1,
  };
  const { current, longest } = calculateStreak(dailyMap, today);
  assert.equal(current, 3, 'the most recent completed run becomes current');
  assert.equal(longest, 3);
});

test('buildSummaryCards emits the four fixed cards then one per model', () => {
  const today = fixedToday();
  const cards = buildSummaryCards({
    totalSessions: 42,
    dailyActivity: { [dayKey(today, 0)]: 3, [dayKey(today, 1)]: 7 },
    modelUsage: {
      'claude-opus-4-20260101': { inputTokens: 1_200_000, outputTokens: 800_000 },
    },
  }, today);
  assert.equal(cards[0].value, '42');
  assert.equal(cards[0].label, 'Total Sessions');
  assert.equal(cards[1].value, '10', 'total messages sums the daily map');
  assert.equal(cards[2].label, 'Current Streak');
  assert.equal(cards[3].label, 'Longest Streak');
  const model = cards[4];
  assert.equal(model.label, 'opus-4 tokens', 'claude- prefix and date suffix stripped');
  assert.equal(model.value, '2.0M');
});

test('buildSummaryCards prefers an explicit totalMessages when it is larger', () => {
  const today = fixedToday();
  const cards = buildSummaryCards({
    totalMessages: 500,
    dailyActivity: { [dayKey(today, 0)]: 3 },
  }, today);
  assert.equal(cards[1].value, '500');
});

test('buildUsageCards keeps present tracks in fixed order with their resets', () => {
  const cards = buildUsageCards({
    session: 20, sessionReset: '3pm',
    weekOpus: 80, weekOpusReset: 'Mon',
  });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].key, 'session');
  assert.equal(cards[0].pct, 20);
  assert.equal(cards[0].reset, '3pm');
  assert.equal(cards[1].key, 'weekOpus');
  assert.equal(cards[1].reset, 'Mon');
});

test('buildUsageCards is empty when rate limited or errored', () => {
  assert.deepEqual(buildUsageCards({ _rateLimited: true, session: 5 }), []);
  assert.deepEqual(buildUsageCards({ _error: true }), []);
  assert.deepEqual(buildUsageCards(null), []);
});

test('buildRateLimitedText phrases the retry window in minutes', () => {
  assert.equal(buildRateLimitedText({ _rateLimited: true, retryAfterSeconds: 90 }),
    'Usage API rate limited. Try again in ~2 mins.');
  assert.equal(buildRateLimitedText({ _rateLimited: true, retryAfterSeconds: 30 }),
    'Usage API rate limited. Try again in ~1 min.');
  assert.equal(buildRateLimitedText({ _rateLimited: true }),
    'Usage API rate limited. Try again later.');
  assert.equal(buildRateLimitedText({}), '');
});

test('the fixed vocab is preserved verbatim', () => {
  assert.deepEqual(DAY_NAMES, ['', 'Mon', '', 'Wed', '', 'Fri', '']);
  assert.deepEqual(USAGE_ITEMS.map(i => i.key), ['session', 'weekAll', 'weekSonnet', 'weekOpus']);
});
