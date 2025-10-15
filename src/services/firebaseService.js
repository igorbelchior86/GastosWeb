/*
 * Firebase service wrapper
 *
 * Provides initialisation and helper functions for interacting with
 * Firebase Realtime Database. Also supports a mock mode backed by
 * localStorage for offline usage and testing. Consumers should call
 * `init(config)` before using other functions. The `config` argument
 * should be a Firebase app configuration object.
 */

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getDatabase, ref, set, get, onValue } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js';
import { scopedDbSegment } from '../utils/profile.js';

let firebaseApp = null;
let firebaseDb = null;
let PATH = null; // user workspace path
let useMock = false;

// Local storage helpers for mock mode. Each key is scoped by PATH to
// separate multiple user profiles. When PATH is null, keys are prefixed
// with 'mock' to avoid collisions.
async function mockLoad(key, defaultValue) {
  try {
    const storeKey = `${PATH || 'mock'}_${key}`;
    const raw = localStorage.getItem(storeKey);
    return raw != null ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function mockSave(key, value) {
  try {
    const storeKey = `${PATH || 'mock'}_${key}`;
    localStorage.setItem(storeKey, JSON.stringify(value));
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Initialise Firebase. Idempotent: calling with no arguments after
 * initialisation will return the existing instance. Passing a config
 * object will initialise a new app when none exists.
 *
 * @param {object} config Firebase configuration (optional)
 */
export async function init(config) {
  try {
    if (!config && getApps().length) {
      firebaseApp = getApp();
    } else if (config) {
      firebaseApp = getApps().length ? getApp() : initializeApp(config);
    }
    if (firebaseApp) {
      firebaseDb = getDatabase(firebaseApp);
    }
  } catch (err) {
    console.error('Firebase init failed', err);
    throw err;
  }
}

/**
 * Set the root path used to scope database reads and writes. Should be set
 * after the user signs in so that data is stored under their uid.
 *
 * @param {string} p path prefix
 */
export function setPath(p) {
  PATH = p;
}

/**
 * Enable or disable mock mode. When enabled, reads and writes go to
 * localStorage instead of Firebase. Use mock mode when offline or for
 * testing without network access. Passing a truthy value enables mock.
 *
 * @param {boolean} enabled whether to use mock
 */
export function setMockMode(enabled = true) {
  useMock = !!enabled;
}

/**
 * Load a value from Firebase or localStorage. Returns the default value
 * when the key is missing or when an error occurs.
 *
 * @param {string} key name of the data item
 * @param {*} defaultValue value to return when no data exists
 * @returns {Promise<any>}
 */
export async function load(key, defaultValue = null) {
  if (useMock || !firebaseDb || !PATH) return mockLoad(key, defaultValue);
  try {
    const remoteKey = scopedDbSegment(key);
    const snapshot = await get(ref(firebaseDb, `${PATH}/${remoteKey}`));
    return snapshot.exists() ? snapshot.val() : defaultValue;
  } catch (err) {
    console.warn('firebase.load failed, falling back to mock', err);
    return mockLoad(key, defaultValue);
  }
}

/**
 * Save a value to Firebase or localStorage. In mock mode, writes are
 * persisted to localStorage. When saving to Firebase fails, the value
 * will still be persisted locally and the error re‑thrown.
 *
 * @param {string} key key to write
 * @param {*} value data to persist
 * @returns {Promise<void>}
 */
export async function save(key, value) {
  if (useMock || !firebaseDb || !PATH) return mockSave(key, value);
  try {
    const remoteKey = scopedDbSegment(key);
    return set(ref(firebaseDb, `${PATH}/${remoteKey}`), value);
  } catch (err) {
    console.warn('firebase.save failed, persisting to mock', err);
    await mockSave(key, value);
    throw err;
  }
}

/**
 * Get a realtime database reference for a profile‑scoped key. Returns
 * null when the database is not available or PATH is unset.
 *
 * @param {string} key data key
 * @returns {import('https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js').DatabaseReference|null}
 */
export function profileRef(key) {
  if (!firebaseDb || !PATH) return null;
  const segment = scopedDbSegment(key);
  return ref(firebaseDb, `${PATH}/${segment}`);
}

/**
 * Attach realtime listeners to a set of keys. The provided handlers are
 * invoked with the Firebase DataSnapshot when changes occur. Returns
 * an unsubscribe function that removes all listeners when invoked.
 *
 * @param {object} handlers map of key to handler function
 * @returns {Promise<function>} unsubscribe function
 */
export async function startListeners(handlers = {}) {
  if (useMock || !firebaseDb) {
    // Nothing to do in mock mode; consumer should poll or load once
    return () => {};
  }
  const subs = [];
  try {
    const keys = ['tx','cards','startBal','startDate','startSet'];
    for (const k of keys) {
      const h = handlers[k];
      const r = profileRef(k);
      if (r && typeof h === 'function') {
        const unsub = onValue(r, (snap) => {
          try {
            h(snap);
          } catch (e) {
            console.error('handler error', e);
          }
        });
        if (typeof unsub === 'function') subs.push(unsub);
      }
    }
  } catch (err) {
    console.error('startListeners failed', err);
  }
  return () => {
    subs.forEach((u) => {
      try {
        u();
      } catch {
        /* ignore */
      }
    });
  };
}

// Offline queue management stored in localStorage
function readDirtyQueue() {
  try {
    return JSON.parse(localStorage.getItem('dirtyQueue') || '[]');
  } catch {
    return [];
  }
}

function writeDirtyQueue(arr) {
  try {
    localStorage.setItem('dirtyQueue', JSON.stringify(arr || []));
  } catch {
    /* ignore */
  }
}

/**
 * Mark a key as “dirty” indicating that changes need to be synced.
 * Only specific keys are allowed.
 *
 * @param {string} kind one of 'tx','cards','startBal','startSet'
 */
export function markDirty(kind) {
  const allowed = ['tx','cards','startBal','startSet'];
  if (!allowed.includes(kind)) return;
  const q = readDirtyQueue();
  if (!q.includes(kind)) q.push(kind);
  writeDirtyQueue(q);
}

/**
 * Retrieve the current offline dirty queue.
 *
 * @returns {string[]} list of dirty keys
 */
export function getDirtyQueue() {
  return readDirtyQueue();
}

/**
 * Flush the dirty queue by saving each collection to Firebase. If a save
 * fails, the remaining dirty keys are restored so that a subsequent
 * flush can retry. Throws when any save operation fails.
 */
export async function flushQueue() {
  const q = readDirtyQueue();
  if (!q.length) return;
  // Optimistically clear the queue
  writeDirtyQueue([]);
  try {
    for (const k of q) {
      const cached = await mockLoad(k, null);
      await save(k, cached);
    }
  } catch (err) {
    console.error('flushQueue failed', err);
    const cur = readDirtyQueue();
    writeDirtyQueue([...new Set([...(q || []), ...(cur || [])])]);
    throw err;
  }
}

/**
 * Schedule a background sync via the Service Worker, if supported by the
 * browser. This will cause the Service Worker to attempt to sync offline
 * changes when connectivity is restored. This call is safe to invoke
 * regardless of network status.
 */
export async function scheduleBgSync() {
  try {
    if (useMock) return;
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('sync-tx');
  } catch {
    /* ignore registration errors */
  }
}

// Expose for debugging when running in a browser
export const FirebaseService = {
  init,
  setPath,
  setMockMode,
  load,
  save,
  profileRef,
  startListeners,
  markDirty,
  getDirtyQueue,
  flushQueue,
  scheduleBgSync
};

if (typeof window !== 'undefined') {
  window.FirebaseService = FirebaseService;
}