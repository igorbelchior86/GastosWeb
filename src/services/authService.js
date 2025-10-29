/*
 * Authentication service
 *
 * Provides a thin wrapper around Firebase Authentication for signing in
 * with Google and tracking the current user. Listeners can subscribe to
 * authentication state changes to react when the user signs in or out.
 */

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  initializeAuth,
  browserPopupRedirectResolver,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  signOut as fbSignOut
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

// Consumers must supply their own Firebase config. The config should be
// passed to init() prior to calling any other functions on this module.
let auth = null;
let app = null;

// Internally track listeners to auth state
const listeners = new Set();

/**
 * Initialise the Firebase Auth service. Accepts a Firebase config
 * object. If the app has already been initialised elsewhere, calling
 * init() with no arguments will reuse the existing app.
 *
 * @param {object} [config] Firebase configuration
 */
export async function init(config) {
  // Determine whether to reuse an existing app or initialise a new one
  const getOrInitApp = () => {
    try {
      return getApps().length ? getApp() : initializeApp(config);
    } catch {
      return initializeApp(config);
    }
  };
  app = getOrInitApp();
  // Determine persistence based on platform. iOS PWAs cannot reliably
  // use IndexedDB persistence so fall back to browserLocalPersistence.
  const ua = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                     ('standalone' in navigator && navigator.standalone);
  const persistence = (isIOS && standalone)
    ? browserLocalPersistence
    : indexedDBLocalPersistence;
  // Initialise auth instance, catching the case where it already exists
  try {
    auth = initializeAuth(app, {
      persistence,
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } catch {
    auth = getAuth(app);
    // If reusing an existing instance, ensure persistence is set
    try {
      await setPersistence(auth, persistence);
    } catch {
      // Fallback to in-memory persistence on failure
      try {
        await setPersistence(auth, inMemoryPersistence);
      } catch {
        /* ignore */
      }
    }
  }
  // Configure Google provider
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  auth.languageCode = 'pt_BR';
  // Subscribe internal listener that delegates to registered callbacks
  onAuthStateChanged(auth, (user) => {
    listeners.forEach((fn) => {
      try {
        fn(user);
      } catch (err) {
        console.error('Auth listener error', err);
      }
    });
  });
  
  // Complete any pending redirect immediately after init (critical for PWA resume)
  setTimeout(async () => {
    try {
      const result = await completeRedirectIfAny();
      if (result && result.user) {
        console.log('AuthService: Completed pending redirect for', result.user.email);
      }
    } catch (err) {
      console.warn('AuthService: Error completing redirect:', err);
    }
  }, 100);
}

/**
 * Subscribe to authentication state changes. Returns an unsubscribe
 * function that removes the listener when invoked.
 *
 * @param {function} fn callback invoked with the current user or null
 * @returns {function}
 */
export function onAuthChanged(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Sign in the current anonymous user with Google. When the user is
 * already signed in and isAnonymous is true, the anonymous session is
 * linked to the Google account so that local data can be preserved. On
 * PWA iOS installs, a popup flow is used for reliability; in other
 * contexts, a redirect flow may be used.
 */
export async function signInWithGoogle() {
  if (!auth) throw new Error('Auth service not initialised');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const ua = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                     ('standalone' in navigator && navigator.standalone);
  // We strongly prefer popup for reliability and UX consistency.
  // Use redirect only as a fallback when the popup is blocked or unsupported.
  const crossOriginIsolated = !!window.crossOriginIsolated;
  const user = auth.currentUser;
  try {
    // If offline, don't attempt popup/redirect flows which require network
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const err = new Error('Network unavailable');
      err.code = 'auth/network-request-failed';
      throw err;
    }
    if (user && user.isAnonymous) {
      // Link anonymous session to Google to retain data. Prefer popup; fallback to redirect on known popup failures.
      try {
        // Even in COOP contexts we try popup first; if browser blocks, we'll catch and fallback.
        return await linkWithPopup(user, provider);
      } catch (linkErr) {
        console.warn('linkWithPopup failed, falling back to redirect:', linkErr);
        return await linkWithRedirect(user, provider);
      }
    }
    // Attempt popup first and fallback to redirect on known popup errors
    // or internal assertion failures. Be defensive about network state.
    try {
      // iOS PWA and regular browsers: popup first for consistent UX
      return await signInWithPopup(auth, provider);
    } catch (err) {
      console.warn('signInWithPopup failed, attempting redirect fallback', err && (err.code || err.message));
      const msg = err && (err.message || '');
      const shouldFallback = (
        err && (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user' || err.code === 'auth/operation-not-supported-in-this-environment' || err.code === 'auth/network-request-failed')
      ) || /Pending promise was never set|Cross-Origin-Opener-Policy/i.test(msg);

      if (!navigator.onLine) {
        // Surface network error directly
        throw err;
      }

      if (shouldFallback) {
        return await signInWithRedirect(auth, provider);
      }
      throw err;
    }
  } catch (err) {
    console.error('Google sign‑in failed', err);
    throw err;
  }
}

/**
 * Attempt to complete a redirect sign‑in if one is pending. Should be
 * invoked on page load to finalise an in‑progress sign‑in. Returns
 * either the result of the redirect or null when none is pending.
 */
export async function completeRedirectIfAny() {
  if (!auth) return null;
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      return result;
    }
  } catch (err) {
    console.error('Redirect result error', err);
  }
  return null;
}

/**
 * Sign out the current user. Catches and ignores errors.
 */
export async function signOut() {
  if (!auth) return;
  try {
    await fbSignOut(auth);
  } catch {
    /* ignore sign out errors */
  }
}

/**
 * Get the currently authenticated user (or null). Do not rely on this
 * value being immediately up to date; instead subscribe to changes via
 * onAuthChanged().
 *
 * @returns {import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js').User|null}
 */
export function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

// Expose for debugging
export const AuthService = {
  init,
  onAuthChanged,
  signInWithGoogle,
  completeRedirectIfAny,
  signOut,
  getCurrentUser
};

if (typeof window !== 'undefined') {
  window.AuthService = AuthService;
}
