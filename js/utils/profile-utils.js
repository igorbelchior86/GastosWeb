/**
 * Profile-related helpers shared across modules.
 * Encapsulates logic for resolving the active currency profile
 * and deriving cache/database keys with profile scoping.
 */

const DEFAULT_PROFILE = { id: 'BR', locale: 'pt-BR', currency: 'BRL', decimalPlaces: 2 };
const LEGACY_PROFILE_ID = DEFAULT_PROFILE.id;
const PROFILE_DATA_KEYS = new Set(['tx', 'cards', 'startBal', 'startDate', 'startSet']);
const PROFILE_CACHE_KEYS = new Set([...PROFILE_DATA_KEYS, 'dirtyQueue']);

function getRuntimeProfile() {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  const profiles = window.CURRENCY_PROFILES || {};
  if (window.APP_PROFILE) return window.APP_PROFILE;
  try {
    const saved = window.localStorage?.getItem?.('ui:profile');
    if (saved && profiles[saved]) return profiles[saved];
  } catch (_) {}
  const first = Object.values(profiles)[0];
  return first || DEFAULT_PROFILE;
}

function getCurrencyName() {
  const profile = getRuntimeProfile();
  return profile.currency || DEFAULT_PROFILE.currency;
}

function getCurrentProfileId() {
  const profile = getRuntimeProfile();
  const pid = profile && profile.id ? profile.id : LEGACY_PROFILE_ID;
  return pid || LEGACY_PROFILE_ID;
}

function scopedCacheKey(key) {
  if (!PROFILE_CACHE_KEYS.has(key)) return key;
  const profileId = getCurrentProfileId();
  if (!profileId || profileId === LEGACY_PROFILE_ID) return key;
  return `${profileId}::${key}`;
}

function scopedDbSegment(key) {
  if (!PROFILE_DATA_KEYS.has(key)) return key;
  const profileId = getCurrentProfileId();
  if (!profileId || profileId === LEGACY_PROFILE_ID) return key;
  return `profiles/${profileId}/${key}`;
}

export {
  DEFAULT_PROFILE,
  LEGACY_PROFILE_ID,
  PROFILE_DATA_KEYS,
  PROFILE_CACHE_KEYS,
  getRuntimeProfile,
  getCurrencyName,
  getCurrentProfileId,
  scopedCacheKey,
  scopedDbSegment
};

// Maintain globals for legacy code relying on window access
if (typeof window !== 'undefined') {
  window.APP_DEFAULT_PROFILE = DEFAULT_PROFILE;
  window.APP_PROFILE_ID = getCurrentProfileId;
}
