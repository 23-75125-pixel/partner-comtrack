/** Preset avatar colors friends will see on the map */
export const AVATAR_COLORS = [
  "#2563EB",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
  "#14B8A6",
  "#6366F1",
];

/** Parse stored avatar_url — supports "color:#HEX" or plain hex */
export function parseAvatarColor(
  avatarUrl: string | null | undefined,
  fallback = "#2563EB",
) {
  if (!avatarUrl) return fallback;
  if (avatarUrl.startsWith("color:")) return avatarUrl.slice(6);
  if (avatarUrl.startsWith("#")) return avatarUrl;
  return fallback;
}

/** True when the stored value is an actual image source we can display */
export function isImageAvatarUrl(avatarUrl: string | null | undefined) {
  if (!avatarUrl) return false;
  return /^(https?:\/\/|file:\/\/|content:\/\/|data:)/i.test(avatarUrl);
}

/**
 * Single source of truth for turning a profile's `avatar_url` into
 * something a component can render — used by profile, friends, chats,
 * chat, and the map so every avatar renders identically everywhere.
 */
export function getAvatarDisplay(
  profile: { username?: string | null; avatar_url?: string | null } | null | undefined,
  fallbackColor = "#2563EB",
) {
  const avatarUrl = profile?.avatar_url ?? null;
  const hasImage = isImageAvatarUrl(avatarUrl);
  return {
    hasImage,
    imageUri: hasImage ? (avatarUrl as string) : null,
    color: parseAvatarColor(avatarUrl, fallbackColor),
    initial: (profile?.username || "?").charAt(0).toUpperCase(),
  };
}
