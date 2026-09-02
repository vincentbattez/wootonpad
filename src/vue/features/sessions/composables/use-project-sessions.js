import { ref } from 'vue';
import { api } from '../../../shared/services/api.js';
import { sb } from '../../../shared/services/sb.js';

// The Sessions the Project Viewer shows — the recent Sessions of the Project (or worktree root)
// and the live PTY terminals running against it. This is the sessions Feature owning that list
// rather than the View keeping a private copy: the IPC to read Sessions and terminals, and the
// gesture that opens one, all live here. The View reads `sessions` / `activeSessions` and calls
// `openSession`; it renders them in its own layout (the Overview card and the Sessions tab).
export function useProjectSessions() {
  const sessions = ref([]);
  const activeSessions = ref([]);

  // `rootPath` is the Project root the Sessions belong to (worktrees share their Project's root).
  async function load(rootPath) {
    if (!rootPath) return;
    const [sess, terminals] = await Promise.all([
      api.getProjectSessions(rootPath).catch(() => null),
      api.getActiveTerminals().catch(() => null),
    ]);
    if (sess?.ok) sessions.value = sess.sessions;
    if (terminals) {
      activeSessions.value = Object.values(terminals)
        .filter(t => t.projectPath === rootPath && !t.exited)
        .map(t => ({ id: t.id, name: t.title || t.id?.slice(0, 12), busy: t.busy || false }));
    }
  }

  function openSession(s) { sb.openSessionById?.(s.id); }

  // The Session's last-touched date, formatted with the frozen renderer's shared helper when it is
  // present (it owns the app-wide date format) and a plain locale date otherwise.
  function fmtDate(t) {
    if (!t) return '';
    try { return window.formatDate ? window.formatDate(new Date(t)) : new Date(t).toLocaleDateString(); } catch { return ''; }
  }

  return { sessions, activeSessions, load, openSession, fmtDate };
}
