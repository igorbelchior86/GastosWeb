/**
 * Cache helpers centralizando prefixos e persistência cross-profile.
 */

import { scopedCacheKey } from './profile-utils.js';

function resolveBacking() {
  if (typeof window === 'undefined') return null;
  return window.APP_CACHE_BACKING || null;
}

export function cacheGet(key, fallback) {
  const scopedKey = scopedCacheKey(key);
  const storageKey = `cache_${scopedKey}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw != null) return JSON.parse(raw);
  } catch (_) {}

  // Fallback: tenta IndexedDB assíncrono e aquece o localStorage
  try {
    const backing = resolveBacking();
    if (backing && typeof backing.idbGet === 'function') {
      (async () => {
        try {
          const value = await backing.idbGet(storageKey);
          if (value !== undefined) {
            window.localStorage.setItem(storageKey, JSON.stringify(value));
          }
        } catch (_) {}
      })();
    }
  } catch (_) {}
  return fallback;
}

export function cacheSet(key, value) {
  const scopedKey = scopedCacheKey(key);
  const storageKey = `cache_${scopedKey}`;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch (_) {}
  try {
    const backing = resolveBacking();
    if (backing && typeof backing.idbSet === 'function') {
      backing.idbSet(storageKey, value);
    }
  } catch (_) {}
}

export function cacheRemove(key) {
  const scopedKey = scopedCacheKey(key);
  const storageKey = `cache_${scopedKey}`;
  try {
    window.localStorage.removeItem(storageKey);
  } catch (_) {}
  try {
    const backing = resolveBacking();
    if (backing && typeof backing.idbRemove === 'function') {
      backing.idbRemove(storageKey);
    }
  } catch (_) {}
}

export function cacheClearProfile(keys) {
  if (!Array.isArray(keys)) return;
  keys.forEach(k => cacheRemove(k));
}

if (typeof window !== 'undefined') {
  window.cacheGet = cacheGet;
  window.cacheSet = cacheSet;
  window.cacheRemove = cacheRemove;
}
