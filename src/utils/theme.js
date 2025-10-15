/**
 * Theme helpers extracted from main.js.
 * Provides functions to detect the system colour scheme,
 * apply a theme preference to the document root, and
 * initialise the theme from localStorage on page load.
 */
export function getSystemPref() {
  try {
    // Use the light scheme when the system prefers light; default to dark otherwise.
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  } catch (_) {
    return 'dark';
  }
}

export function applyThemePreference(pref) {
  // Accept 'light', 'dark' or 'system'. Resolve 'system' to the current system pref.
  let resolved = pref === 'system' ? getSystemPref() : pref;
  const root = document.documentElement;
  if (resolved === 'light') {
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
  } else {
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
  }
}

export function initThemeFromStorage() {
  // Read the saved preference from localStorage; default to system.
  const saved = localStorage.getItem('ui:theme') || 'system';
  applyThemePreference(saved);
  // When the user selects 'system', update the theme if the system pref changes.
  try {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener &&
      mq.addEventListener('change', () => {
        const current = localStorage.getItem('ui:theme') || 'system';
        if (current === 'system') applyThemePreference('system');
      });
  } catch (_) {
    // Ignore unsupported browsers.
  }
}