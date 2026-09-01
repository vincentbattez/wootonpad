import { reactive } from 'vue';

// Session runtime state: the Project/Session tree plus the live PTY sets that
// drive a Session row's running, busy, attention and response-ready states.
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
