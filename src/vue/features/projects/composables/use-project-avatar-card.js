import { ref, computed } from 'vue';
import { api } from '../../../shared/services/api.js';
import { avatarsStore } from '../../../stores/avatars.js';
import { avatarFromPath } from '../../../avatar.mjs';

// The Project Viewer's Avatar card (GitLab projects only): the cached preview and the "Update
// Avatar" refetch. Split from the Git Snapshot it used to sit beside. Writes the shared avatars
// cache so the header ProjectAvatar and the sidebar rows pick the new image up for free.
// `project` is the ref to the Project in view; `overview` carries its remote URL.
export function useProjectAvatarCard(project, overview) {
  const avatarDataUrl = ref(null);
  const avatarLoading = ref(false);

  // The pure seam rather than the legacy `window.getProjectAvatar` global: same algorithm,
  // no dependency on a browser global that may not exist yet.
  const avatar = computed(() =>
    project.value
      ? avatarFromPath(project.value.projectPath)
      : { initials: '?', color: '#666' }
  );

  async function loadAvatar() {
    if (!project.value) return;
    const url = await Promise.resolve(api.getProjectAvatar?.(project.value.projectPath)).catch(() => null);
    avatarDataUrl.value = url;
    if (url) avatarsStore.avatarDataUrls[project.value.projectPath] = url;
  }

  async function updateAvatar() {
    if (!project.value || !overview.value?.remoteUrl) return;
    avatarLoading.value = true;
    try {
      const url = await api.fetchGitlabAvatar?.(project.value.projectPath, overview.value.remoteUrl);
      avatarDataUrl.value = url;
      if (url) avatarsStore.avatarDataUrls[project.value.projectPath] = url;
      else delete avatarsStore.avatarDataUrls[project.value.projectPath];
    } catch (e) {
      console.error('Avatar fetch failed:', e);
    } finally {
      avatarLoading.value = false;
    }
  }

  function reset() {
    avatarDataUrl.value = null;
  }

  return { avatarDataUrl, avatarLoading, avatar, loadAvatar, updateAvatar, reset };
}
