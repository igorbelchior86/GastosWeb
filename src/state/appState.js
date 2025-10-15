import { normalizeStartBalance } from '../utils/startBalance.js';

/*
 * Application state management
 *
 * This module encapsulates the mutable state for the Gastos+ application.
 * It exposes a simple API for reading and updating portions of state as well
 * as subscribing to change notifications. The exported functions intentionally
 * avoid leaking the underlying state object directly to consumers.
 */

const DEFAULT_STATE = {
  /**
   * Starting balance entered by the user. Null when not yet set.
   * @type {number|null}
   */
  startBalance: null,
  /**
   * ISO formatted date representing the first day of the tracked period.
   * @type {string|null}
   */
  startDate: null,
  /**
   * Flag indicating the user has confirmed the start balance and date.
   * @type {boolean}
   */
  startSet: false,
  /**
   * Indicates whether persisted state has been loaded into memory.
   * @type {boolean}
   */
  bootHydrated: false,
  /**
   * Indicates whether user preferences have been loaded into memory.
   * @type {boolean}
   */
  preferencesHydrated: false,
  /**
   * List of transactions in memory. Each entry should conform to the
   * transaction model defined elsewhere in the application.
   * @type {Array<object>}
   */
  transactions: [],
  /**
   * List of payment cards configured by the user. Always includes a default
   * cash entry (`{ name: 'Dinheiro', close: 0, due: 0 }`).
   * @type {Array<object>}
   */
  cards: [],
  /**
   * User preferences object (theme, currencyProfile, etc.)
   * @type {Object}
   */
  preferences: {
    theme: 'system',           // 'light' | 'dark' | 'system'
    currencyProfile: 'BR',     // Profile ID (BR, PT, US, etc)
  }
};

// Internal state object. This should never be mutated directly outside of
// the functions exported from this module.
const state = { ...DEFAULT_STATE };

// Track subscribers. Each subscriber is a callback that will be invoked with
// an object describing which keys changed and the current state snapshot.
const subscribers = new Set();

/**
 * Notify all subscribers that specific keys have been updated.
 *
 * @param {string[]} keys List of keys that were modified
 */
function emit(keys) {
  if (!keys || !keys.length) return;
  subscribers.forEach((fn) => {
    try {
      fn({ changedKeys: keys, state });
    } catch (err) {
      // Do not let a bad subscriber prevent others from running
      console.error('State subscriber threw an error', err);
    }
  });
}

/**
 * Retrieve a shallow copy of the current state.
 *
 * Consumers should treat the returned object as read‑only. Do not mutate
 * properties on the returned object directly.
 *
 * @returns {object} copy of current state
 */
export function getState() {
  return { ...state };
}

/**
 * Merge the provided partial state into the existing state. Only keys that
 * already exist in the state will be updated. Optionally suppress change
 * notifications via the options parameter.
 *
 * @param {object} patch key/value pairs to merge into the state
 * @param {object} options options.emit: boolean controlling whether to emit events
 * @returns {object} the updated state
 */
export function setState(patch = {}, options = {}) {
  const changed = [];
  Object.keys(patch).forEach((key) => {
    if (!(key in state)) return;
    const current = state[key];
    const next = patch[key];
    if (current === next) return;
    state[key] = next;
    changed.push(key);
  });
  if (changed.length && options.emit !== false) {
    emit(changed);
  }
  return { ...state };
}

/**
 * Subscribe to state changes. The provided callback will be invoked whenever
 * any part of the state changes via setState() or one of the helper
 * functions. Returns an unsubscribe function to remove the listener.
 *
 * @param {function} fn callback invoked with an object containing changedKeys and state
 * @returns {function} unsubscribe function
 */
