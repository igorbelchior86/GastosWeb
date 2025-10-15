/**
 * Currency profile management utilities.
 * This module handles applying currency profiles to the app, including
 * setting up number formatting, updating UI features, and persisting choices.
 */

/**
 * Applies a currency profile to the application
 * @param {string} profileId - The ID of the profile to apply
 * @param {Object} options - Configuration options
 * @param {boolean} options.persist - Whether to save the choice to localStorage
 * @returns {boolean} True if profile was applied successfully
 */
export function applyCurrencyProfile(profileId, options = {}) {
  const { persist = true } = options;
  
  try {
    // Get available profiles
    const profiles = window.CURRENCY_PROFILES;
    if (!profiles || !profiles[profileId]) {
      console.warn(`Currency profile '${profileId}' not found`);
      return false;
    }

    const profile = profiles[profileId];
    
    // Create and set the number formatter
    createAppFormatter(profile);
    
    // Update UI features based on profile
    updateUIFeatures(profile);
    
    // Persist the choice if requested
    if (persist) {
      try {
        // Save to BOTH localStorage keys for compatibility:
        // - ui:profile: used by main.js boot sequence
        localStorage.setItem('ui:profile', profileId);
        // Note: ui:preferences:v2 should be saved by preferenceService.set()
        console.log('[currencyProfile] Saved profile to localStorage ui:profile:', profileId);
      } catch (error) {
        console.warn('Failed to save currency profile to localStorage:', error);
      }
    }

    // Dispatch event for other components to respond to profile changes
    const event = new CustomEvent('currencyProfileChanged', {
      detail: { profileId, profile }
    });
    window.dispatchEvent(event);

    return true;

  } catch (error) {
    console.error('Failed to apply currency profile:', error);
    return false;
  }
}

/**
 * Creates and assigns the global number formatter for the selected profile
 * @param {Object} profile - The currency profile object
 */
function createAppFormatter(profile) {
  try {
    // Create Intl.NumberFormat with profile settings
    window.APP_FMT = new Intl.NumberFormat(profile.locale, {
      style: 'currency',
      currency: profile.currency,
      minimumFractionDigits: profile.decimalPlaces || 2,
      maximumFractionDigits: profile.decimalPlaces || 2
    });

    // Also store the profile for reference
    window.APP_PROFILE = profile;
    window.CURRENT_PROFILE = profile;

  } catch (error) {
    console.warn('Failed to create number formatter, using fallback:', error);
    
    // Fallback formatter
    window.APP_FMT = {
      format: (value) => {
        const formatted = Math.abs(value || 0).toFixed(profile.decimalPlaces || 2);
        return `${profile.currency} ${formatted}`;
      }
    };
    window.APP_PROFILE = profile;
    window.CURRENT_PROFILE = profile;
  }
}

/**
 * Updates UI features based on the profile's feature flags
 * @param {Object} profile - The currency profile object
 */
function updateUIFeatures(profile) {
  const features = profile.features || {};
  
  // Handle invoice parcel feature
  updateInvoiceParcelFeature(features.invoiceParcel);
  
  // Add more feature handlers here as needed
  // updateOtherFeature(features.otherFeature);
}

/**
 * Shows or hides invoice parcel UI elements based on profile setting
 * @param {boolean} enabled - Whether the feature should be enabled
 */
function updateInvoiceParcelFeature(enabled) {
  try {
    // Find invoice parcel related elements
    const invoiceParcelCheckbox = document.getElementById('invoiceParcelCheckbox');
    const parcelasBlock = document.getElementById('parcelasBlock');
    const invoiceControls = document.querySelectorAll('.invoice-control');
    
    // Show/hide elements based on feature flag
    const display = enabled ? '' : 'none';
    
    if (invoiceParcelCheckbox) {
      const container = invoiceParcelCheckbox.closest('.form-group') || invoiceParcelCheckbox.parentElement;
      if (container) {
        container.style.display = display;
      }
    }
    
    if (parcelasBlock) {
      if (!enabled) {
        parcelasBlock.style.display = 'none';
      }
    }
    
    // Update any other invoice-related controls
    invoiceControls.forEach(el => {
      if (el) {
        el.style.display = display;
      }
    });

    // If disabled, also uncheck the checkbox and hide parcelas
    if (!enabled && invoiceParcelCheckbox) {
      invoiceParcelCheckbox.checked = false;
      if (parcelasBlock) {
        parcelasBlock.style.display = 'none';
      }
    }

  } catch (error) {
    console.warn('Error updating invoice parcel feature:', error);
  }
}

/**
 * Gets the currently active currency profile
 * @returns {Object|null} The current profile or null if none is set
 */
export function getCurrentProfile() {
  return window.CURRENT_PROFILE || null;
}

/**
 * Gets all available currency profiles
 * @returns {Object} Object containing all available profiles
 */
export function getAvailableProfiles() {
  return window.CURRENCY_PROFILES || {};
}

/**
 * Formats a number using the current profile's formatter
 * @param {number} value - The number to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value) {
  try {
    if (window.APP_FMT && typeof window.APP_FMT.format === 'function') {
      return window.APP_FMT.format(value || 0);
    }
  } catch (error) {
    console.warn('Error formatting currency:', error);
  }
  
  // Fallback formatting
  const profile = getCurrentProfile();
  const currency = profile?.currency || 'USD';
  const formatted = Math.abs(value || 0).toFixed(profile?.decimalPlaces || 2);
  return `${currency} ${formatted}`;
}

/**
 * Initializes the currency profile system
 */
export function initCurrencyProfiles() {
  try {
    // Try to load saved profile from localStorage
    const savedProfile = localStorage.getItem('ui:profile');
    
    if (savedProfile) {
      applyCurrencyProfile(savedProfile, { persist: false });
    } else {
      // Apply default profile (first available)
      const profiles = getAvailableProfiles();
      const defaultProfileId = Object.keys(profiles)[0];
      if (defaultProfileId) {
        applyCurrencyProfile(defaultProfileId);
      }
    }
  } catch (error) {
    console.warn('Error initializing currency profiles:', error);
  }
}