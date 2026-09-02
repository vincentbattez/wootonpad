// The context gauge's maths: the model→window table, the autocompact tick, the abbreviated
// label and the single threshold that flips the bar to its danger colour. Pure — no Vue, no
// DOM, no I/O — so the window table and the tick move in one line and stay under test.

// Every model whose context window we do not recognise falls back here. A model we have
// never seen must keep a gauge, not make it vanish — 200k is the safe floor.
export const DEFAULT_WINDOW = 200000;

// Where Claude Code's autocompact fires, expressed as a fraction of the window. This is an
// ASSUMED approximation of the CLI's behaviour: the real threshold is neither readable in
// ~/.claude/settings.json (no compaction key exists there) nor observable in the corpus
// (every recorded compaction is trigger: "manual"). One constant, changed in one place.
export const AUTOCOMPACT_FRACTION = 0.92;

// Context windows keyed by a substring of the model id. The default is 200k; only the
// long-context tiers override it (currently the Sonnet 4 family's 1M window). Matched by
// substring so a dated id (claude-sonnet-4-5-20250929) resolves without an exact table.
const WINDOWS = [
  { match: 'sonnet-4', window: 1000000 },
];

export function windowFor(model) {
  if (typeof model === 'string') {
    for (const { match, window } of WINDOWS) {
      if (model.includes(match)) return window;
    }
  }
  return DEFAULT_WINDOW;
}

// The tick sits at the autocompact line, in token units, so a caller can hand it to SbMeter
// as a value alongside the fill.
export function tickTokens(model) {
  return Math.round(windowFor(model) * AUTOCOMPACT_FRACTION);
}

// The four counters of one assistant turn's usage are the context size (system prompt, tools
// and memory files included — calibrated against compactMetadata.preTokens).
export function contextTotal(usage) {
  if (!usage) return 0;
  return (usage.inputTokens || 0) + (usage.cacheCreationTokens || 0) +
    (usage.cacheReadTokens || 0) + (usage.outputTokens || 0);
}

// "48k", "200k" — one significant magnitude, rounded to the nearest thousand (min 1k so a
// small live number never reads as "0k").
export function formatTokens(n) {
  return Math.max(1, Math.round((n || 0) / 1000)) + 'k';
}

export function formatLabel(used, window) {
  return formatTokens(used) + ' / ' + formatTokens(window);
}

// One calm accent colour up to the tick, a flip to danger past it — no intermediate bands.
// The empty string is the calm state; 'danger' is the SbMeter severity modifier.
export function severityFor(used, model) {
  return used >= tickTokens(model) ? 'danger' : '';
}
