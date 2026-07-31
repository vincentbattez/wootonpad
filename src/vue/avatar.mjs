// The initials-and-colour fallback shown when an avatar has no stored image. Extracted here as a
// pure seam so it serves both Projects (keyed by filesystem path) and Areas (keyed by a free-form
// name) from one algorithm — and so it can be tested without a DOM or Electron. The values match
// the long-standing getProjectAvatar in public/utils.js, so Project avatars are unchanged.

export const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
  '#F97316', '#06B6D4', '#EF4444', '#84CC16', '#6366F1',
  '#14B8A6', '#F43F5E', '#A855F7', '#0EA5E9', '#22C55E',
];

// Deterministic {initials, color} from a display name (like JetBrains project icons).
export function avatarFromName(name) {
  const s = name || '';
  const parts = s
    .replace(/[-_.]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : s.slice(0, 2).toUpperCase() || '?';
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return { initials, color: AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length] };
}

// A Project's name is the last segment of its path; the colour and initials then follow the name.
export function avatarFromPath(projectPath) {
  const name = (projectPath || '').split('/').filter(Boolean).pop() || '';
  return avatarFromName(name);
}
