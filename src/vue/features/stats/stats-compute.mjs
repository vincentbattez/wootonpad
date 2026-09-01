// The Stats panel's maths: the daily activity map, the contribution heatmap, the
// 30-day bar chart, the summary cards and the streak. Pure — no Vue, no DOM, no I/O.
// `today` (a Date at local midnight) is injected so every window is testable against
// fixed inputs.

export const DAY_NAMES = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COL_WIDTH = 16; // 13px cell + 3px gap

// The stats cache stores daily activity as either a keyed object or an array of
// entries, and each entry as a bare number or a shape with a count field. Flatten
// both into { dateStr: messageCount }.
export function buildDailyMap(s) {
  const rawDaily = s?.dailyActivity || {};
  const dailyMap = {};
  if (Array.isArray(rawDaily)) {
    for (const entry of rawDaily) {
      dailyMap[entry.date] = entry.messageCount || 0;
    }
  } else {
    for (const [date, data] of Object.entries(rawDaily)) {
      dailyMap[date] = typeof data === 'number' ? data : (data?.messageCount || data?.messages || data?.count || 0);
    }
  }
  return dailyMap;
}

// The startDate the heatmap and its month labels share: 52 weeks plus the current
// weekday back from today, so the grid starts on a Sunday.
function heatmapStart(today) {
  const dayOfWeek = today.getDay();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (52 * 7 + dayOfWeek));
  return startDate;
}

