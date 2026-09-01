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
});
