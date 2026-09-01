// Setting and clearing an Area's custom image (VIN-82). The heavy lifting — reading the file,
// resizing to ~128px, storing the bytes — happens in the main process; this is the thin renderer
// glue that resolves the dropped File to its OS path (as the terminal drop does) and mirrors the
// resulting data URL into the store so every AreaAvatar for that Area updates at once.

import { store } from './store.js';
import { api } from './shared/services/api.js';

// Set from an OS File (dropped or picked). Returns the new data URL, or null on failure.
export async function setAreaImageFromFile(areaId, file) {
  if (!areaId || !file || !api.setAreaImage) return null;
  const path = api.getPathForFile?.(file);
  if (!path) return null;
  const url = await api.setAreaImage(areaId, path).catch(() => null);
  if (url) store.areaAvatarDataUrls[areaId] = url;
  return url;
}

// Clear the image, returning the Area to its initials-and-colour fallback.
export async function clearAreaImage(areaId) {
  if (!areaId || !api.clearAreaImage) return;
  await api.clearAreaImage(areaId).catch(() => {});
  delete store.areaAvatarDataUrls[areaId];
}
