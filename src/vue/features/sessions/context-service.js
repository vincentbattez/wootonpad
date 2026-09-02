// The sessions Feature's context-gauge service: it subscribes to the main process's
// live `session-context` push (emitted once per busy→idle turn) and writes the new
// context onto that Session's row in the store, where the sidebar's gauge reads it.
// Modelled on the stats service — the one place that reaches window.api for the gauge.
// The frozen legacy renderer never relays this event; only the Vue side listens.

import { api } from '../../shared/services/api.js';
import { sessionsStore } from './store.js';
import { applyStoredContext } from './context-gauge.mjs';

let subscribed = false;

// The gauge reads the Session row, so a push writes the row in place — no prop drilling down
// the Area/Project/Slug chain. It also lands in the store's sessionContext map, which the
// Bridge re-applies to every rebuilt tree, so a folder refresh mid-session cannot blank it.
function applyLiveContext(sessionId, usage, model) {
  sessionsStore.sessionContext.set(sessionId, { usage: usage || null, model: model || null });
  applyStoredContext(sessionsStore.projects, sessionsStore.sessionContext);
}

// Idempotent: the sidebar Container mounts once and calls this on mount, but guard anyway
// so a remount cannot stack duplicate listeners.
export function subscribeSessionContext() {
  if (subscribed) return;
  subscribed = true;
  api.onSessionContext?.((sessionId, usage, model) => {
    applyLiveContext(sessionId, usage, model);
  });
}