// One label per month change, positioned by the week column it first appears in.
export function buildMonthLabels(today) {
  const startDate = heatmapStart(today);

  const weekStarts = [];
  const d = new Date(startDate);
  while (d <= today) {
    if (d.getDay() === 0) weekStarts.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  const labels = [];
  let lastMonth = -1;
  for (let w = 0; w < weekStarts.length; w++) {
    const m = weekStarts[w].getMonth();
    if (m !== lastMonth) {
      labels.push({ key: w + '-' + m, label: MONTHS[m], left: (w * COL_WIDTH) + 'px' });
      lastMonth = m;
    }
  }
  return labels;
}

// One cell per day from the start Sunday to today, its level bucketed by the
// quartiles of the non-zero message counts.
export function buildHeatmapCells(stats, today) {
  const dailyMap = buildDailyMap(stats);

  const nonZero = Object.values(dailyMap).filter(c => c > 0).sort((a, b) => a - b);
  const q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
  const q2 = nonZero[Math.floor(nonZero.length * 0.5)] || 2;
  const q3 = nonZero[Math.floor(nonZero.length * 0.75)] || 3;

  const startDate = heatmapStart(today);

  const cells = [];
  const cursor = new Date(startDate);
  while (cursor <= today) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const count = dailyMap[dateStr] || 0;
    let level = 0;
    if (count > 0) {
      if (count <= q1) level = 1;
      else if (count <= q2) level = 2;
      else if (count <= q3) level = 3;
      else level = 4;
    }
    const displayDate = cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    cells.push({
      dateStr,
      level,
      title: count > 0 ? `${displayDate}: ${count} messages` : `${displayDate}: No activity`,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function formatChartTokens(tv) {
  if (tv >= 1e6) return (tv / 1e6).toFixed(1) + 'M';
  if (tv >= 1e3) return (tv / 1e3).toFixed(1) + 'K';
  return tv.toString();
}

// The last 30 days as bar-chart columns: token and message bars scaled to the
// window's own maxima, with a tooltip carrying the raw figures.
export function buildDailyChartCols(stats, today) {
  const rawTokens = stats?.dailyModelTokens || [];
  const rawActivity = stats?.dailyActivity || [];

  const tokenMap = {};
  if (Array.isArray(rawTokens)) {
    for (const entry of rawTokens) {
      let total = 0;
      for (const count of Object.values(entry.tokensByModel || {})) total += count;
      tokenMap[entry.date] = total;
    }
  }
  const activityMap = {};
  if (Array.isArray(rawActivity)) {
    for (const entry of rawActivity) activityMap[entry.date] = entry;
  }

  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const tokenValues = days.map(d => tokenMap[d] || 0);
  const msgValues = days.map(d => activityMap[d]?.messageCount || 0);
  const toolValues = days.map(d => activityMap[d]?.toolCallCount || 0);
  const maxTokens = Math.max(...tokenValues, 1);
  const maxMsgs = Math.max(...msgValues, 1);

  return days.map((dateStr, i) => {
    const tokenPct = Math.max((tokenValues[i] / maxTokens) * 100, tokenValues[i] > 0 ? 3 : 0);
    const msgPct = Math.max((msgValues[i] / maxMsgs) * 100, msgValues[i] > 0 ? 3 : 0);
    const d = new Date(dateStr);
    const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const tokStr = formatChartTokens(tokenValues[i]);
    const tooltip = `${dayLabel}\n${tokStr} tokens\n${msgValues[i]} messages\n${toolValues[i]} tool calls`;
    return { dateStr, tokenPct, msgPct, dayNum: d.getDate().toString(), tooltip };
  });
}

// Current and longest run of consecutive active days, walking back a year from today.
export function calculateStreak(dailyMap, today) {
  let current = 0, longest = 0, streak = 0;
  const d = new Date(today);
  let started = false;
  for (let i = 0; i < 365; i++) {
    const dateStr = d.toISOString().slice(0, 10);
    const count = dailyMap[dateStr] || 0;
    if (count > 0) {
      streak++;
      started = true;
    } else {
      if (started) {
        if (!current) current = streak;
        if (streak > longest) longest = streak;
        streak = 0;
        if (current) started = false;
      }
    }
    d.setDate(d.getDate() - 1);
  }
  if (streak > longest) longest = streak;
  if (!current && streak > 0) current = streak;
  return { current, longest };
}

function formatSummaryTokens(tokens) {
  if (tokens >= 1e9) return (tokens / 1e9).toFixed(1) + 'B';
  if (tokens >= 1e6) return (tokens / 1e6).toFixed(1) + 'M';
  if (tokens >= 1e3) return (tokens / 1e3).toFixed(1) + 'K';
  return tokens.toLocaleString();
}

// The four fixed cards (sessions, messages, current and longest streak) plus one
// per model, its tokens summed and abbreviated.
export function buildSummaryCards(stats, today) {
  const s = stats;
  const dailyMap = buildDailyMap(s);
  const { current: currentStreak, longest: longestStreak } = calculateStreak(dailyMap, today);

  let totalMessages = 0;
  for (const count of Object.values(dailyMap)) totalMessages += count;
  if (s.totalMessages && s.totalMessages > totalMessages) totalMessages = s.totalMessages;

  const totalSessions = s.totalSessions || Object.keys(dailyMap).length;
  const models = s.modelUsage || {};

  const cards = [
    { value: totalSessions.toLocaleString(), label: 'Total Sessions' },
    { value: totalMessages.toLocaleString(), label: 'Total Messages' },
    { value: currentStreak + 'd', label: 'Current Streak' },
    { value: longestStreak + 'd', label: 'Longest Streak' },
  ];

  for (const [model, mu] of Object.entries(models)) {
    const shortName = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
    const tokens = (mu?.inputTokens || 0) + (mu?.outputTokens || 0);
    cards.push({ value: formatSummaryTokens(tokens), label: shortName + ' tokens' });
  }
  return cards;
}

// The four rate-limit tracks, in fixed order, skipping any the usage payload omits.
export const USAGE_ITEMS = [
  { key: 'session', label: 'Current session', resetKey: 'sessionReset' },
  { key: 'weekAll', label: 'Week (all models)', resetKey: 'weekAllReset' },
  { key: 'weekSonnet', label: 'Week (Sonnet)', resetKey: 'weekSonnetReset' },
  { key: 'weekOpus', label: 'Week (Opus)', resetKey: 'weekOpusReset' },
];

export function buildUsageCards(usage) {
  const u = usage;
  if (!u || u._rateLimited || u._error) return [];
  return USAGE_ITEMS
    .filter(item => u[item.key] !== undefined)
    .map(item => ({
      key: item.key,
      label: item.label,
      pct: u[item.key],
      reset: u[item.resetKey] || null,
    }));
}

export function buildRateLimitedText(usage) {
  const u = usage;
  if (!u?._rateLimited) return '';
  const secs = u.retryAfterSeconds || 0;
  const mins = Math.ceil(secs / 60);
  return secs > 0
    ? `Usage API rate limited. Try again in ~${mins} min${mins !== 1 ? 's' : ''}.`
    : 'Usage API rate limited. Try again later.';
}
