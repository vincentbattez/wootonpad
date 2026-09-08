// The one new seam of VIN-149: the pure decision of *which* Sessions to push a live context
// update for, and *when*. It is handed the Session ids whose .jsonl just changed plus the
// current time, and answers the subset to push now. No I/O — the file read and the IPC send
// live in context-live-push.js — so it stays testable by advancing `now`.
//
// The cadence: Claude Code writes an assistant entry roughly every 2–5s during a turn, so a
// leading-edge throttle at ~2.5s lets a normal turn move the gauge every write while a burst
// of rapid writes collapses to one push. One constant, changed in one place.
const DEFAULT_PUSH_INTERVAL_MS = 2500;

function createContextPushThrottle(intervalMs = DEFAULT_PUSH_INTERVAL_MS) {
  // sessionId → timestamp of its last push. A session pushes on first sight and again once
  // intervalMs has elapsed; anything in between (a burst) is dropped, the last-known value
  // riding the next write.
  const lastPushed = new Map();

  return {
    select(changedIds, now) {
      const toPush = [];
      const seen = new Set();
      for (const id of changedIds || []) {
        if (seen.has(id)) continue; // dedup a burst inside one call
        seen.add(id);
        const last = lastPushed.get(id);
        if (last === undefined || now - last >= intervalMs) {
          lastPushed.set(id, now);
          toPush.push(id);
        }
      }
      return toPush;
    },
  };
}

module.exports = { createContextPushThrottle, DEFAULT_PUSH_INTERVAL_MS };
