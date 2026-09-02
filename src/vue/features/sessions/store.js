import { reactive } from 'vue';

// The sessions Feature store. Two slices the feature owns: the Session/Project tree with
// the live PTY sets that drive a row's running / busy / attention / response-ready states,
// and the terminal header's identity. The feature's Bridge
// writes here; a Dumb Component reads it only through a Container.

// Session runtime state: the Project/Session tree plus the live PTY sets.
export const sessionsStore = reactive({
  // Project/session data
  projects: [],

  // Session runtime state
  activePtyIds: new Set(),
  activeSessionId: null,
  sessionBusyState: new Map(),
  attentionSessions: new Set(),
  responseReadySessions: new Set(),
  lastActivityTime: new Map(),
  pendingSessions: new Set(),

  // The context gauge's live values (VIN-143): sessionId → { usage, model }, written by the
  // context service on each busy→idle turn. Kept beside the tree rather than only on the row,
  // because every folder refresh rebuilds the rows from the cache and would drop a value the
  // cache has not indexed yet — the gauge would vanish under a running Session.
  sessionContext: new Map(),
});

// Header state: the active Session's identity shown in the terminal header.
export const headerStore = reactive({
  headerSession: null,
  headerPtyTitle: null,
  headerShellProfile: null,
  headerAccount: null,
  headerAccounts: [],
});
