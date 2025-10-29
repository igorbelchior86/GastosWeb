/*
 * Cache utilities
 *
 * Provides scoped localStorage helpers for persisting small pieces of
 * profile‑specific data. Items are stored with a prefix of `cache_`
 * followed by the profile id (when applicable) and the key. Optionally
 * integrates with an asynchronous backing store (e.g. IndexedDB) when
 * configured on window.APP_CACHE_BACKING.
 */

import { scopedCacheKey, PROFILE_CACHE_KEYS } from './profile.js';

// Retrieve an optional backing store that exposes idbGet/idbSet/idbRemove
function resolveBacking() {
  if (typeof window === 'undefined') return null;
  return window.APP_CACHE_BACKING || null;
}

/**
 * Load a cached value from localStorage, falling back to an asynchronous
 * backing store when defined. When loaded from the backing store, the
 * value is warmed into localStorage for subsequent reads.
 *
 * @param {string} key base key to read
 * @param {*} fallback value to return when nothing is found
 * @returns {any}
 */
export function cacheGet(key, fallback) {
  const scopedKey = scopedCacheKey(key);
  const storageKey = `cache_${scopedKey}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw != null) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  // Legacy fallback: before profile scoping for BR, some keys were stored
  // without a profile prefix. If the scoped key is missing, try the
  // unscoped variant and, if found, migrate it into the scoped key.
  try {
    if (PROFILE_CACHE_KEYS && PROFILE_CACHE_KEYS.has && PROFILE_CACHE_KEYS.has(key)) {
      const legacyStorageKey = `cache_${key}`;
      const legacyRaw = window.localStorage.getItem(legacyStorageKey);
      if (legacyRaw != null) {
        const value = JSON.parse(legacyRaw);
        try { window.localStorage.setItem(storageKey, JSON.stringify(value)); } catch (_) {}
        return value;
      }
    }
  } catch {
    /* ignore */
  }
  // Asynchronous fallback
  try {
    const backing = resolveBacking();
    if (backing && typeof backing.idbGet === 'function') {
      (async () => {
        try {
          const value = await backing.idbGet(storageKey);
          if (value !== undefined) {
            window.localStorage.setItem(storageKey, JSON.stringify(value));
          }
        } catch {
          /* ignore */
        }
      })();
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * Persist a value to localStorage and optionally to an async backing store.
 *
 * @param {string} key base key
 * @param {*} value data to store
 */
export function cacheSet(key, value) {
  const scopedKey = scopedCacheKey(key);
  const storageKey = `cache_${scopedKey}`;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  try {
    const backing = resolveBacking();
    if (backing && typeof backing.idbSet === 'function') {
      backing.idbSet(storageKey, value);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Remove a cached item from localStorage and the backing store if present.
 *
 * @param {string} key base key
 */
export function cacheRemove(key) {
  const scopedKey = scopedCacheKey(key);
  const storageKey = `cache_${scopedKey}`;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
  try {
    const backing = resolveBacking();
    if (backing && typeof backing.idbRemove === 'function') {
      backing.idbRemove(storageKey);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Remove multiple keys using cacheRemove(). Accepts an array of base keys.
 *
 * @param {Array<string>} keys array of keys
 */
export function cacheClearProfile(keys) {
  if (!Array.isArray(keys)) return;
  keys.forEach((k) => cacheRemove(k));
}
