// auth.js – Firebase Auth bootstrap (Google only) + window.Auth facade
// Loads alongside index.html before main.js. Works even if main.js already
// initialized Firebase (uses getApps/getApp).

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-app.js";
import {
  getAuth,
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
} from "https://www.gstatic.com/firebasejs/10.3.1/firebase-auth.js";
import { firebaseConfig } from './firebase.prod.config.js';

function getOrInitApp() {
  try { return getApps().length ? getApp() : initializeApp(firebaseConfig); }
  catch (_) { return initializeApp(firebaseConfig); }
}

const app = getOrInitApp();
const auth = getAuth(app);
// Persistence: in iOS PWA (standalone), IndexedDB can be unreliable after OAuth
// Use LocalStorage there. Else prefer IndexedDB with fallbacks.
const ua = (navigator.userAgent || '').toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(ua);
const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ('standalone' in navigator && navigator.standalone);
try {
  if (isIOS && standalone) {
    await setPersistence(auth, browserLocalPersistence);
  } else {
    await setPersistence(auth, indexedDBLocalPersistence);
  }
} catch (_) {
  try { await setPersistence(auth, browserLocalPersistence); }
  catch { await setPersistence(auth, inMemoryPersistence); }
}

// Configure Google provider
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
auth.languageCode = 'pt_BR';

const listeners = new Set();
const emit = (user) => { listeners.forEach(fn => { try { fn(user); } catch {} }); };

onAuthStateChanged(auth, (user) => {
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
  try { await getRedirectResult(auth); } catch (_) {}
}
completeRedirectIfAny();

async function signInWithGoogle() {
  try {
    const useRedirect = isStandalone();
    try { if (useRedirect) sessionStorage.setItem('wasRedirectLogin', '1'); } catch(_){ }
    const u = auth.currentUser;
    if (u && u.isAnonymous) {
      // Link anonymous session to Google to preserve any local data
      if (useRedirect) return await linkWithRedirect(u, provider);
      return await linkWithPopup(u, provider);
    }
    if (useRedirect) return await signInWithRedirect(auth, provider);
    try {
      return await signInWithPopup(auth, provider);
    } catch (err) {
      // Fallback to redirect for environments blocking popups
      if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user' || err.code === 'auth/operation-not-supported-in-this-environment')) {
        return await signInWithRedirect(auth, provider);
      }
      throw err;
    }
  } catch (err) {
    console.error('Google sign‑in failed:', err);
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
  get currentUser() { return auth.currentUser; }
};

document.dispatchEvent(new CustomEvent('auth:init'));
