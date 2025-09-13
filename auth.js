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
import { firebaseConfig } from './firebase.test.config.js';

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

// Guard: if iOS PWA auth regresses immediately after a successful login,
// clear SW caches/registrations to break stale bundles, then reload once.
let _hadUserOnce = false;
const _bootGuardUntil = Date.now() + 8000; // only during initial boot window
async function nukeSWAndReloadOnce() {
  try {
    if (sessionStorage.getItem('nukedSwOnce')) return;
    sessionStorage.setItem('nukedSwOnce', '1');
  } catch (_) {}
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(()=>{})));
    }
  } catch (_) {}
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k).catch(()=>{})));
  } catch (_) {}
  try { location.reload(); } catch (_) { /* noop */ }
}

onAuthStateChanged(auth, (user) => {
  // Detect regression to null right after having a user in standalone (iOS PWA)
  const now = Date.now();
  if (user) {
    _hadUserOnce = true;
  } else if (_hadUserOnce && isStandalone() && now < _bootGuardUntil) {
    // Likely stale SW/assets in PWA context causing auth loss → hard refresh path
    // Log for remote debugging and attempt a one-time SW/caches cleanup
    try { console.warn('[Auth] User regressed to null during boot in standalone; forcing SW reset'); } catch (_) {}
    nukeSWAndReloadOnce();
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
  try { await getRedirectResult(auth); } catch (_) {}
}
completeRedirectIfAny();

async function signInWithGoogle() {
  try {
    const useRedirect = isStandalone();
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
