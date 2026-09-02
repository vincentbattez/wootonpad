import { ref, onMounted, onUnmounted } from 'vue';

// The Project Viewer's stats refresh: the manual "Refresh" button and the quiet 30-second poll
// that keeps the Git Snapshot current while sessions are running. Pure timing orchestration — it
// owns no service call, only when to fire the two the Git Snapshot exposes — so "refresh" can
// change without touching the git plumbing. `hasActiveSessions` gates the poll; `refreshFull`
// reloads overview and branches, `refreshSilent` reloads the overview alone.
export function useStatsRefresh({ hasActiveSessions, refreshFull, refreshSilent }) {
  const statsRefreshing = ref(false);
  let timer = null;

  async function refreshStats() {
    if (statsRefreshing.value) return;
    statsRefreshing.value = true;
    try {
      await refreshFull();
    } finally {
      statsRefreshing.value = false;
    }
  }

  onMounted(() => {
    timer = setInterval(() => {
      if (!hasActiveSessions()) return;
      refreshSilent();
    }, 30000);
  });

  onUnmounted(() => clearInterval(timer));

  return { statsRefreshing, refreshStats };
}
