/**
 * Preference Hydration Helper
 * 
 * Loads user preferences during application bootstrap to prevent UI flashing
 * (theme/currency profile changes after render). This must be called as early
 * as possible in the initialization sequence, ideally before any UI rendering.
 * 
 * This module coordinates between:
 * - preferenceService: persistence layer (Firebase + localStorage)
 * - appState: centralized state management
 * - UI systems: theme applier, currency profile applier
 */

import * as preferenceService from '../services/preferenceService.js';
import * as appState from '../state/appState.js';
import { applyThemePreference } from '../utils/theme.js';
import { applyCurrencyProfile } from '../utils/currencyProfile.js';

/**
 * Initialize preferences from storage and apply them to the UI
 * This should be called very early in the app bootstrap sequence
 * 
 * @param {Object} config - Firebase config (if app is authenticated)
 * @returns {Promise<Object>} Loaded preferences
 */
export async function hydratePreferences(config = {}) {
  try {
    // Initialize preference service
    await preferenceService.init(config);
    
    // Try to migrate legacy preferences if they exist
    await preferenceService.migrateLegacyPreferences();
    
    // Load preferences from storage (only localStorage during hydration)
    const prefs = await preferenceService.load();
    
    console.log('[PreferenceHydration] Loaded preferences:', prefs);
    
    // Apply theme to document immediately (before any render)
    if (prefs.theme) {
      applyThemePreference(prefs.theme);
    }
    
    // Apply currency profile
    if (prefs.currencyProfile) {
      console.log('[PreferenceHydration] Applying currency profile from hydration:', prefs.currencyProfile);
      applyCurrencyProfile(prefs.currencyProfile, { persist: false });
    }
    
    // Update appState
    appState.setPreferences(prefs, { emit: false });
    appState.setPreferencesHydrated(true, { emit: false });
    
    console.log('[PreferenceHydration] Hydration complete, enabling Firebase loading');
    // Now that hydration is done, enable Firebase loading for future preference sync
    preferenceService.enableFirebaseLoad();
    
    // Subscribe to preference changes and sync with storage
    preferenceService.subscribe((changedPrefs) => {
      appState.setPreferences(changedPrefs, { emit: true });
    });
    
    // Subscribe to appState changes and persist preference updates
    appState.subscribeState(({ changedKeys }) => {
      if (changedKeys.includes('preferences')) {
        const currentPrefs = appState.getPreferences();
        preferenceService.save(currentPrefs, { emit: false }).catch(err => {
          console.warn('[PreferenceHydration] Failed to persist preferences:', err);
        });
      }
    });

    // Set up auth listener to sync preferences with Firebase when user authenticates
    if (typeof document !== 'undefined') {
      document.addEventListener('auth:state', async (e) => {
        const user = e.detail && e.detail.user;
        if (user) {
          // User just authenticated - sync LOCAL preferences to Firebase
          // IMPORTANT: We sync what the user has locally, not what's in Firebase
          // (which might be stale from a previous device/session)
          console.log('[PreferenceHydration] User authenticated, syncing LOCAL preferences to Firebase');
          const currentPrefs = appState.getPreferences();
          console.log('[PreferenceHydration] Syncing preferences to Firebase:', currentPrefs);
          try {
            await preferenceService.save(currentPrefs, { emit: false });
            console.log('[PreferenceHydration] Preferences successfully synced to Firebase');
          } catch (err) {
            console.warn('[PreferenceHydration] Failed to sync preferences on auth:', err);
          }
        }
      });
    }
    
    return prefs;
    
  } catch (err) {
    console.error('[PreferenceHydration] Failed to hydrate preferences:', err);
    
    // Fall back to defaults - apply theme at minimum to avoid flashing
    applyThemePreference('system');
    applyCurrencyProfile('BR', { persist: false });
    
    appState.setPreferencesHydrated(true, { emit: false });
    return appState.getPreferences();
  }
}

/**
 * Check if preferences are loaded
 * @returns {boolean}
 */
export function isHydrated() {
  return appState.isPreferencesHydrated();
}

/**
 * Get current preferences (from state, not storage)
 * @returns {Object}
 */
export function getCurrentPreferences() {
  return appState.getPreferences();
}

/**
 * Update a preference and sync to storage
 * @param {string} key - Preference key
 * @param {*} value - Preference value
 * @returns {Promise<Object>} Updated preferences
 */
export async function updatePreference(key, value) {
  // Update in appState first
  appState.setPreference(key, value, { emit: false });
  
  // Sync to storage
  const prefs = appState.getPreferences();
  await preferenceService.save(prefs, { emit: false });
  
  // Emit change
  appState.subscribeState(({ changedKeys }) => {
    if (changedKeys.includes('preferences')) {
      // Already emitted by previous setPreference call
    }
  });
  
  return prefs;
}

export default {
  hydratePreferences,
  isHydrated,
  getCurrentPreferences,
  updatePreference,
};
