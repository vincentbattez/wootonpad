// The sessions Feature's Bridge to the frozen legacy renderer. Every method writes the
// feature store rather than a component ref, so a panel reading the store can be a Dumb
// Component. `public/app.js` is frozen, so these names and signatures are the contract;
// they are composed into window.vueSidebar (with the navigation filters and search) so the
// legacy surface is byte-identical while the sessions feature owns its own slice of it.
import { applyStoredContext } from './context-gauge.mjs';

export function createSessionsBridge(store) {
  return {
    // The Session/Project tree and the live PTY sets. Session rows are copied too: the legacy
    // renderer's dedup() re-uses one object per Session across refreshes and Object.assign()s
    // the fresh row onto it, so passing it through would hand SessionItem the same prop
    // identity every time — Vue skips the row, and a running Session's gauge and message count
    // stay frozen until an unrelated prop (running, active) flips.
    setProjects(projects) {
      const copies = projects.map(p => ({ ...p, sessions: (p.sessions || []).map(s => ({ ...s })) }));
      store.projects = applyStoredContext(copies, store.sessionContext);
    },
    setActivePtyIds(ids) { store.activePtyIds = new Set(ids); },
    setActiveSession(id) { store.activeSessionId = id; },
    setBusy(sessionId, busy) {
      if (busy) store.sessionBusyState.set(sessionId, true);
      else store.sessionBusyState.delete(sessionId);
    },
    addAttention(sessionId) { store.attentionSessions.add(sessionId); },
    // `setResponseReady` is the frozen renderer's name for "a turn ended off-focus". It feeds
    // two things now: the Unread accent on the title, and — through the row — the needsInput
    // Session State. The name stays because public/app.js is the contract.
    setResponseReady(sessionId) {
      store.unreadSessions.add(sessionId);
      store.sessionBusyState.delete(sessionId);
    },
    clearNotifications(sessionId) {
      store.attentionSessions.delete(sessionId);
      store.unreadSessions.delete(sessionId);
    },

    // The active Session's terminal-header context.
    setHeaderSession(session) { store.headerSession = session; },
    setHeaderPtyTitle(title) { store.headerPtyTitle = title || null; },
    setHeaderShellProfile(profile) { store.headerShellProfile = profile || null; },
    setHeaderAccount(name) { store.headerAccount = name || null; },
    clearHeader() {
      store.headerSession = null;
      store.headerPtyTitle = null;
      store.headerShellProfile = null;
      store.headerAccount = null;
    },
  };
}
