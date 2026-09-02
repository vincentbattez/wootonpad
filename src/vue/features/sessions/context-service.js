// The sessions Feature's context-gauge service: it subscribes to the main process's
// live `session-context` push (emitted once per busy→idle turn) and writes the header
// store. Modelled on the stats service and the viewer Container's direct subscription —
// the one place that reaches window.api for the gauge. The frozen legacy renderer never
// relays this event; only the Vue side listens.

import { api } from '../../shared/services/api.js';
import { headerStore } from './store.js';

let subscribed = false;

// Idempotent: the header Container mounts once and calls this on mount, but guard anyway
// so a remount cannot stack duplicate listeners.
export function subscribeSessionContext() {
  if (subscribed) return;
  subscribed = true;
  api.onSessionContext?.((sessionId, usage, model) => {
    headerStore.headerContext = { sessionId, usage: usage || null, model: model || null };
  });
}
