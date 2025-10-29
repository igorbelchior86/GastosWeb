/*
 * Profile utilities
 *
 * Provide helpers for resolving the active currency/locale profile and
 * generating keys scoped to a particular profile. This enables multi‑profile
 * support without cluttering individual modules with profile logic.
 */

export const DEFAULT_PROFILE = { id: 'BR', locale: 'pt-BR', currency: 'BRL', decimalPlaces: 2 };
// Legacy behaviour used to treat the default profile (BR) as unscoped.
// After data migration, ALL profiles (including BR) must be scoped under
// profiles/<ID> in RTDB and use profile‑scoped cache keys.
export const LEGACY_PROFILE_ID = null;
export const PROFILE_DATA_KEYS = new Set(['tx', 'cards', 'startBal', 'startDate', 'startSet', 'budgets']);
export const PROFILE_CACHE_KEYS = new Set([...PROFILE_DATA_KEYS, 'dirtyQueue']);

/**
 * Determine the active runtime profile. Looks up the profile in the
 * global CURRENCY_PROFILES map (attached to window) and falls back to
 * DEFAULT_PROFILE when none is found. The profile id may be persisted
 * in localStorage under the `ui:profile` key. Intended for browser use.
 *
 * @returns {object} active profile
 */
export function getRuntimeProfile() {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  const profiles = window.CURRENCY_PROFILES || {};
  if (window.APP_PROFILE) return window.APP_PROFILE;
  try {
    const saved = window.localStorage?.getItem?.('ui:profile');
    if (saved && profiles[saved]) return profiles[saved];
  } catch {
    /* ignore */
  }
  const first = Object.values(profiles)[0];
  return first || DEFAULT_PROFILE;
}

/**
 * Resolve the display currency for the current profile.
 *
 * @returns {string}
 */
export function getCurrencyName() {
  const profile = getRuntimeProfile();
  return profile.currency || DEFAULT_PROFILE.currency;
}

/**
 * Get the current profile’s identifier.
 *
 * @returns {string}
 */
export function getCurrentProfileId() {
  const profile = getRuntimeProfile();
  const pid = profile && profile.id ? profile.id : LEGACY_PROFILE_ID;
  return pid || LEGACY_PROFILE_ID;
}

/**
 * Scope a cache key to the current profile. When the key is not one of
 * the recognised cache keys, it is returned unchanged.
 *
 * @param {string} key base key
 * @returns {string} scoped key
 */
export function scopedCacheKey(key) {
  if (!PROFILE_CACHE_KEYS.has(key)) return key;
  const profileId = getCurrentProfileId();
  if (!profileId) return key;
  return `${String(profileId)}::${key}`;
}

/**
 * Scope a database segment to the current profile. When the key is not
 * one of the recognised data keys, it is returned unchanged.
 *
 * @param {string} key base key
 * @returns {string} scoped database segment
 */
export function scopedDbSegment(key) {
  if (!PROFILE_DATA_KEYS.has(key)) return key;
  const profileId = getCurrentProfileId();
  if (!profileId) return key;
  return `profiles/${String(profileId)}/${key}`;
}
