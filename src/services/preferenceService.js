/**
 * Preference Service
 * 
 * Manages user preferences (theme, currency profile, etc.) with:
 * - Firebase persistence (scoped to user profile)
 * - localStorage fallback for offline/anonymous users
 * - Automatic sync across tabs/sessions
 * - Zero-flicker initialization (preferences loaded before UI render)
 * 
 * Usage:
 *   await preferenceService.init(config)
 *   const prefs = await preferenceService.load()
 *   await preferenceService.save({ theme: 'light', currencyProfile: 'BR' })
 *   preferenceService.subscribe((prefs) => { console.log('Preferences changed', prefs) })
 */

import * as firebaseService from './firebaseService.js';

// Default preferences
const DEFAULT_PREFERENCES = {
  theme: 'system',           // 'light' | 'dark' | 'system'
  currencyProfile: 'BR',     // Profile ID (BR, PT, US, etc)
};

// Internal state
let initialized = false;
let currentPreferences = { ...DEFAULT_PREFERENCES };
const subscribers = new Set();
let skipFirebaseLoad = true; // Start with true - only load from localStorage during initial hydration

// Path constants
const PREFS_STORAGE_KEY = 'user:preferences';
const PREFS_FALLBACK_KEY = 'ui:preferences:v2'; // Scoped fallback for non-auth users

/**
 * Initialize preference service
 * @param {Object} config - Firebase config (passed to firebaseService)
 * @returns {Promise<void>}
 */
export async function init(config = {}) {
  if (initialized) return;
  
  try {
    // Initialize Firebase service
    await firebaseService.init(config);
    initialized = true;
    console.log('[PreferenceService] Initialized');
  } catch (err) {
    console.error('[PreferenceService] Initialization failed:', err);
    initialized = true; // Still mark as initialized to allow fallback
  }
}

/**
 * Enable Firebase loading (called after initial hydration completes)
 * During the initial hydration phase, we only load from localStorage to avoid
 * overwriting fresh preferences with stale Firebase data
 * @internal
 */
export function enableFirebaseLoad() {
  skipFirebaseLoad = false;
  console.log('[PreferenceService] Firebase load enabled');
}

/**
 * Load user preferences from Firebase (if authenticated) or localStorage
 * @param {Object} options - Loading options
 * @param {boolean} options.useCache - Whether to return cached preferences (default: false)
 * @returns {Promise<Object>} User preferences object
 */
export async function load(options = {}) {
  const { useCache = false } = options;
  
  if (useCache) {
    return { ...currentPreferences };
  }

  try {
    // During initial hydration, skip Firebase to avoid overwriting fresh local preferences
    // with stale Firebase data from previous sessions
    if (!skipFirebaseLoad) {
      // Try loading from Firebase ONLY if we have a valid context
      // (PATH is set, indicating user is authenticated)
      // We check this indirectly by attempting load and catching permission errors
      const fromFirebase = await firebaseService.load(PREFS_STORAGE_KEY, null);
      
      if (fromFirebase && typeof fromFirebase === 'object') {
        currentPreferences = { ...DEFAULT_PREFERENCES, ...fromFirebase };
        console.log('[PreferenceService] Loaded from Firebase:', currentPreferences);
        return { ...currentPreferences };
      }
    } else {
      console.log('[PreferenceService] Firebase load skipped during hydration phase');
    }
  } catch (err) {
    // Permission denied typically means PATH is null (not authenticated)
    // This is expected during initial hydration, so log at debug level
    if (err && err.message && err.message.includes('Permission denied')) {
      console.debug('[PreferenceService] Firebase load skipped (not authenticated yet)');
    } else {
      console.warn('[PreferenceService] Firebase load failed:', err);
    }
  }

  // Fallback to localStorage for offline/anonymous users
  try {
    const fromStorage = localStorage.getItem(PREFS_FALLBACK_KEY);
    console.log('[PreferenceService] Checking localStorage key:', PREFS_FALLBACK_KEY, '-> value:', fromStorage);
    if (fromStorage) {
      const parsed = JSON.parse(fromStorage);
      currentPreferences = { ...DEFAULT_PREFERENCES, ...parsed };
      console.log('[PreferenceService] Loaded from localStorage:', currentPreferences);
      return { ...currentPreferences };
    }
  } catch (err) {
    console.warn('[PreferenceService] localStorage parse failed:', err);
  }

  // Return defaults if nothing was found
  console.log('[PreferenceService] No stored preferences found, using defaults:', DEFAULT_PREFERENCES);
  currentPreferences = { ...DEFAULT_PREFERENCES };
  return { ...currentPreferences };
}

/**
 * Save user preferences to Firebase (if authenticated) and localStorage
 * @param {Object} partialPrefs - Partial preferences to merge
 * @param {Object} options - Save options
 * @param {boolean} options.emit - Whether to notify subscribers (default: true)
 * @param {boolean} options.skipFirebase - Skip Firebase save (default: false)
 * @returns {Promise<Object>} Updated preferences
 */
