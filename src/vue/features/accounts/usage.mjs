// The account-usage read model, pulled into a pure module so the maths behind the panel's
// usage bars and the dropdown's chips can be asserted with node:test — no mounting, no DOM.
// A usage entry is the object the frozen renderer pushes per account; the flags mark it
// unusable (an error, or rate-limited) and hide it.

// True when there is a usage figure worth showing for an account.
export function hasUsage(u) {
  if (!u || u._error || u._rateLimited) return false;
  return u.session != null || u.weekAll != null;
}

// The panel's usage bars: the 5-hour and 7-day rows present in the entry, each with its
// percentage and optional reset countdown.
export function usageRows(u) {
  const entry = u || {};
  const rows = [];
  if (entry.session != null) rows.push({ key: 'session', label: '5h', pct: entry.session, resetIn: entry.sessionResetIn });
  if (entry.weekAll != null) rows.push({ key: 'weekAll', label: '7d', pct: entry.weekAll, resetIn: entry.weekAllResetIn });
  return rows;
}

// The panel's severity rule for a usage percentage: warn at 70 %, danger at 90 %. These two
// thresholds live here — the caller's rule — because the shared SbMeter Primitive knows no
// threshold; it is handed the already-computed severity state. The context gauge (a second
// SbMeter caller) keeps its own, different rule in its own pure module.
export function usageSeverity(pct) {
  if (pct >= 90) return 'danger';
  if (pct >= 70) return 'warn';
  return '';
}

// The dropdown's compact chips: just the 5-hour figure when it is usable.
export function usageChips(u) {
  if (!hasUsage(u)) return [];
  const out = [];
  if (u.session != null) out.push(`${u.session}% 5h`);
  return out;
}
