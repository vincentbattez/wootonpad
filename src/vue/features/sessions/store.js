import { reactive } from 'vue';

// The sessions Feature store. Two slices the feature owns: the Session/Project tree with
// the live PTY sets that drive a row's running / busy / attention / response-ready states,
// and the active Session's context shown in the terminal header. The feature's Bridge
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
});

// Header state: the active Session's context shown in the terminal header.
export const headerStore = reactive({
  headerSession: null,
  headerPtyTitle: null,
  headerShellProfile: null,
  headerAccount: null,
  headerAccounts: [],
  // The live context push (VIN-143): { sessionId, usage, model } written by the context
  // service on each busy→idle turn. It overrides the Session's resting value in the header
  // when it is for the Session on screen, so the gauge moves within a second of a turn.
  headerContext: null,
});
