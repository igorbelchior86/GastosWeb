/**
 * Central application state helpers.
 * Inicialmente cobre os campos do fluxo de "Saldo inicial" e boot.
 * A estrutura permite evoluções futuras (transactions, cards, etc.).
 */

const defaultState = {
  startBalance: null,
  startDate: null,
  startSet: false,
  bootHydrated: false
};

const state = { ...defaultState };
const subscribers = new Set();

function emit(changedKeys) {
  if (!changedKeys || !changedKeys.length) return;
  subscribers.forEach(fn => {
    try { fn({ changedKeys, state }); }
    catch (err) { console.error('State subscriber failed', err); }
  });
}

export function getState() {
  return state;
}

export function setState(patch = {}, options = {}) {
  const changed = [];
  Object.keys(patch).forEach(key => {
    if (!(key in state)) return;
    if (state[key] === patch[key]) return;
    state[key] = patch[key];
    changed.push(key);
  });
  if (changed.length && options.emit !== false) emit(changed);
  return state;
}

export function subscribeState(fn) {
  if (typeof fn !== 'function') return () => {};
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getStartBalance() {
  return state.startBalance;
}

export function setStartBalance(value, options = {}) {
  if (state.startBalance === value) return state.startBalance;
  state.startBalance = value;
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

export function resetState(options = {}) {
  const changed = [];
  Object.keys(state).forEach(key => {
    if (state[key] === defaultState[key]) return;
    state[key] = defaultState[key];
    changed.push(key);
  });
  if (changed.length && options.emit !== false) emit(changed);
  return state;
}

export const appState = new Proxy(state, {
  get(target, prop) {
    if (prop === 'bootHydrated') return target.bootHydrated;
    if (prop in target) return target[prop];
    return undefined;
  },
  set(target, prop, value) {
    if (!(prop in target)) return false;
    const current = target[prop];
    if (current === value) return true;
    target[prop] = value;
    emit([prop]);
    return true;
  }
});

if (typeof window !== 'undefined') {
  window.APP_STATE = appState;
}
