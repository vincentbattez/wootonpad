import { computed, onMounted, watch } from 'vue';
import { api } from '../services/api.js';
import { avatarsStore } from '../../stores/avatars.js';
import { avatarFromPath, avatarFromName } from '../../avatar.mjs';

// The avatar fetch-and-cache, written once so the IPC call and the store write happen in
// exactly one place. Returns the cached data URL (or null) plus the initials-and-colour
// fallback; the SbAvatar primitive renders whichever is present. The caller passes a
// reactive key and the pair of functions that read and fetch it, so the same composable
// serves Projects (keyed by path) and Areas (keyed by id).
function useAvatar(keyRef, { cache, fetch, fallback }) {
  const dataUrl = computed(() => cache[keyRef.value] || null);

  async function load() {
    const key = keyRef.value;
    if (dataUrl.value || !key) return;
    const url = await Promise.resolve(fetch(key)).catch(() => null);
    if (url) cache[key] = url;
  }

  onMounted(load);
  watch(keyRef, load);

  return { dataUrl, fallback };
}

// A Project avatar: cached by filesystem path, fallback from the last path segment.
export function useProjectAvatar(projectPathRef) {
  return useAvatar(projectPathRef, {
    cache: avatarsStore.avatarDataUrls,
    fetch: (path) => api.getProjectAvatar?.(path),
    fallback: computed(() => avatarFromPath(projectPathRef.value)),
  });
}

// An Area avatar: cached by id, fallback from the Area's free-form name.
export function useAreaAvatar(areaIdRef, nameRef) {
  return useAvatar(areaIdRef, {
    cache: avatarsStore.areaAvatarDataUrls,
    fetch: (id) => api.getAreaAvatar?.(id),
    fallback: computed(() => avatarFromName(nameRef.value)),
  });
}
