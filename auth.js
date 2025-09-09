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
  signInWithCredential,
  signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/10.3.1/firebase-auth.js";
import { firebaseConfig } from './firebase.prod.config.js';

function getOrInitApp() {
  try { return getApps().length ? getApp() : initializeApp(firebaseConfig); }
  catch (_) { return initializeApp(firebaseConfig); }
}

const app = getOrInitApp();
const auth = getAuth(app);
// Persistence: prefer IndexedDB (iOS PWA-friendly), fallback to Local, then Memory
try {
  await setPersistence(auth, indexedDBLocalPersistence);
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
  try {
    await getRedirectResult(auth);
  } catch (err) {
    // If linking failed because the Google credential is already linked
    // to another account, sign into that account instead of failing.
    if (err && err.code === 'auth/credential-already-in-use') {
      try {
        const cred = GoogleAuthProvider.credentialFromError(err);
        if (cred) {
          await signInWithCredential(auth, cred);
          return;
        }
      } catch (_) {}
    }
    // swallow other errors to avoid boot loops; surface via event
    try { document.dispatchEvent(new CustomEvent('auth:error', { detail: { code: err.code, message: err.message } })); } catch (_) {}
  }
}
completeRedirectIfAny();

async function signInWithGoogle() {
  try {
    const useRedirect = isStandalone();
    const u = auth.currentUser;
    if (u && u.isAnonymous) {
      // Link anonymous session to Google to preserve any local data.
      // If Google is already linked to an existing user, sign into that account.
      if (useRedirect) {
        try { return await linkWithRedirect(u, provider); }
        catch (err) {
          if (err && err.code === 'auth/credential-already-in-use') {
            const cred = GoogleAuthProvider.credentialFromError(err);
            if (cred) return await signInWithCredential(auth, cred);
          }
          throw err;
        }
      } else {
        try { return await linkWithPopup(u, provider); }
        catch (err) {
          if (err && err.code === 'auth/credential-already-in-use') {
            const cred = GoogleAuthProvider.credentialFromError(err);
            if (cred) return await signInWithCredential(auth, cred);
          }
          throw err;
        }
      }
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
