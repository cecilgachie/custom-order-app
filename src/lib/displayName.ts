/**
 * Names that were filled in automatically are not real names. If one of these
 * is stored in profiles.full_name we show the person's username instead.
 */
const PLACEHOLDER_NAMES = new Set(["valued customer", "customer", "unnamed account", "user", "guest"]);

/** The person's real name, or null when it is empty or a placeholder. */
export const realName = (name?: string | null): string | null => {
  const n = name?.trim();
  return n && !PLACEHOLDER_NAMES.has(n.toLowerCase()) ? n : null;
};

/** What to call someone: real name, else username, else the fallback. */
export const displayName = (
  profile?: { full_name?: string | null; username?: string | null } | null,
  fallback = "Customer"
): string => realName(profile?.full_name) || profile?.username?.trim() || fallback;