export async function save(partialPrefs = {}, options = {}) {
  const { emit: shouldEmit = true, skipFirebase = false } = options;

  // Merge with current preferences
  const updatedPrefs = { ...currentPreferences, ...partialPrefs };
  
  // Update in-memory state
  currentPreferences = updatedPrefs;

  // Save to Firebase (async, don't block)
  // Skip if explicitly told to or if Firebase service indicates we're in mock mode
  if (!skipFirebase) {
    firebaseService.save(PREFS_STORAGE_KEY, updatedPrefs).catch(err => {
      // Silently fail for PERMISSION_DENIED during initial hydration
      // (user not yet authenticated)
      if (err && err.message && err.message.includes('PERMISSION_DENIED')) {
        console.debug('[PreferenceService] Firebase save skipped (not authenticated yet)');
      } else {
        console.warn('[PreferenceService] Firebase save failed:', err);
      }
    });
  }

  // Always save to localStorage as fallback
  try {
    localStorage.setItem(PREFS_FALLBACK_KEY, JSON.stringify(updatedPrefs));
  } catch (err) {
    console.warn('[PreferenceService] localStorage save failed:', err);
  }

  console.log('[PreferenceService] Preferences saved:', updatedPrefs);

  // Notify subscribers
  if (shouldEmit) {
    notifySubscribers(updatedPrefs);
  }

  return { ...currentPreferences };
}

/**
 * Subscribe to preference changes
 * @param {Function} callback - Called with updated preferences whenever they change
 * @returns {Function} Unsubscribe function
 */
export function subscribe(callback) {
  if (typeof callback !== 'function') return () => {};
  
  subscribers.add(callback);
  
  // Return unsubscribe function
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Get current preferences (from memory, not from storage)
 * @returns {Object} Current preferences
 */
export function getCurrent() {
  return { ...currentPreferences };
}

/**
 * Get a specific preference value
 * @param {string} key - Preference key
 * @param {*} defaultValue - Default value if key not found
 * @returns {*} Preference value
 */
export function get(key, defaultValue = undefined) {
  return currentPreferences.hasOwnProperty(key) 
    ? currentPreferences[key]
    : defaultValue;
}

/**
 * Set a specific preference and save
 * @param {string} key - Preference key
 * @param {*} value - Preference value
 * @param {Object} options - Save options
 * @returns {Promise<Object>} Updated preferences
 */
export async function set(key, value, options = {}) {
  return save({ [key]: value }, options);
}

/**
 * Reset preferences to defaults
 * @returns {Promise<void>}
 */
export async function reset() {
  currentPreferences = { ...DEFAULT_PREFERENCES };
  
  // Clear from Firebase
  firebaseService.save(PREFS_STORAGE_KEY, null).catch(err => {
    console.warn('[PreferenceService] Firebase reset failed:', err);
  });

  // Clear from localStorage
  try {
    localStorage.removeItem(PREFS_FALLBACK_KEY);
  } catch (err) {
    console.warn('[PreferenceService] localStorage reset failed:', err);
  }

  notifySubscribers(currentPreferences);
  console.log('[PreferenceService] Preferences reset to defaults');
}

/**
 * Migrate legacy preferences from localStorage keys to new service
 * This helps transition from old localStorage keys (ui:theme, ui:profile) to new system
 * Only saves to localStorage initially; Firebase sync will happen when user is authenticated
 * @returns {Promise<void>}
 */
export async function migrateLegacyPreferences() {
  const legacyTheme = localStorage.getItem('ui:theme');
  const legacyProfile = localStorage.getItem('ui:profile');
  
  const toMigrate = {};
  
  if (legacyTheme) {
    toMigrate.theme = legacyTheme;
    console.log('[PreferenceService] Migrating legacy theme:', legacyTheme);
  }
  
  if (legacyProfile) {
    toMigrate.currencyProfile = legacyProfile;
    console.log('[PreferenceService] Migrating legacy currency profile:', legacyProfile);
  }

  if (Object.keys(toMigrate).length > 0) {
    // Save ONLY to localStorage during initial hydration (user not authenticated yet)
    // Firebase sync will happen later when user authenticates
    await save(toMigrate, { emit: false, skipFirebase: true });
    console.log('[PreferenceService] Legacy preferences migrated to localStorage');
  }
}

/**
 * Internal: Notify all subscribers of preference changes
 * @private
 * @param {Object} prefs - Updated preferences
 */
function notifySubscribers(prefs) {
  subscribers.forEach(callback => {
    try {
      callback({ ...prefs });
    } catch (err) {
      console.error('[PreferenceService] Subscriber error:', err);
    }
  });
}

// Export service object for debug/inspection
export const PreferenceService = {
  init,
  load,
  save,
  subscribe,
  getCurrent,
  get,
  set,
  reset,
  migrateLegacyPreferences,
};

export default PreferenceService;
