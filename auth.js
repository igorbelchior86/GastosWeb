// auth.js – Firebase Auth bootstrap (Google only) + window.Auth facade
// Loads alongside index.html before main.js. Works even if main.js already
// initialized Firebase (uses getApps/getApp).

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
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
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { firebaseConfig } from './firebase.prod.config.js';

function getOrInitApp() {
  try { return getApps().length ? getApp() : initializeApp(firebaseConfig); }
  catch (_) { return initializeApp(firebaseConfig); }
}

const app = getOrInitApp();
// Initialize Auth early with the right persistence (more reliable on iOS PWA)
const ua = (navigator.userAgent || '').toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(ua);
const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ('standalone' in navigator && navigator.standalone);
let auth;
try {
  if (isIOS && standalone) {
    auth = initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } else {
    auth = initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver
    });
  }
} catch (_) {
  // If already initialized elsewhere, fall back to getAuth + runtime setPersistence
  auth = getAuth(app);
  try { await setPersistence(auth, (isIOS && standalone) ? browserLocalPersistence : indexedDBLocalPersistence); }
  catch { try { await setPersistence(auth, browserLocalPersistence); } catch { await setPersistence(auth, inMemoryPersistence); } }
}

// Configure Google provider
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
auth.languageCode = 'pt_BR';

const listeners = new Set();
const emit = (user) => { listeners.forEach(fn => { try { fn(user); } catch {} }); };

// Enhanced auth state handling for iOS PWA
onAuthStateChanged(auth, (user) => {
  console.log('Auth state changed:', user ? user.email : 'signed out');
  if (user) {
    // Ensure persistence is maintained for iOS PWA
    if (isIOS && standalone) {
      console.log('iOS PWA: User authenticated, ensuring persistence');
      try {
        // Force persistence to be set again for iOS PWA reliability
        setPersistence(auth, browserLocalPersistence).catch(err => {
          console.warn('iOS PWA: Could not re-set persistence:', err);
        });
      } catch (err) {
        console.warn('iOS PWA: Persistence error:', err);
      }
    }
  }
  
  emit(user);
  document.dispatchEvent(new CustomEvent('auth:state', { detail: { user } }));
});

function isStandalone() {
  // Detect PWA standalone (iOS/Android)
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
         // iOS < 13
         (typeof navigator !== 'undefined' && 'standalone' in navigator && navigator.standalone);
}

async function completeRedirectIfAny() {
  try { 
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      console.log('iOS PWA: Redirect auth successful for', result.user.email);
      // Clear redirect flag
      try { sessionStorage.removeItem('wasRedirectLogin'); } catch(_) {}
      return result;
    }
  } catch (err) {
    console.error('iOS PWA: Redirect result error:', err);
    // Clear redirect flag on error
    try { sessionStorage.removeItem('wasRedirectLogin'); } catch(_) {}
  }
  return null;
}

// Enhanced iOS PWA redirect handling
let redirectPromise = null;
if (isIOS && standalone) {
  redirectPromise = completeRedirectIfAny();
} else {
  completeRedirectIfAny();
}

async function signInWithGoogle() {
  try {
    const useRedirect = isStandalone();
    console.log('signInWithGoogle called, useRedirect:', useRedirect, 'isIOS:', isIOS, 'standalone:', standalone);
    
    // Mark redirect login for iOS PWA tracking
    try { if (useRedirect) sessionStorage.setItem('wasRedirectLogin', '1'); } catch(_){ }
    
    const u = auth.currentUser;
    if (u && u.isAnonymous) {
      // Link anonymous session to Google to preserve any local data
      if (useRedirect) return await linkWithRedirect(u, provider);
      return await linkWithPopup(u, provider);
    }
    
    if (useRedirect) {
      console.log('iOS PWA: Starting signInWithRedirect');
      return await signInWithRedirect(auth, provider);
    }
    
    try {
      return await signInWithPopup(auth, provider);
    } catch (err) {
      // Fallback to redirect for environments blocking popups
      if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user' || err.code === 'auth/operation-not-supported-in-this-environment')) {
        console.log('Popup blocked, falling back to redirect');
        try { sessionStorage.setItem('wasRedirectLogin', '1'); } catch(_) {}
        return await signInWithRedirect(auth, provider);
      }
      throw err;
    }
  } catch (err) {
    console.error('Google sign‑in failed:', err);
    try { sessionStorage.removeItem('wasRedirectLogin'); } catch(_) {}
    try { document.dispatchEvent(new CustomEvent('auth:error', { detail: { code: err.code, message: err.message } })); } catch (_) {}
    throw err;
  }
}

async function signOut() {
  try { await fbSignOut(auth); } catch (_) {}
}

// Expose tiny facade
window.Auth = {
  auth,
  onReady(cb) { if (typeof cb === 'function') listeners.add(cb); },
  off(cb) { listeners.delete(cb); },
  signInWithGoogle,
  signOut,
  get currentUser() { return auth.currentUser; },
  // iOS PWA helper to wait for redirect completion
  async waitForRedirect() {
    if (redirectPromise) {
      console.log('iOS PWA: Waiting for redirect completion...');
      const result = await redirectPromise;
      redirectPromise = null;
      return result;
    }
    return null;
  }
};

// Enhanced iOS PWA startup sequence
if (isIOS && standalone) {
  console.log('iOS PWA: Enhanced startup sequence initiated');
  // Give extra time for iOS PWA to complete redirect and establish connection
  setTimeout(() => {
    if (!auth.currentUser) {
      console.log('iOS PWA: No user after extended startup, checking redirect result again');
      completeRedirectIfAny().then(result => {
        if (result) {
          console.log('iOS PWA: Late redirect result found');
        }
      });
    }
  }, 1500);
}

document.dispatchEvent(new CustomEvent('auth:init'));
