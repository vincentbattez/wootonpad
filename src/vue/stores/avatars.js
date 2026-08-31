import { reactive } from 'vue';

// Avatars: cached data: URLs keyed by Project path and by Area id.
export const avatars = reactive({
  // Project avatars: projectPath → data: URL string
  avatarDataUrls: {},
  // Area avatars: areaId → data: URL string (null/absent = fall back to initials and colour)
  areaAvatarDataUrls: {},
});