export function subscribeState(fn) {
  if (typeof fn !== 'function') return () => {};
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

// Helper getters and setters for individual pieces of state

export function getStartBalance() {
  return state.startBalance;
}

export function setStartBalance(value, options = {}) {
  const normalized = normalizeStartBalance(value);
  if (state.startBalance === normalized) return state.startBalance;
  state.startBalance = normalized;
  if (options.emit !== false) emit(['startBalance']);
  return state.startBalance;
}

export function getStartDate() {
  return state.startDate;
}

export function setStartDate(value, options = {}) {
  if (state.startDate === value) return state.startDate;
  state.startDate = value;
  if (options.emit !== false) emit(['startDate']);
  return state.startDate;
}

export function getStartSet() {
  return state.startSet;
}

export function setStartSet(value, options = {}) {
  if (state.startSet === value) return state.startSet;
  state.startSet = value;
  if (options.emit !== false) emit(['startSet']);
  return state.startSet;
}

export function isBootHydrated() {
  return state.bootHydrated;
}

export function setBootHydrated(value, options = {}) {
  if (state.bootHydrated === value) return state.bootHydrated;
  state.bootHydrated = value;
  if (options.emit !== false) emit(['bootHydrated']);
  return state.bootHydrated;
}

// Transaction helpers

export function getTransactions() {
  return state.transactions.slice();
}

export function setTransactions(list = [], options = {}) {
  const normalized = Array.isArray(list) ? list.slice() : [];
  if (JSON.stringify(state.transactions) === JSON.stringify(normalized)) return state.transactions;
  state.transactions = normalized;
  if (options.emit !== false) emit(['transactions']);
  return state.transactions;
}

export function addTransaction(tx, options = {}) {
  if (!tx) return null;
  const arr = Array.isArray(state.transactions) ? state.transactions.slice() : [];
  arr.push(tx);
  state.transactions = arr;
  if (options.emit !== false) emit(['transactions']);
  return tx;
}

export function updateTransaction(id, patch = {}, options = {}) {
  if (!id) return null;
  const arr = Array.isArray(state.transactions) ? state.transactions.slice() : [];
  let found = null;
  for (let i = 0; i < arr.length; i++) {
    const t = arr[i];
    if (t && String(t.id) === String(id)) {
      const updated = { ...t, ...patch };
      arr[i] = updated;
      found = updated;
      break;
    }
  }
  if (found) {
    state.transactions = arr;
    if (options.emit !== false) emit(['transactions']);
  }
  return found;
}

export function removeTransaction(id, options = {}) {
  if (!id) return false;
  const arr = Array.isArray(state.transactions) ? state.transactions.slice() : [];
  const next = arr.filter((t) => !(t && String(t.id) === String(id)));
  const changed = next.length !== arr.length;
  if (changed) {
    state.transactions = next;
    if (options.emit !== false) emit(['transactions']);
  }
  return changed;
}

// Card helpers

export function getCards() {
  return state.cards.slice();
}

export function setCards(list = [], options = {}) {
  const normalized = Array.isArray(list) ? list.slice() : [];
  if (JSON.stringify(state.cards) === JSON.stringify(normalized)) return state.cards;
  state.cards = normalized;
  if (options.emit !== false) emit(['cards']);
  return state.cards;
}

export function addCard(card, options = {}) {
  if (!card) return null;
  const arr = Array.isArray(state.cards) ? state.cards.slice() : [];
  arr.push(card);
  state.cards = arr;
  if (options.emit !== false) emit(['cards']);
  return card;
}

export function updateCard(nameOrIndex, patch = {}, options = {}) {
  if (nameOrIndex === undefined || nameOrIndex === null) return null;
  const arr = Array.isArray(state.cards) ? state.cards.slice() : [];
  let found = null;
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (!c) continue;
    if ((typeof nameOrIndex === 'number' && i === nameOrIndex) || (typeof nameOrIndex !== 'number' && String(c.name) === String(nameOrIndex))) {
      const updated = { ...c, ...patch };
      arr[i] = updated;
      found = updated;
      break;
    }
  }
  if (found) {
    state.cards = arr;
    if (options.emit !== false) emit(['cards']);
  }
  return found;
}

export function removeCard(nameOrIndex, options = {}) {
  const arr = Array.isArray(state.cards) ? state.cards.slice() : [];
  let next;
  if (typeof nameOrIndex === 'number') {
    next = arr.slice();
    next.splice(nameOrIndex, 1);
  } else {
    next = arr.filter((c) => !(c && String(c.name) === String(nameOrIndex)));
  }
  const changed = JSON.stringify(next) !== JSON.stringify(arr);
  if (changed) {
    state.cards = next;
    if (options.emit !== false) emit(['cards']);
  }
  return changed;
}

// Preference helpers

export function isPreferencesHydrated() {
  return state.preferencesHydrated;
}

export function setPreferencesHydrated(value, options = {}) {
  if (state.preferencesHydrated === value) return state.preferencesHydrated;
  state.preferencesHydrated = value;
  if (options.emit !== false) emit(['preferencesHydrated']);
  return state.preferencesHydrated;
}

export function getPreferences() {
  return { ...state.preferences };
}

export function setPreferences(prefs = {}, options = {}) {
  const normalized = typeof prefs === 'object' ? { ...DEFAULT_STATE.preferences, ...prefs } : { ...DEFAULT_STATE.preferences };
  if (JSON.stringify(state.preferences) === JSON.stringify(normalized)) return state.preferences;
  state.preferences = normalized;
  if (options.emit !== false) emit(['preferences']);
  return state.preferences;
}

export function getPreference(key, defaultValue = undefined) {
  return state.preferences.hasOwnProperty(key) ? state.preferences[key] : defaultValue;
}

export function setPreference(key, value, options = {}) {
  if (!(key in state.preferences)) return null;
  const current = state.preferences[key];
  if (current === value) return current;
  state.preferences = { ...state.preferences, [key]: value };
  if (options.emit !== false) emit(['preferences']);
  return value;
}

/**
 * Reset the application state back to default values. Optionally suppress
 * emitting change notifications. Useful when logging out or switching
 * profiles.
 *
 * @param {object} options options.emit: boolean controlling event emission
 * @returns {object} the reset state
 */
export function resetState(options = {}) {
  const changed = [];
  Object.keys(state).forEach((key) => {
    if (key === 'preferences') {
      // For preferences object, compare deep equality
      if (JSON.stringify(state[key]) === JSON.stringify(DEFAULT_STATE[key])) return;
    } else if (state[key] === DEFAULT_STATE[key]) {
      return;
    }
    
    if (key === 'preferences') {
      state[key] = { ...DEFAULT_STATE[key] };
    } else {
      state[key] = Array.isArray(DEFAULT_STATE[key]) ? [] : DEFAULT_STATE[key];
    }
    changed.push(key);
  });
  if (changed.length && options.emit !== false) {
    emit(changed);
  }
  return { ...state };
}

// For convenience, also expose a Proxy similar to the legacy API. Consumers
// may read properties directly (e.g. appState.startBalance) but should not
// assign to them. The setter triggers change events when a known key is set.
export const appState = new Proxy({}, {
  get(_, prop) {
    return state[prop];
  },
  set(_, prop, value) {
    if (!(prop in state)) return false;
    const current = state[prop];
    if (current === value) return true;
    state[prop] = value;
    emit([prop]);
    return true;
  }
});
