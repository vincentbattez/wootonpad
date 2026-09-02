// The Stats Feature's service layer: the IPC to the main process plus the read-through
// cache. The one Container imports this; nothing else touches window.api for stats.

let cachedStats = null;
let cachedUsage = null;
let statsLoadedAt = 0;
const STATS_TTL_MS = 60_000;

// Fast load: reads from file cache + DB only — no Keychain, no PTY, no dialog.
export async function loadStats() {
  const age = Date.now() - statsLoadedAt;
  if (cachedStats && age < STATS_TTL_MS) {
    return { stats: cachedStats, usage: cachedUsage || {} };
  }
  const [freshStats, freshUsage] = await Promise.all([
    window.api.getStats().catch(() => null),
    window.api.getCachedUsage().catch(() => ({})),
  ]);
  cachedStats = freshStats;
  cachedUsage = freshUsage || {};
  statsLoadedAt = Date.now();
  return { stats: cachedStats, usage: cachedUsage };
}

// Explicit refresh: spawns PTY + reads Keychain — only on user click.
export async function refreshAllStats() {
  const result = await window.api.refreshStats();
  if (result?.stats) cachedStats = result.stats;
  if (result?.usage) cachedUsage = result.usage;
  statsLoadedAt = Date.now();
  return { stats: cachedStats, usage: cachedUsage };
}

export async function refreshUsage() {
  const freshUsage = await window.api.getUsage();
  if (freshUsage && Object.keys(freshUsage).length) {
    cachedUsage = freshUsage;
    statsLoadedAt = 0;
  }
  return cachedUsage || {};
}

export function invalidateStats() {
  cachedStats = null;
  cachedUsage = null;
  statsLoadedAt = 0;
}
