// Recorrência: Exclusão e Edição de recorrência
let pendingDeleteTxId = null;
let pendingDeleteTxIso = null;
let pendingEditTxId = null;
let pendingEditTxIso = null;
let pendingEditMode = null;
// Modal Excluir Recorrência - refs
const deleteRecurrenceModal = document.getElementById('deleteRecurrenceModal');
const closeDeleteRecurrenceModal = document.getElementById('closeDeleteRecurrenceModal');
const deleteSingleBtn = document.getElementById('deleteSingleBtn');
const deleteFutureBtn = document.getElementById('deleteFutureBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const cancelDeleteRecurrence = document.getElementById('cancelDeleteRecurrence');
// Modal Editar Recorrência - refs
const editRecurrenceModal = document.getElementById('editRecurrenceModal');
const closeEditRecurrenceModal = document.getElementById('closeEditRecurrenceModal');
const editSingleBtn = document.getElementById('editSingleBtn');
const editFutureBtn = document.getElementById('editFutureBtn');
const editAllBtn = document.getElementById('editAllBtn');
const cancelEditRecurrence = document.getElementById('cancelEditRecurrence');
// Modal Confirmar mover para hoje - refs
const confirmMoveModal = document.getElementById('confirmMoveModal');
const confirmMoveYes   = document.getElementById('confirmMoveYes');
const confirmMoveNo    = document.getElementById('confirmMoveNo');
const closeConfirmMove = document.getElementById('closeConfirmMove');
const confirmMoveText  = document.getElementById('confirmMoveText');

// Pay-invoice mode state
let isPayInvoiceMode = false;
let pendingInvoiceCtx = null; // { card, dueISO, remaining }

function askMoveToToday() {
  // Fallback para confirm nativo se modal não existir
  if (!confirmMoveModal || !confirmMoveYes || !confirmMoveNo) {
    return Promise.resolve(window.confirm('Operação concluída. Gostaria de mover para hoje?'));
  }
  return new Promise(resolve => {
    const cleanup = () => {
      confirmMoveModal.classList.add('hidden');
      // Remove temporary listeners
      confirmMoveYes.onclick = null;
      confirmMoveNo.onclick = null;
      if (closeConfirmMove) closeConfirmMove.onclick = null;
      confirmMoveModal.onclick = null;
    };
    confirmMoveYes.onclick = () => { cleanup(); resolve(true); };
    confirmMoveNo.onclick  = () => { cleanup(); resolve(false); };
    if (closeConfirmMove) closeConfirmMove.onclick = () => { cleanup(); resolve(false); };
    confirmMoveModal.onclick = (e) => { if (e.target === confirmMoveModal) { cleanup(); resolve(false); } };
    confirmMoveModal.classList.remove('hidden');
  });
}
// Elements for Planejados modal
const openPlannedBtn = document.getElementById('openPlannedBtn');
const plannedModal   = document.getElementById('plannedModal');
const closePlannedModal = document.getElementById('closePlannedModal');
const plannedList    = document.getElementById('plannedList');

// Header segmented control → delega para os botões originais
const headerSeg = document.querySelector('.header-seg');
if (headerSeg) {
  headerSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-option');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'planned' && openPlannedBtn) {
      headerSeg.dataset.selected = 'planned';
      openPlannedBtn.click();
    } else if (action === 'cards') {
      const openCardBtn = document.getElementById('openCardModal');
      if (openCardBtn) {
        headerSeg.dataset.selected = 'cards';
        openCardBtn.click();
      }
    }
  });
}

// --- Ensure Planned modal values are anchored to the right, regardless of DOM structure
function normalizeLabelWidths(liElements) {
  // Calculates the maximum width of all label-wrapper elements and returns it
  let maxWidth = 0;
  liElements.forEach(li => {
    const label = li.querySelector('.label-wrapper');
    if (label) {
      label.style.width = ''; // reset before measuring
      const w = label.offsetWidth;
      if (w > maxWidth) maxWidth = w;
    }
  });
  return maxWidth;
}

function adjustValueSpacing(liElements) {
  // Adjusts the padding-right of .value-wrapper based on value content
  liElements.forEach(li => {
    const valueWrap = li.querySelector('.value-wrapper');
    const value = li.querySelector('.value');
    if (valueWrap && value) {
      // Example: set padding-right based on value width plus a margin
      valueWrap.style.paddingRight = (value.offsetWidth + 24) + 'px';
    }
  });
}

function applyUniformLabelWidth(maxWidth, liElements) {
  // Applies the same width to all label-wrapper elements
  liElements.forEach(li => {
    const label = li.querySelector('.label-wrapper');
    if (label) {
      label.style.width = maxWidth + 'px';
    }
  });
}

function fixPlannedAlignment() {
  if (!plannedList) return;
  // Only act if the Planned modal is visible
  if (plannedModal && plannedModal.classList.contains('hidden')) return;

  const liElements = plannedList.querySelectorAll('li');
  // 1. Normalize label widths
  const maxWidth = normalizeLabelWidths(liElements);
  // 2. Adjust value spacing
  adjustValueSpacing(liElements);
  // 3. Apply uniform label width
  applyUniformLabelWidth(maxWidth, liElements);
}

// --- Expand weekday labels to long form inside Planned modal ---
const WDAY_LONG = {
  'dom.': 'Domingo',
  'seg.': 'Segunda-feira',
  'ter.': 'Terça-feira',
  'qua.': 'Quarta-feira',
  'qui.': 'Quinta-feira',
  'sex.': 'Sexta-feira',
  'sáb.': 'Sábado',
  'sab.': 'Sábado'
};

function expandPlannedDayLabels() {
  if (!plannedModal) return;
  // Look for common containers used as day headers inside the Planned modal
  const nodes = plannedModal.querySelectorAll('.modal-content .subheader, .modal-content .planned-date, .modal-content h3, .modal-content div');
  nodes.forEach(el => {
    const raw = (el.textContent || '').trim();
    // Match patterns like "Qua., 16/07" or "qui., 24/07"
    const m = raw.match(/^([A-Za-zÀ-ÿ]{3,4}\.)\s*,?\s*(.*)$/);
    if (!m) return;
    const abbr = m[1].toLowerCase();
    const rest = m[2] || '';
    const full = WDAY_LONG[abbr];
    if (full) {
      el.textContent = rest ? `${full}, ${rest}` : full;
    }
  });
}

// Hooks: on open button click, after modal transition, and whenever list mutates
if (openPlannedBtn) {
  openPlannedBtn.addEventListener('click', () => setTimeout(() => {
    renderPlannedModal();
    fixPlannedAlignment();
    expandPlannedDayLabels();
  }, 0));
}

const plannedBox = plannedModal ? plannedModal.querySelector('.bottom-modal-box') : null;
if (plannedBox) {
  plannedBox.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'transform') {
      fixPlannedAlignment();
      expandPlannedDayLabels();
    }
  });
}

if (plannedList) {
  const mo = new MutationObserver(() => { fixPlannedAlignment(); expandPlannedDayLabels(); });
  mo.observe(plannedList, { childList: true, subtree: true });
}

import { openDB } from 'https://unpkg.com/idb?module';
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-app.js";

import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-database.js";

// Configuração do Firebase de PRODUÇÃO (arquivo separado)
import { firebaseConfig } from './firebase.prod.config.js';

// (Web Push removido)

// ---- IndexedDB (idb) key/value cache ----
const cacheDB = await openDB('gastos-cache', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
  }
});
async function idbGet(k) { try { return await cacheDB.get('kv', k); } catch { return undefined; } }
async function idbSet(k, v) { try { await cacheDB.put('kv', v, k); } catch {} }

/**
 * Initialize swipe-to-reveal actions on elements.
 * @param {ParentNode} root       Root element to listen on (e.g., document or specific container).
 * @param {string} wrapperSel     Selector for swipe wrapper (e.g., '.swipe-wrapper').
 * @param {string} actionsSel     Selector for swipe actions (e.g., '.swipe-actions').
 * @param {string} lineSel        Selector for the line to translate (e.g., '.op-line' or '.card-line').
 * @param {boolean} onceFlag      Name of global flag to prevent multiple inits.
 */
function initSwipe(root, wrapperSel, actionsSel, lineSel, onceFlag) {
  if (window[onceFlag]) return;
  let startX = 0;
  const DRAG_ACTIVATE_PX = 6; // threshold to consider a swipe gesture
  root.addEventListener('touchstart', e => {
    const wrap = e.target.closest(wrapperSel);
    if (!wrap) return;
    // Limit swipe start to interactions on the line element only
    const lineHit = e.target.closest(lineSel);
    if (!lineHit) return;
    startX = e.touches[0].clientX;
    wrap.dataset.startX = startX;
    wrap.dataset.swiping = '0';
    const line = wrap.querySelector(lineSel);
    const m = new WebKitCSSMatrix(getComputedStyle(line).transform);
    wrap.dataset.offset = m.m41 || 0;
  }, { passive: true });
  root.addEventListener('touchmove', e => {
    const wrap = e.target.closest(wrapperSel);
    if (!wrap) return;
    if (!e.target.closest(lineSel)) return;
    const start = parseFloat(wrap.dataset.startX || 0);
    const offset = parseFloat(wrap.dataset.offset || 0);
    const diff   = start - e.touches[0].clientX;
    const line   = wrap.querySelector(lineSel);
    // Prefer external, targeted actions (e.g., invoice header pay button), then fallback to local
    let actions = document.querySelector(`${actionsSel}[data-for="${wrap.dataset.swipeId}"]`) || wrap.querySelector(actionsSel);
    const actW   = actions.offsetWidth || 96; // fallback width
    line.style.transition = 'none';
    let newTx = offset - diff;
    newTx = Math.max(Math.min(newTx, 0), -actW);
    line.style.transform = `translateX(${newTx}px)`;
    const op = Math.abs(newTx) / actW;
    actions.style.opacity = op;
    actions.style.pointerEvents = op > 0.05 ? 'auto' : 'none';
    // Mark as swiping to avoid toggling <details>
    if (Math.abs(diff) >= DRAG_ACTIVATE_PX) wrap.dataset.swiping = '1';
  }, { passive: true });
  root.addEventListener('touchend', e => {
    const wrap = e.target.closest(wrapperSel);
    if (!wrap) return;
    if (!e.target.closest(lineSel)) return;
    const start  = parseFloat(wrap.dataset.startX || 0);
    const offset = parseFloat(wrap.dataset.offset || 0);
    const diff   = start - e.changedTouches[0].clientX;
    const line   = wrap.querySelector(lineSel);
    // Prefer external, targeted actions (e.g., invoice header pay button), then fallback to local
    let actions = document.querySelector(`${actionsSel}[data-for="${wrap.dataset.swipeId}"]`) || wrap.querySelector(actionsSel);
    const actW   = actions.offsetWidth || 96;
    let finalTx  = offset - diff;
    const shouldOpen = Math.abs(finalTx) > actW / 2;
    finalTx = shouldOpen ? -actW : 0;
    line.style.transition = '';
    line.style.transform  = `translateX(${finalTx}px)`;
    actions.style.opacity = shouldOpen ? 1 : 0;
    actions.style.pointerEvents = shouldOpen ? 'auto' : 'none';
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(30);
    }
    // collapse others
    document.querySelectorAll(lineSel).forEach(l=>{
      if(l!==line){l.style.transform='translateX(0)';}
    });
    document.querySelectorAll(actionsSel).forEach(a=>{
      if(a!==actions){a.style.opacity=0; a.style.pointerEvents='none';}
    });
    // Allow clicks again shortly after swipe ends
    setTimeout(()=>{ if (wrap) wrap.dataset.swiping = '0'; }, 80);
  }, { passive: true });
  window[onceFlag] = true;
}

// Prevent toggling <details> when the user swipes the invoice header line
document.addEventListener('click', (e) => {
  const sum = e.target.closest('.invoice-header-line');
  if (!sum) return;
  const det = sum.closest('details.invoice');
  if (det && det.dataset.swiping === '1') {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

let PATH;
// Casa compartilhada (PROD atual) e e‑mails que devem enxergar esta Casa
const WID_CASA = 'orcamento365_9b8e04c5';
const CASA_EMAILS = ['icmbelchior@gmail.com','sarargjesus@gmail.com'];
function resolvePathForUser(user){
  if (!user) return null;
  const email = (user.email || '').toLowerCase();
  if (CASA_EMAILS.includes(email)) return WID_CASA;
  return `users/${user.uid}`;
}

// Flag for mocking data while working on UI.  
// Switch to `false` to reconnect to production Firebase.
const USE_MOCK = false;              // conectar ao Firebase PROD
const APP_VERSION = '1.4.8(a26)';
// Hard-update quando a versão do app muda
try {
  const prev = localStorage.getItem('app_version');
  if (prev !== APP_VERSION) {
    localStorage.setItem('app_version', APP_VERSION);
    if ('caches' in window) { caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))).catch(()=>{})); }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        try { reg && reg.update(); } catch(_){}
        try { reg && reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch(_){}
      });
    }
  }
} catch(_){}
const METRICS_ENABLED = true;
const _bootT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
function logMetric(name, payload) {
  try {
    // Only log when DB ready and a workspace PATH is known (after auth)
    if (!METRICS_ENABLED || USE_MOCK || !firebaseDb || !PATH) return;
    if (window.Auth && !window.Auth.currentUser) return;
    const key = `${PATH}/metrics/${name}/${Date.now()}_${Math.random().toString(36).slice(2)}`;
    set(ref(firebaseDb, key), {
      ...payload,
      appVersion: APP_VERSION,
      ua: navigator.userAgent,
      ts: new Date().toISOString()
    });
  } catch (_) {}
}
// Log boot timing once the page fully loads
window.addEventListener('load', () => {
  const now = (performance && performance.now) ? performance.now() : Date.now();
  logMetric('boot', { firstPaint_ms: Math.round(now - _bootT0) });
});
let save, load;
let firebaseDb;

if (!USE_MOCK) {
  // Seleciona config conforme ambiente
  const cfg = firebaseConfig;
  const app  = (getApps().length ? getApp() : initializeApp(cfg));
  const db   = getDatabase(app);
  firebaseDb = db;

  // PATH será definido após o login (Casa para e‑mails definidos; pessoal para demais)

  // Auth is required; handled by auth.js (Google). No anonymous sign-in.

  // Wrapper: save marks as dirty and updates cache if offline
  save = async (k, v) => {
    if (!navigator.onLine) {
      // mark as dirty for later flush and cache locally for instant UI
      markDirty(k);
      if (k === 'tx') cacheSet('tx', v);
      if (k === 'cards') cacheSet('cards', v);
      if (k === 'startBal') cacheSet('startBal', v);
      return; // no remote write while offline
    }
    return set(ref(db, `${PATH}/${k}`), v);
  };
  load = async (k, d) => {
    const s = await get(ref(db, `${PATH}/${k}`));
    return s.exists() ? s.val() : d;
  };
} else {
  // Modo MOCK (LocalStorage)
  PATH = 'mock_365';
  save = (k, v) => localStorage.setItem(`${PATH}_${k}`, JSON.stringify(v));
  load = async (k, d) =>
    JSON.parse(localStorage.getItem(`${PATH}_${k}`)) ?? d;
}


// Cache local (LocalStorage+IDB) p/ boot instantâneo, com fallback/hydrate
const cacheGet  = (k, d) => {
  try {
    const ls = localStorage.getItem(`cache_${k}`);
    if (ls != null) return JSON.parse(ls);
  } catch {}
  // Fallback: fetch from IDB asynchronously and warm localStorage
  (async () => {
    const v = await idbGet(`cache_${k}`);
    if (v !== undefined) localStorage.setItem(`cache_${k}`, JSON.stringify(v));
  })();
  return d;
};
const cacheSet  = (k, v) => {
  localStorage.setItem(`cache_${k}`, JSON.stringify(v));
  idbSet(`cache_${k}`, v);
};

// ---------------- Offline queue helpers (generalized) ----------------
// We track which collections are "dirty" while offline: 'tx', 'cards', 'startBal'.
function updatePendingBadge() {
  const syncBtn = document.getElementById('syncNowBtn');
  if (!syncBtn) return;
  const q = cacheGet('dirtyQueue', []);
  syncBtn.textContent = q.length ? `⟳ (${q.length})` : '⟳';
}

// Marks a collection as dirty so we know to flush it later.
function markDirty(kind) {
  const allowed = ['tx','cards','startBal'];
  if (!allowed.includes(kind)) return;
  const q = cacheGet('dirtyQueue', []);
  if (!q.includes(kind)) q.push(kind);
  cacheSet('dirtyQueue', q);
  updatePendingBadge();
  scheduleBgSync();
}

// ---- Background Sync registration (Android/Chrome) + retry loop (iOS/Safari) ----
async function scheduleBgSync() {
  try {
    if (USE_MOCK) return;
    if (!('serviceWorker' in navigator)) return;
    if (!('SyncManager' in window)) return; // iOS/Safari will skip
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('sync-tx');
  } catch (_) {
    // ignore; fallbacks below handle retries
  }
}

let _retryTimer = null;
let _retryDelay = 5000; // start 5s, cap 60s
async function tryFlushWithBackoff() {
  if (!navigator.onLine) return;
  await flushQueue();
  const stillDirty = (cacheGet('dirtyQueue', []) || []).length > 0;
  if (stillDirty) {
    clearTimeout(_retryTimer);
    _retryTimer = setTimeout(tryFlushWithBackoff, Math.min(_retryDelay *= 2, 60000));
  } else {
    _retryDelay = 5000;
  }
}

// iOS-friendly triggers: when app regains focus/visibility or BFCache restores the page
window.addEventListener('focus', () => { if (navigator.onLine) tryFlushWithBackoff(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine) tryFlushWithBackoff(); });
window.addEventListener('pageshow', (e) => { if (navigator.onLine && (!e.persisted || true)) tryFlushWithBackoff(); });
// Also when coming online, schedule bg sync (Android) and kick retries
window.addEventListener('online', () => { scheduleBgSync(); tryFlushWithBackoff(); });

// Backwards-compatible: queueTx() now just marks 'tx' as dirty.
async function queueTx(/* tx object ignored */) {
  markDirty('tx');
}

// Flushes all dirty collections to Firebase and clears the dirty flags.
async function flushQueue() {
  const q = cacheGet('dirtyQueue', []);
  if (!q.length) return;

  // optimistic clear; restore on failure
  cacheSet('dirtyQueue', []);

  try {
    if (q.includes('tx'))       await save('tx', transactions);
    if (q.includes('cards'))    await save('cards', cards);
    if (q.includes('startBal')) await save('startBal', startBalance);
  } catch (err) {
    console.error('flushQueue failed:', err);
    // Put back flags so we retry later (union of previous + current)
    const cur = cacheGet('dirtyQueue', []);
    cacheSet('dirtyQueue', [...new Set([...q, ...cur])]);
    return;
  }
  updatePendingBadge();
  renderTable();
}

// Auto-flush when back online and toggle offline indicator
// --- Offline/Online Toast notifications (register once on app load) ---
(function () {
  let _offlineOnlineListenersRegistered = false;
  function registerOfflineOnlineToasts() {
    if (_offlineOnlineListenersRegistered) return;
    window.addEventListener('offline', () => {
      showToast("Você está offline", 'error', 5000);
    });
    window.addEventListener('online', () => {
      showToast("Conexão restabelecida", 'success', 5000);
    });
    _offlineOnlineListenersRegistered = true;
  }
  // Register at startup
  registerOfflineOnlineToasts();
})();


// Load transactions/cards/balance: now with realtime listeners if not USE_MOCK
let transactions = [];
let cards = [{ name:'Dinheiro', close:0, due:0 }];
let startBalance;
const $=id=>document.getElementById(id);
const tbody=document.querySelector('#dailyTable tbody');
const wrapperEl = document.querySelector('.wrapper');
const txModalTitle = document.querySelector('#txModal h2');

// Compute a consistent bottom reserve so the last day stops above the pseudo‑footer
// computeEndPad removido – espaço final constante pelo CSS

// Helper: sort transactions by opDate (YYYY-MM-DD) then by timestamp (ts) so UI is always chronological
function sortTransactions() {
  transactions.sort((a, b) => {
    const d = a.opDate.localeCompare(b.opDate);
    if (d !== 0) return d;
    // Fallback: compare timestamps when same date
    return (a.ts || '').localeCompare(b.ts || '');
  });
}

// Sanitize legacy transactions: ensure postDate/opDate/planned exist
function sanitizeTransactions(list) {
  let changed = false;
  const out = (list || []).map((t) => {
    if (!t) return t;
    const nt = { ...t };
    // Ensure opDate exists; fallback to date from ts
    if (!nt.opDate) {
      if (nt.ts) {
        try { nt.opDate = new Date(nt.ts).toISOString().slice(0, 10); } catch { nt.opDate = todayISO(); }
      } else {
        nt.opDate = todayISO();
      }
      changed = true;
    }
    // Ensure postDate exists; compute with card rule
    if (!nt.postDate) {
      const method = nt.method || 'Dinheiro';
      try { nt.postDate = post(nt.opDate, method); } catch { nt.postDate = nt.opDate; }
      changed = true;
    }
    // Ensure planned flag exists
    if (typeof nt.planned === 'undefined' && nt.opDate) {
      nt.planned = nt.opDate > todayISO();
      changed = true;
    }
    return nt;
  });
  return { list: out, changed };
}

// --- Toast helper ---
const showToast = (msg, type = 'error', duration = 3000) => {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.setProperty('--icon', type === 'error' ? '"✕"' : '"✓"');
  t.classList.remove('success', 'error');
  t.classList.add(type === 'success' ? 'success' : 'error');
  // restart animation
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); }, duration);
};
function buildSaveToast(tx) {
  try {
    const valueNum = typeof tx.val === 'number' ? tx.val : Number((tx.val || '0').toString().replace(/[^0-9.-]/g, ''));
    const formattedVal = valueNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const isCard = tx.method && tx.method !== 'Dinheiro';
    const hasOpDate = !!tx.opDate;
    const renderIso = tx.postDate || (hasOpDate && tx.method ? post(tx.opDate, tx.method) : null);

    if (isCard && renderIso && !tx.planned && (!hasOpDate || renderIso !== tx.opDate)) {
      const [, mm, dd] = renderIso.split('-');
      return `${formattedVal} salva na fatura de ${dd}/${mm}`;
    }
    if (!tx.recurrence) {
      const iso = hasOpDate ? tx.opDate : todayISO();
      return `${formattedVal} salvo em ${iso.slice(8,10)}/${iso.slice(5,7)}`;
    }
    const recSel = document.getElementById('recurrence');
    const recText = recSel ? (recSel.options[recSel.selectedIndex].text || '').toLowerCase() : 'recorrente';
    return `${formattedVal} salvo (${recText})`;
  } catch {
    return 'Transação salva';
  }
}
// ---- Migration: normalize legacy transactions ----
// (moved inside block below)

// ---------------------------------------------------------------------------
// Load transactions/cards/balances with realtime listeners or fallback to mock
// ---------------------------------------------------------------------------

if (!USE_MOCK) {
  // Start realtime listeners only after user is authenticated
  const startRealtime = () => {
    // Live listeners (Realtime DB)
    const txRef    = ref(firebaseDb, `${PATH}/tx`);
    const cardsRef = ref(firebaseDb, `${PATH}/cards`);
    const balRef   = ref(firebaseDb, `${PATH}/startBal`);

  // initialize from cache first for instant UI
  transactions = cacheGet('tx', []);
  transactions = (transactions || [])
    .filter(t => t) // ignora null/undefined
    .map(t => ({
      ...t,
      method: (t.method && t.method.toLowerCase() === 'dinheiro') ? 'Dinheiro' : t.method,
      recurrence: t.recurrence ?? '',
      installments: t.installments ?? 1,
      parentId: t.parentId ?? null
    }));
  sortTransactions();
  cards = cacheGet('cards', [{name:'Dinheiro',close:0,due:0}]);
  startBalance = cacheGet('startBal', null);

  // Listen for tx changes (LWW merge per item)
  onValue(txRef, (snap) => {
    const raw  = snap.val() ?? [];
    const incoming = Array.isArray(raw) ? raw : Object.values(raw);

    // normalize helper
    const norm = (t) => ({
      ...t,
      method: (t.method && t.method.toLowerCase() === 'dinheiro') ? 'Dinheiro' : t.method,
      recurrence: t.recurrence ?? '',
      installments: t.installments ?? 1,
      parentId: t.parentId ?? null
    });

    const remote = (incoming || [])
      .filter(t => t)
      .map(norm);

    // If we're online and have no local pending changes for 'tx',
    // trust the server (support hard deletions). Otherwise, do LWW merge.
    const dirty = cacheGet('dirtyQueue', []);
    const hasPendingTx = Array.isArray(dirty) && dirty.includes('tx');

    if (navigator.onLine && !hasPendingTx) {
      // Source-of-truth: server. This allows deletions/resets from other clients to propagate.
      transactions = remote;
    } else {
      // Merge: keep local edits that haven't been flushed yet; remote wins on conflicts by timestamp
      const local = (transactions || []).map(norm);
      const byId = new Map(local.map(t => [t.id, t]));
      for (const r of remote) {
        const l = byId.get(r.id);
        if (!l) { byId.set(r.id, r); continue; }
        const lt = Date.parse(l.modifiedAt || l.ts || 0);
        const rt = Date.parse(r.modifiedAt || r.ts || 0);
        if (rt >= lt) byId.set(r.id, r);
      }
      transactions = Array.from(byId.values());
    }

    // Sanitize legacy/malformed items
    const s = sanitizeTransactions(transactions);
    transactions = s.list;
    cacheSet('tx', transactions);
    if (s.changed) {
      // Persist sanitized data back to server (best-effort)
      try { save('tx', transactions); } catch (_) {}
    }
    sortTransactions();
    renderTable();
    // Refresh Planned modal if it is visible
    if (plannedModal && !plannedModal.classList.contains('hidden')) {
      renderPlannedModal();
      fixPlannedAlignment();
      expandPlannedDayLabels();
    }
  });

  // Listen for card changes
  onValue(cardsRef, (snap) => {
    const raw  = snap.val() ?? [];
    const next = Array.isArray(raw) ? raw : Object.values(raw);
    if (JSON.stringify(next) === JSON.stringify(cards)) return;

    cards = next;
    if (!cards.some(c => c.name === 'Dinheiro')) {
      cards.unshift({ name: 'Dinheiro', close: 0, due: 0 });
    }
    cacheSet('cards', cards);
    refreshMethods();
    renderCardList();
    renderTable();
  });

  // Listen for balance changes
  onValue(balRef, (snap) => {
    const val = snap.exists() ? snap.val() : null;
    if (val === startBalance) return;
    startBalance = val;
    cacheSet('startBal', startBalance);
    initStart();
    renderTable();
  });
  };

  const readyUser = (window.Auth && window.Auth.currentUser) ? window.Auth.currentUser : null;
  if (readyUser) { PATH = resolvePathForUser(readyUser); startRealtime(); }
  else {
    const h = (e) => {
      const u = e.detail && e.detail.user;
      if (u) { document.removeEventListener('auth:state', h); PATH = resolvePathForUser(u); startRealtime(); }
    };
    document.addEventListener('auth:state', h);
  }
} else {
  // Fallback (mock) — carrega uma vez
  const [liveTx, liveCards, liveBal] = await Promise.all([
    load('tx', []),
    load('cards', cards),
    load('startBal', startBalance)
  ]);

  const hasLiveTx    = Array.isArray(liveTx)    ? liveTx.length    > 0 : liveTx    && Object.keys(liveTx).length    > 0;
  const hasLiveCards = Array.isArray(liveCards) ? liveCards.length > 0 : liveCards && Object.keys(liveCards).length > 0;

  const fixedTx = Array.isArray(liveTx) ? liveTx : Object.values(liveTx || {});

  transactions = cacheGet('tx', []);
  cards = cacheGet('cards', [{name:'Dinheiro',close:0,due:0}]);
  startBalance = cacheGet('startBal', null);

  if (hasLiveTx && JSON.stringify(fixedTx) !== JSON.stringify(transactions)) {
    transactions = fixedTx;
    cacheSet('tx', transactions);
    renderTable();
  }
  if (hasLiveCards && JSON.stringify(liveCards) !== JSON.stringify(cards)) {
    cards = liveCards;
    if (!cards.some(c => c.name === 'Dinheiro')) cards.unshift({ name:'Dinheiro', close:0, due:0 });
    cacheSet('cards', cards);
    refreshMethods(); renderCardList(); renderTable();
  }
  if (liveBal !== startBalance) {
    startBalance = liveBal;
    cacheSet('startBal', startBalance);
    initStart(); renderTable();
  }
}
const openTxBtn = document.getElementById('openTxModal');
const txModal   = document.getElementById('txModal');
const closeTxModal = document.getElementById('closeTxModal');

/**
 * Reset the fields and state of the transaction modal.
 */
function resetTxModal() {
  // Clear text fields and date
  const descInput = document.getElementById('desc');
  const valueInput = document.getElementById('value');
  const dateInput = document.getElementById('opDate');
  if (descInput) descInput.value = '';
  if (valueInput) valueInput.value = '';
  if (dateInput) dateInput.value = todayISO();
  // Reset expense/income toggles
  document.querySelectorAll('.value-toggle button').forEach(btn => btn.classList.remove('active'));
  // Reset method switch to Dinheiro
  document.querySelectorAll('.switch-option').forEach(btn => btn.classList.remove('active'));
  const defaultBtn = document.querySelector('.switch-option[data-method="Dinheiro"]');
  if (defaultBtn) defaultBtn.classList.add('active');
  const hiddenSelect = document.getElementById('method');
  if (hiddenSelect) hiddenSelect.value = 'Dinheiro';
  const methodSwitch = document.querySelector('.method-switch');
  if (methodSwitch) methodSwitch.dataset.selected = 'Dinheiro';
  // Clear card selector
  const cardSelectorEl = document.getElementById('cardSelector');
  if (cardSelectorEl) {
    cardSelectorEl.innerHTML = '';
    cardSelectorEl.hidden = true;
  }
  // Reset recurrence and installments
  const recurrenceSelect = document.getElementById('recurrence');
  if (recurrenceSelect) recurrenceSelect.value = '';
  const parcelaBlock = document.getElementById('parcelasBlock');
  if (parcelaBlock) parcelaBlock.classList.add('hidden');
  const instSelect = document.getElementById('installments');
  if (instSelect) instSelect.value = '1';
  // Reset modal title and button
  const modalHeader = document.querySelector('#txModal h2');
  if (modalHeader) modalHeader.textContent = 'Lançar operação';
  const addBtnEl = document.getElementById('addBtn');
  if (addBtnEl) addBtnEl.textContent = 'Adicionar';
  // Reset pay-invoice mode UI bits
  isPayInvoiceMode = false;
  pendingInvoiceCtx = null;
  if (txModal && txModal.dataset && txModal.dataset.mode) delete txModal.dataset.mode;
  const invoiceParcelRow = document.getElementById('invoiceParcelRow');
  const invoiceParcel = document.getElementById('invoiceParcel');
  if (invoiceParcelRow) invoiceParcelRow.style.display = 'none';
  if (invoiceParcel) invoiceParcel.checked = false;
}

/**
 * Toggle the visibility of the transaction modal.
 */
function toggleTxModal() {
  const isOpening = txModal.classList.contains('hidden');
  if (isOpening) {
    if (!isEditing) {
      resetTxModal();
    }
    // Não travar o body; overlay já bloqueia a interação
  } else {
    // Restore scrolling
    // sem alterações no body
  }
  txModal.classList.toggle('hidden');
  // Rotate the floating button to indicate state
  if (openTxBtn) {
    openTxBtn.style.transform = isOpening ? 'rotate(45deg)' : 'rotate(0deg)';
  }
  if (isOpening) focusValueField();
  // Reflect global modal-open state (used by CSS to hide floating buttons/footer)
  updateModalOpenState();
  // Ao fechar o modal, sempre limpar estado de edição para evitar reabrir em modo editar
  if (!isOpening) {
    isEditing = null;
    pendingEditMode = null;
    pendingEditTxId = null;
    pendingEditTxIso = null;
  }
}

function focusValueField() {
  const valInput = document.getElementById('value');
  if (!valInput) return;
  // Ensure numeric keypad attributes remain
  try {
    if (valInput.type !== 'tel') valInput.type = 'tel';
    valInput.setAttribute('inputmode', 'decimal');
  } catch (_) {}

  const doFocus = () => {
    if (txModal && txModal.classList.contains('hidden')) return;
    try {
      valInput.focus({ preventScroll: true });
      // Select all to start typing immediately
      if (typeof valInput.select === 'function') valInput.select();
    } catch (_) {}
  };
  // Multiple attempts to accommodate iOS timing quirks
  doFocus();
  setTimeout(doFocus, 80);
  setTimeout(doFocus, 200);
  requestAnimationFrame(doFocus);
}

// Attach event handlers if elements exist
if (openTxBtn) openTxBtn.onclick = () => {
  // O botão "+" sempre deve abrir em modo "Adicionar"
  isEditing = null;
  pendingEditMode = null;
  pendingEditTxId = null;
  pendingEditTxIso = null;
  if (txModal && txModal.classList.contains('hidden')) {
    resetTxModal();
  }
  toggleTxModal();
  // Try to focus within the user gesture
  focusValueField();
};

// Helper: apply/remove body class depending on whether any bottom-modal is open
function updateModalOpenState() {
  const open = !!document.querySelector('.bottom-modal:not(.hidden)');
  const root = document.documentElement || document.body;
  if (open) root.classList.add('modal-open'); else root.classList.remove('modal-open');
}
if (closeTxModal) closeTxModal.onclick = toggleTxModal;
if (txModal) {
  txModal.onclick = (e) => {
    if (e.target === txModal) toggleTxModal();
  };
}
// Botão Home: centraliza o dia atual, mantendo-o colapsado
const homeBtn = document.getElementById('scrollTodayBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModal = document.getElementById('closeSettingsModal');
function scrollTodayIntoView() {
  try {
    const iso = todayISO();
    const wrap = wrapperEl || document.scrollingElement || document.documentElement;
    let dayEl = document.querySelector('details.day.today') ||
                document.querySelector(`details.day[data-key="d-${iso}"]`);
    if (!dayEl) { showToast('Dia atual não encontrado', 'error'); return; }
    const monthEl = dayEl.closest('details.month');
    if (monthEl && !monthEl.open) {
      monthEl.open = true;
      // aguarda próximo frame para layout estabilizar e reexecuta
      requestAnimationFrame(() => scrollTodayIntoView());
      return;
    }
    // manter colapsado (adiado para depois do scroll)
    if (dayEl.open) dayEl.open = false;
    // Centraliza manualmente no scroll container principal
    requestAnimationFrame(() => {
      try {
        const wrapRect = wrap.getBoundingClientRect();
        const elRect   = dayEl.getBoundingClientRect();
        const current  = wrap.scrollTop || 0;
        const elTopInWrap = (elRect.top - wrapRect.top) + current;
        // Desconta overlays fixos que ocupam área visível acima do conteúdo (ex.: sticky-month)
        let overlayAbove = 0;
        const sticky = document.querySelector('.sticky-month');
        // O sticky pode ficar "visível" durante o scroll; antecipe sempre sua altura
        if (sticky) {
          overlayAbove += sticky.offsetHeight || 0; // ~52px
        }
        const footerReserve = 180; // altura ajustada para alinhar o dia mais acima
        const effectiveViewport = Math.max(1, (wrap.clientHeight - overlayAbove - footerReserve));
        const targetTop = Math.max(
          0,
          elTopInWrap - (effectiveViewport / 2) + (dayEl.offsetHeight / 2)
        );
        wrap.scrollTo({ top: targetTop, behavior: 'smooth' });
      } catch (_) {
        dayEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    });
  } catch (_) {}
}
if (homeBtn) homeBtn.addEventListener('click', scrollTodayIntoView);

// Bottom pill: Home/Ajustes
(function setupBottomPill(){
  const pill = document.querySelector('.floating-pill');
  if (!pill) return;
  const highlight = pill.querySelector('.pill-highlight');
  const options = pill.querySelectorAll('.pill-option');
  const setSelected = (key) => {
    pill.dataset.selected = key;
    options.forEach(b => b.setAttribute('aria-selected', b.dataset.action === key ? 'true' : 'false'));
  };
  const updateHighlight = () => {
    const sel = pill.querySelector('.pill-option[aria-selected="true"]');
    if (!sel || !highlight) return;
    const pr = pill.getBoundingClientRect();
    const sr = sel.getBoundingClientRect();
    const x = sr.left - pr.left - 6; // 6px padding left
    highlight.style.transform = `translateX(${Math.max(0,x)}px)`;
    highlight.style.width = `${sr.width}px`;
  };
  options.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      setSelected(action); updateHighlight();
      if (action === 'home') scrollTodayIntoView();
else if (action === 'settings') {
        if (settingsModal) { renderSettings(); settingsModal.classList.remove('hidden'); }
        updateModalOpenState();
      }
    });
  });
  window.addEventListener('resize', updateHighlight);
  setTimeout(updateHighlight, 60);
})();

// Settings modal close handlers
if (closeSettingsModal) closeSettingsModal.onclick = () => { settingsModal.classList.add('hidden'); updateModalOpenState(); };
if (settingsModal) settingsModal.onclick = (e) => { if (e.target === settingsModal) { settingsModal.classList.add('hidden'); updateModalOpenState(); } };

// ---------- Settings modal rendering ----------
function getProfileFromAuth() {
  try {
    const u = window.Auth && window.Auth.currentUser;
    if (!u) return null;
    return { name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' };
  } catch { return null; }
}

function persistProfile(p) { try { cacheSet('profile', p); } catch {} }
function loadCachedProfile() { try { return cacheGet('profile', null); } catch { return null; } }

function renderSettings() {
  if (!settingsModal) return;
  const box = settingsModal.querySelector('.modal-content');
  if (!box) return;
  // Get profile (auth → cache; fallback cache)
  let prof = getProfileFromAuth();
  if (prof && prof.email) persistProfile(prof);
  if (!prof) prof = loadCachedProfile() || { name:'', email:'', photo:'' };
  const hasUser = !!(window.Auth && window.Auth.currentUser && !window.Auth.currentUser.isAnonymous);

  // Build profile card
  const avatarImg = prof.photo ? `<img src="${prof.photo}" alt="Avatar"/>` : '';
  const sub = prof.email || '';
  const cardHTML = `
    <div class="settings-card">
      <div class="settings-profile">
        <div class="settings-avatar">${avatarImg}</div>
        <div class="settings-names">
          <div class="settings-name">${(prof.name||'')}</div>
          <div class="settings-sub">${sub}</div>
        </div>
      </div>
    </div>`;
  const listHTML = hasUser ? `
    <div class="settings-list">
      <div class="settings-item danger">
        <button id="logoutBtn" class="settings-cta">
          <span class="settings-icon icon-logout"></span>
          <span>Sair da conta</span>
        </button>
        <span class="right"></span>
      </div>
      <div class="settings-item">
        <button id="repairBtn" class="settings-cta">
          <span class="settings-icon icon-refresh"></span>
          <span>Recuperar app (reinstalar PWA)</span>
        </button>
        <span class="right"></span>
      </div>
    </div>` : `
    <div class="settings-list">
      <div class="settings-item">
        <button id="loginBtn" class="settings-cta">
          <span class="settings-icon icon-google"></span>
          <span>Entrar com Google</span>
        </button>
        <span class="right"></span>
      </div>
      <div class="settings-item">
        <button id="repairBtn" class="settings-cta">
          <span class="settings-icon icon-refresh"></span>
          <span>Recuperar app (reinstalar PWA)</span>
        </button>
        <span class="right"></span>
      </div>
    </div>`;
  box.innerHTML = cardHTML + listHTML;
  const btn = box.querySelector('#logoutBtn');
  if (btn) btn.onclick = async () => {
    try { await (window.Auth && window.Auth.signOut ? window.Auth.signOut() : Promise.resolve()); }
    catch (_) {}
    // Clear local state minimal
    try { cacheSet('profile', null); } catch {}
    settingsModal.classList.add('hidden');
    updateModalOpenState();
    // UI overlay de login aparece via auth state
  };
  const btnLogin = box.querySelector('#loginBtn');
  if (btnLogin) btnLogin.onclick = async () => {
    try { await (window.Auth && window.Auth.signInWithGoogle ? window.Auth.signInWithGoogle() : Promise.resolve()); }
    catch (_) {}
    settingsModal.classList.add('hidden');
    updateModalOpenState();
  };
  const btnRepair = box.querySelector('#repairBtn');
  if (btnRepair) btnRepair.onclick = async () => {
    try { await hardRepairApp(); } catch (_) {}
  };
}

// Re-render settings when auth user changes (to keep profile fresh)
document.addEventListener('auth:state', () => {
  try { renderSettings(); } catch {}
});
// (Web Push removido)
// Block background scrolling via touch/wheel sempre que houver um modal aberto
function anyModalOpen(){ return !!document.querySelector('.bottom-modal:not(.hidden)'); }
function isInScrollableModal(el){
  const content = el && el.closest ? el.closest('.bottom-modal .modal-content') : null;
  if (!content) return false;
  let node = el;
  while (node && node !== content.parentElement) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return true;
    node = node.parentElement;
  }
  // fallback: treat .modal-content as scrollable container
  return content && content.scrollHeight > content.clientHeight;
}
// Allow scroll inside modal content; block background scroll only
document.addEventListener('touchmove', (e) => {
  if (!anyModalOpen()) return;
  const target = e.target;
  if (isInScrollableModal(target)) return; // allow natural scroll in modal
  e.preventDefault();
}, { passive: false });
document.addEventListener('wheel', (e) => {
  if (!anyModalOpen()) return;
  const target = e.target;
  if (isInScrollableModal(target)) return; // allow wheel inside modal
  e.preventDefault();
}, { passive: false });

// iOS 26: detectar teclado via VisualViewport, mas só ajustar botões inferiores
(function setupKbOffsets(){
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const THRESH = 140; // px
  const update = () => {
    const gap = (window.innerHeight || 0) - ((vv.height || 0) + (vv.offsetTop || 0));
    const isKb = gap > THRESH && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isKb) {
      root.dataset.vvKb = '1';
      root.style.setProperty('--kb-offset-bottom', Math.max(0, Math.round(gap)) + 'px');
    } else {
      delete root.dataset.vvKb;
      root.style.removeProperty('--kb-offset-bottom');
    }
  };
  update();
  vv.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 50));
  window.addEventListener('focusin', () => setTimeout(update, 0));
  window.addEventListener('focusout', () => setTimeout(update, 50));
})();




const currency=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
// Palavras que caracterizam “salário”
const SALARY_WORDS = ['salário', 'salario', 'provento', 'rendimento', 'pagamento', 'paycheck', 'salary'];
const mobile=()=>window.innerWidth<=480;
const fmt=d=>d.toLocaleDateString('pt-BR',mobile()?{day:'2-digit',month:'2-digit'}:{day:'2-digit',month:'2-digit',year:'numeric'});

// ---------------------------------------------------------------------------
// Sticky month header  (Safari/iOS não suporta <summary> sticky)
// ---------------------------------------------------------------------------
const headerEl      = document.querySelector('.app-header');
const HEADER_OFFSET = headerEl ? headerEl.getBoundingClientRect().height : 58;
const STICKY_VISIBLE = 18;
const stickyMonth     = document.createElement('div');
stickyMonth.className = 'sticky-month';
stickyMonth.style.top = (HEADER_OFFSET - STICKY_VISIBLE) + 'px';
document.body.appendChild(stickyMonth);

// Recalcula altura do header em rotação / resize
window.addEventListener('resize', () => {
  const h = headerEl.getBoundingClientRect().height;
  stickyMonth.style.top = (h - STICKY_VISIBLE) + 'px';
});

function updateStickyMonth() {
  let label = '';
  const divs = document.querySelectorAll('summary.month-divider');
  divs.forEach(div => {
    const rect = div.getBoundingClientRect();
    // choose the last divider whose top passed the header
    if (rect.top <= HEADER_OFFSET) {
      label = div.textContent.replace(/\s+/g, ' ').trim();
    }
  });
  if (label) {
    // Exibe apenas o nome do mês (primeira palavra do label)
    const mesApenas = label.split(/\s+/)[0];
    stickyMonth.textContent = mesApenas;
    stickyMonth.classList.add('visible');
  } else {
    stickyMonth.classList.remove('visible');
  }
}

// Atualiza stickyMonth ao rolar o container principal
if (wrapperEl) wrapperEl.addEventListener('scroll', updateStickyMonth);
else window.addEventListener('scroll', updateStickyMonth);

// --- Date helpers ---
/**
 * Formats a Date object to YYYY-MM-DD (ISO) in local time.
 * @param {Date} date
 * @returns {string}
 */
function formatToISO(date) {
  // Adjust for local timezone before formatting
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

// Retorna YYYY-MM-DD no fuso local (corrige o shift do toISOString em UTC)
const todayISO = () => formatToISO(new Date());
// expose todayISO to global for inline scripts
window.todayISO = todayISO;

// Ensure end-pad is computed on first render as well
// Keep end-pad in sync with toolbar/viewport changes (iOS/Safari)
// End‑pad fixado via CSS: sem atualizações dinâmicas

// Função para calcular o postDate de cartões corretamente (nova lógica)
const post = (iso, m) => {
  if (m === 'Dinheiro') return iso;
  const c = cards.find(x => x.name === m);
  if (!c) return iso;
  // Usa dayjs para facilitar manipulação de datas
  // Se não houver dayjs, implementa lógica equivalente
  const [y, mo, d] = iso.split('-').map(Number);
  const closingDay = c.close;
  const dueDay = c.due;
  const txDay = d;
  let invoiceMonth = mo - 1; // JS Date/Month é 0-based
  let invoiceYear = y;
  if (txDay > closingDay) {
    // entra na fatura do mês seguinte
    if (invoiceMonth === 11) {
      invoiceMonth = 0;
      invoiceYear += 1;
    } else {
      invoiceMonth += 1;
    }
  }
  // Monta data de vencimento da fatura (YYYY-MM-DD)
  const pad = n => String(n).padStart(2, '0');
  // Use formatToISO to ensure correct formatting (even though string concat is safe here)
  return formatToISO(new Date(invoiceYear, invoiceMonth, dueDay));
};

const addYearsIso  = (iso, n) => {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + n);
  return formatToISO(d);
};


// ---- Recurrence rule helpers ----
function isSameDayOfMonth(baseIso, testIso, monthInterval) {
  const [by, bm, bd] = baseIso.split('-').map(Number);
  const [ty, tm, td] = testIso.split('-').map(Number);
  if (td !== bd) return false;
  const monthsDiff = (ty - by) * 12 + (tm - bm);
  return monthsDiff % monthInterval === 0;
}

function occursOn(tx, iso) {
  // Exclude single exceptions
  if (tx.exceptions && tx.exceptions.includes(iso)) return false;
  // Exclude dates on or after recurrence end
  if (tx.recurrenceEnd && iso >= tx.recurrenceEnd) return false;
  if (!tx.recurrence) return false;
  if (iso < tx.opDate) return false;
  const baseDate = new Date(tx.opDate);
  const testDate = new Date(iso);
  const diffDays = Math.floor((testDate - baseDate) / 864e5);
  switch (tx.recurrence) {
    case 'D':  return true;
    case 'W':  return diffDays % 7  === 0;
    case 'BW': return diffDays % 14 === 0;
    case 'M':  return isSameDayOfMonth(tx.opDate, iso, 1);
    case 'Q':  return isSameDayOfMonth(tx.opDate, iso, 3);
    case 'S':  return isSameDayOfMonth(tx.opDate, iso, 6);
    case 'Y': {
      // Use formatToISO to compare only date parts (ignoring time zone issues)
      const bd = baseDate;
      const td = testDate;
      return bd.getDate() === td.getDate() && bd.getMonth() === td.getMonth();
    }
    default:   return false;
  }
}



const desc=$('desc'),val=$('value'),met=$('method'),date=$('opDate'),addBtn=$('addBtn');
// Toast pós‑salvar baseado na transação realmente criada
if (addBtn && !addBtn.dataset.toastSaveHook) {
  addBtn.dataset.toastSaveHook = '1';
  // Usa captura para executar antes de possíveis stopPropagation
  addBtn.addEventListener('click', () => {
    const label = (addBtn.textContent || '').toLowerCase();
    // Somente quando é "Adicionar" (não em edição/salvar)
    if (!label.includes('adicion')) return;
    // Defer para permitir que a tx seja criada e inserida em `transactions`
    setTimeout(() => {
      if (!Array.isArray(transactions) || !transactions.length) return;
      // Escolhe a transação com maior timestamp (ts)
      let latest = null;
      for (const t of transactions) {
        if (!latest || (t.ts || '') > (latest.ts || '')) latest = t;
      }
      if (!latest) return;
      try { showToast(buildSaveToast(latest), 'success'); } catch (_) {}
    }, 0);
  }, { capture: true });
}
// Ensure numeric keypad and proper formatting on mobile
try {
  // Prefer 'tel' to trigger numeric keypad on iOS; keep inputmode for Android/Chromium
  if (val.type !== 'tel') val.type = 'tel';
  val.setAttribute('inputmode', 'decimal');
  val.setAttribute('enterkeyhint', 'done');
  val.setAttribute('pattern', '[0-9.,]*');
} catch (_) {}

// Auto-format value input as BRL currency while typing
val.addEventListener('input', () => {
  // Remove all non-digit characters
  const digits = val.value.replace(/\D/g, '');
  // On first digit typed, automatically highlight the expense (red) toggle
  if (digits.length === 1) {
    document.querySelectorAll('.value-toggle button').forEach(b => b.classList.remove('active'));
    document.querySelector('.value-toggle button[data-type="expense"]').classList.add('active');
  }
  if (!digits) {
    val.value = '';
    return;
  }
  // Parse as cents and format
  const numberValue = parseInt(digits, 10) / 100;
  // Check toggle for sign
  const activeToggle = document.querySelector('.value-toggle button.active');
  let formatted = numberValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (activeToggle && activeToggle.dataset.type === 'expense') {
    formatted = '-' + formatted.replace(/^-/, '');
  } else {
    formatted = formatted.replace(/^-/, '');
  }
  val.value = formatted;
});

const valueToggles = document.querySelectorAll('.value-toggle button');
valueToggles.forEach(btn => {
  btn.addEventListener('click', () => {
    valueToggles.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Reformat current value preserving sign choice
    const digits = val.value.replace(/\D/g, '');
    if (!digits) {
      val.value = '';
      return;
    }
    const numberValue = parseInt(digits, 10) / 100;
    let formatted = numberValue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    if (btn.dataset.type === 'expense') {
      formatted = '-' + formatted.replace(/^-/, '');
    } else {
      formatted = formatted.replace(/^-/, '');
    }
    val.value = formatted;
  });
});

// pill-switch for Dinheiro vs Cartão
const methodButtons = document.querySelectorAll('.switch-option');
const hiddenSelect = document.getElementById('method');
methodButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    methodButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const selectedMethod = btn.dataset.method;
    hiddenSelect.value = selectedMethod;
    btn.closest('.method-switch').dataset.selected = selectedMethod;
    const cardSelector = document.getElementById('cardSelector');
    if (selectedMethod === 'Cartão') {
      renderCardSelector();
      cardSelector.hidden = false;
    } else {
      // clear any previously rendered cards and hide selector
      cardSelector.innerHTML = '';
      cardSelector.hidden = true;
    }
  });
});
// initialize hidden select to match default active
const initialMethod = document.querySelector('.switch-option.active').dataset.method;
hiddenSelect.value = initialMethod;
document.querySelector('.method-switch').dataset.selected = initialMethod;
// Also show/hide card selector on load
const cardSelector = document.getElementById('cardSelector');
if (initialMethod === 'Cartão') {
  renderCardSelector();
  cardSelector.hidden = false;
} else {
  cardSelector.hidden = true;
}

function renderCardSelector() {
  const container = document.getElementById('cardSelector');
  container.innerHTML = '';
  // Only render cards that are not 'Dinheiro'
  cards
    .filter(c => c.name !== 'Dinheiro')
    .forEach(c => {
      const label = document.createElement('label');
      label.style.flex = '1';
      label.innerHTML = `
        <input type="radio" name="cardChoice" value="${c.name}">
        ${c.name}
      `;
      container.appendChild(label);
    });
  // auto-select first card
  const first = container.querySelector('input[name="cardChoice"]');
  if (first) {
    first.checked = true;
    hiddenSelect.value = first.value;
  }
  // listen for changes
  container.querySelectorAll('input[name="cardChoice"]').forEach(radio => {
    radio.addEventListener('change', () => hiddenSelect.value = radio.value);
  });
}

// Recorrência e Parcelas
const recurrence = $('recurrence');
const parcelasBlock = $('parcelasBlock');
const installments = $('installments');

// --- Parcelamento desativado temporariamente ---
parcelasBlock.classList.add('hidden');
installments.value = '1';
installments.disabled = true;
// Não popula opções de parcelas e não exibe nem ativa nada relacionado a parcelas.
// Se selecionar recorrência, zera parcelas
recurrence.onchange = () => {
  if (recurrence.value !== '') installments.value = '1';
};
let isEditing = null;
const cardName=$('cardName'),cardClose=$('cardClose'),cardDue=$('cardDue'),addCardBtn=$('addCardBtn'),cardList=$('cardList');
const startGroup=$('startGroup'),startInput=$('startInput'),setStartBtn=$('setStartBtn'),resetBtn=$('resetData');
// Oculta o botão "Limpar tudo" em produção
if (resetBtn) {
  resetBtn.hidden = true;
  resetBtn.style.display = 'none';
  // Em produção, não anexamos o handler de limpeza.
}
// Auto-format initial balance input as BRL currency
if (startInput) {
  startInput.addEventListener('input', () => {
    const digits = startInput.value.replace(/\D/g, '');
    if (!digits) {
      startInput.value = '';
      return;
    }
    const numberValue = parseInt(digits, 10) / 100;
    startInput.value = numberValue.toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL'
    });
  });
}
const startContainer = document.querySelector('.start-container');
const dividerSaldo = document.getElementById('dividerSaldo');

const notify = (msg, type = 'error') => {
  const t = document.getElementById('toast');
  if (!t) return;

  // Set the message
  t.textContent = msg;

  // choose icon for CSS ::before
  t.style.setProperty('--icon', type === 'error' ? '"✕"' : '"✓"');

  // Remove any previous type classes
  t.classList.remove('success', 'error');

  // Add the new type (defines background color)
  t.classList.add(type);

  // ⚡️ Force a reflow so consecutive toasts restart the animation cleanly
  void t.offsetWidth;

  // Show the toast (opacity transition handled via CSS)
  t.classList.add('show');

  // Hide after 3 s: first fade out, then drop the color class to avoid flicker
  setTimeout(() => {
    t.classList.remove('show');          // starts fade‑out (0.3 s)
    // setTimeout(() => t.classList.remove(type), 300);
  }, 5000);
};

const togglePlanned = async (id, iso) => {
  const master = transactions.find(x => x.id === id);
  // ← memoriza quais faturas estavam abertas
  const openInvoices = Array.from(
    document.querySelectorAll('details.invoice[open]')
  ).map(el => el.dataset.pd);
  let toastMsg = null;
  if (!master) return;
  if (master.recurrence) {
    master.exceptions = master.exceptions || [];
    if (!master.exceptions.includes(iso)) {
      master.exceptions.push(iso);
      // Pergunta se deve mover para hoje
      const today = todayISO();
      const fmt = (s) => `${s.slice(8,10)}/${s.slice(5,7)}`;
      // Pergunta somente para operações em Dinheiro; cartão sempre vai para a fatura
      let execIso = iso;
      try {
        if (master.method === 'Dinheiro' && iso !== today) {
          const move = await askMoveToToday();
          if (move) execIso = today;
        }
      } catch (_) {}
      // Create a standalone executed transaction for this occurrence
      const execTx = {
        id: Date.now(),
        parentId: master.id,
        desc: master.desc,
        val: master.val,
        method: master.method,
        opDate: execIso,
        postDate: post(execIso, master.method),
        recurrence: '',
        installments: 1,
        planned: false,
        ts: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };
      transactions.push(execTx);
      // Exibe toast quando a ocorrência recorrente vai para a fatura (cartão)
      if (execTx.method !== 'Dinheiro') {
        const [, mm, dd] = execTx.postDate.split('-');
        toastMsg = `Movida para fatura de ${dd}/${mm}`;
      }
    }
  } else {
    // If un-planning an expired transaction, adjust based on method
    if (master.planned) {
      const today = todayISO();
      // Somente Dinheiro pergunta para mover; Cartão não pergunta e não altera opDate
      if (master.method === 'Dinheiro') {
        try {
          if (iso !== today) {
            const move = await askMoveToToday();
            if (move) {
              master.opDate = today;
              master.postDate = today;
            }
          }
        } catch (_) {}
      }
      // update timestamp of payment to today
      master.ts = new Date().toISOString();
    }
    master.planned = !master.planned;
    if (!master.planned && master.method !== 'Dinheiro') {
      // Para cartões, calcula a fatura com base na opDate (possivelmente movida)
      master.postDate = post(master.opDate, master.method);
      const [, mm, dd] = master.postDate.split('-');
      toastMsg = `Movida para fatura de ${dd}/${mm}`;
    }
  }
  save('tx', transactions);
  renderTable();
  // restaura faturas que o usuário tinha expandido
  openInvoices.forEach(pd => {
    const det = document.querySelector(`details.invoice[data-pd="${pd}"]`);
    if (det) det.open = true;
  });

  // mostra o toast por último, já com a tela renderizada
  if (toastMsg) notify(toastMsg, 'success');
};

const openCardBtn=document.getElementById('openCardModal');
const cardModal=document.getElementById('cardModal');
const closeCardModal=document.getElementById('closeCardModal');

function refreshMethods(){
  if (!met) return;
  met.innerHTML='';
  const list = Array.isArray(cards) && cards.length ? cards : [{name:'Dinheiro',close:0,due:0}];
  list.forEach(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;met.appendChild(o);});
}
// --- Card List Rendering (Refatorado) ---
function createCardSwipeActions(card) {
  const actions = document.createElement('div');
  actions.className = 'swipe-actions';

  // Edit SVG icon
  const editBtn = document.createElement('button');
  editBtn.className = 'icon edit';
  editBtn.style.padding = '0';
  editBtn.style.background = 'none';
  editBtn.style.border = 'none';
  editBtn.style.cursor = 'pointer';
  const editIconDiv = document.createElement('div');
  editIconDiv.className = 'icon-action icon-edit';
  editBtn.appendChild(editIconDiv);
  editBtn.addEventListener('click', () => {
    const newName  = prompt('Nome do cartão', card.name)?.trim();
    if (!newName) return;
    const newClose = parseInt(prompt('Dia de fechamento (1-31)', card.close), 10);
    const newDue   = parseInt(prompt('Dia de vencimento (1-31)', card.due), 10);
    if (
      isNaN(newClose) || isNaN(newDue) ||
      newClose < 1 || newClose > 31 ||
      newDue   < 1 || newDue   > 31 ||
      newClose >= newDue
    ) { alert('Dados inválidos'); return; }
    if (newName !== card.name && cards.some(c => c.name === newName)) {
      alert('Já existe cartão com esse nome'); return;
    }
    const oldName = card.name;
    card.name  = newName;
    card.close = newClose;
    card.due   = newDue;
    transactions.forEach(t => {
      if (t.method === oldName) {
        t.method   = newName;
        t.postDate = post(t.opDate, newName);
      }
    });
    save('cards', cards);
    save('tx', transactions);
    refreshMethods();
    renderCardList();
    renderTable();
  });
  actions.appendChild(editBtn);

  // Delete SVG icon
  const delBtn = document.createElement('button');
  delBtn.className = 'icon danger delete';
  delBtn.style.padding = '0';
  delBtn.style.background = 'none';
  delBtn.style.border = 'none';
  delBtn.style.cursor = 'pointer';
  const delIconDiv = document.createElement('div');
  delIconDiv.className = 'icon-action icon-delete';
  delBtn.appendChild(delIconDiv);
  delBtn.addEventListener('click', () => {
    if (!confirm('Excluir cartão?')) return;
    cards = cards.filter(x => x.name !== card.name);
    save('cards', cards);
    refreshMethods();
    renderCardList();
    renderTable();
  });
  actions.appendChild(delBtn);

  return actions;
}

function createCardContent(card) {
  const content = document.createElement('div');
  content.className = 'card-content card-line';
  content.innerHTML = `
    <b>${card.name}</b>
    <div class="card-detail">
      <span class="card-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1 .9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1 -.9-2-2-2zm0 16H5V9h14v11z"/>
        </svg>
      </span>
      <span class="card-label">Fechamento</span>
      <span class="card-value">${card.close}</span>
    </div>
    <div class="card-detail">
      <span class="card-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 20c4.41 0 8-3.59 8-8s-3.59-8 -8-8 -8 3.59 -8 8 3.59 8 8 8zm0-14c3.31 0 6 2.69 6 6s-2.69 6 -6 6 -6-2.69 -6-6 2.69-6 6-6zm.5 3H11v5l4.25 2.52 .75-1.23 -3.5-2.04V9z"/>
        </svg>
      </span>
      <span class="card-label">Vencimento</span>
      <span class="card-value">${card.due}</span>
    </div>
  `;
  return content;
}

function createCardListItem(card) {
  const li = document.createElement('li');
  const wrap = document.createElement('div');
  wrap.className = 'swipe-wrapper';

  const actions = createCardSwipeActions(card);
  const content = createCardContent(card);

  wrap.appendChild(actions);
  wrap.appendChild(content);
  li.appendChild(wrap);
  return li;
}

function renderCardList() {
  cardList.innerHTML = '';
  cards
    .filter(card => card.name !== 'Dinheiro')
    .forEach(card => {
      const li = createCardListItem(card);
      cardList.appendChild(li);
    });
  // swipe-init for cards is now handled via initSwipe at the end of the file.
}
// Helper: returns true if this record is a detached (single‑edited) occurrence
function isDetachedOccurrence(tx) {
  return !tx.recurrence && !!tx.parentId;
}

function makeLine(tx, disableSwipe = false) {
  // Create swipe wrapper
  const wrap = document.createElement('div');
  wrap.className = 'swipe-wrapper';

  // Create actions container
  const actions = document.createElement('div');
  actions.className = 'swipe-actions';

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'icon edit';
  editBtn.textContent = '';
  const editIconDiv = document.createElement('div');
  editIconDiv.className = 'icon-action icon-edit';
  editBtn.appendChild(editIconDiv);
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // master or dynamically recurring occurrence
    const t = tx;
    const hasRecurrence = (() => {
      if (typeof t.recurrence === 'string' && t.recurrence.trim() !== '') return true;
      if (t.parentId) {
        const master = transactions.find(p => p.id === t.parentId);
        if (master && typeof master.recurrence === 'string' && master.recurrence.trim() !== '') return true;
      }
      for (const p of transactions) {
        if (typeof p.recurrence === 'string' && p.recurrence.trim() !== '') {
          if (occursOn(p, t.opDate)) {
            if (p.desc === t.desc || p.val === t.val) return true;
          }
        }
      }
      return false;
    })();
    if (t.recurrence || (hasRecurrence && !t.recurrence && !t.parentId)) {
      pendingEditTxId  = t.id;
      pendingEditTxIso = t.opDate;
      editRecurrenceModal.classList.remove('hidden');
      return;
    }
    if (isDetachedOccurrence(t)) {
      pendingEditMode = null;
      editTx(t.id);
      return;
    }
    editTx(t.id);
  });
  actions.appendChild(editBtn);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'icon danger delete';
  delBtn.textContent = '';
  const delIconDiv = document.createElement('div');
  delIconDiv.className = 'icon-action icon-delete';
  delBtn.appendChild(delIconDiv);
  delBtn.onclick = () => {
    const t = tx;
    const hasRecurrence = (() => {
      if (typeof t.recurrence === 'string' && t.recurrence.trim() !== '') return true;
      if (t.parentId) {
        const master = transactions.find(p => p.id === t.parentId);
        if (master && typeof master.recurrence === 'string' && master.recurrence.trim() !== '') return true;
      }
      for (const p of transactions) {
        if (typeof p.recurrence === 'string' && p.recurrence.trim() !== '') {
          if (occursOn(p, t.opDate)) {
            if (p.desc === t.desc || p.val === t.val) return true;
          }
        }
      }
      return false;
    })();
    if (hasRecurrence) {
      delTx(t.id, t.opDate);
    } else {
      if (confirm('Deseja excluir esta operação?')) {
        transactions = transactions.filter(x => x.id !== t.id);
        save('tx', transactions);
        renderTable();
        notify('Operação excluída!', 'success');
      }
    }
  };
  actions.appendChild(delBtn);

  // Operation line
  const d = document.createElement('div');
  d.className = 'op-line';
  d.dataset.txId = tx.id;

  // Build content
  const topRow = document.createElement('div');
  topRow.className = 'op-main';
  const left = document.createElement('div');
  left.className = 'op-left';

  // --- Planned modal disables swipe, needs different structure ---
  if (disableSwipe === true) {
    // If planned, build checkbox and label
    if (tx.planned) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'plan-check';
      checkbox.name = 'planned';
      checkbox.onchange = () => togglePlanned(tx.id, tx.opDate);
      const labelWrapper = document.createElement('span');
      labelWrapper.textContent = tx.desc;
      // Patch: append checkbox then labelWrapper directly (no span wrapper)
      left.appendChild(checkbox);
      left.appendChild(labelWrapper);
    } else {
      const descNode = document.createElement('span');
      descNode.textContent = tx.desc;
      left.appendChild(descNode);
    }
    // Recurrence icon
    const t = tx;
    const hasRecurrence = (() => {
      if (typeof t.recurrence === 'string' && t.recurrence.trim() !== '') return true;
      if (t.parentId) {
        const master = transactions.find(p => p.id === t.parentId);
        if (master && typeof master.recurrence === 'string' && master.recurrence.trim() !== '') return true;
      }
      for (const p of transactions) {
        if (typeof p.recurrence === 'string' && p.recurrence.trim() !== '') {
          if (occursOn(p, t.opDate)) {
            if (p.desc === t.desc || p.val === t.val) return true;
          }
        }
      }
      return false;
    })();
    if (hasRecurrence) {
      const recIcon = document.createElement('span');
      recIcon.className = 'icon-repeat';
      recIcon.title = 'Recorrência';
      left.appendChild(recIcon);
    }
    if (!left.querySelector('.icon-repeat')) {
      const t = tx;
      const hasRecurrenceFinal =
        (typeof t.recurrence === 'string' && t.recurrence.trim() !== '') ||
        (t.parentId && transactions.some(p =>
          p.id === t.parentId &&
          typeof p.recurrence === 'string' &&
          p.recurrence.trim() !== ''
        ));
      if (hasRecurrenceFinal) {
        const recIc = document.createElement('span');
        recIc.className = 'icon-repeat';
        left.insertBefore(recIc, left.firstChild);
      }
    }
  } else {
    // Default structure (swipe enabled)
    if (tx.planned) {
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'plan-check';
      chk.name = 'planned';
      chk.onchange = () => togglePlanned(tx.id, tx.opDate);
      left.appendChild(chk);
    }
    const descNode = document.createElement('span');
    descNode.textContent = tx.desc;
    left.appendChild(descNode);
    // Recurrence icon
    const t = tx;
    const hasRecurrence = (() => {
      if (typeof t.recurrence === 'string' && t.recurrence.trim() !== '') return true;
      if (t.parentId) {
        const master = transactions.find(p => p.id === t.parentId);
        if (master && typeof master.recurrence === 'string' && master.recurrence.trim() !== '') return true;
      }
      for (const p of transactions) {
        if (typeof p.recurrence === 'string' && p.recurrence.trim() !== '') {
          if (occursOn(p, t.opDate)) {
            if (p.desc === t.desc || p.val === t.val) return true;
          }
        }
      }
      return false;
    })();
    if (hasRecurrence) {
      const recIcon = document.createElement('span');
      recIcon.className = 'icon-repeat';
      recIcon.title = 'Recorrência';
      left.appendChild(recIcon);
    }
    if (!left.querySelector('.icon-repeat')) {
      const t = tx;
      const hasRecurrenceFinal =
        (typeof t.recurrence === 'string' && t.recurrence.trim() !== '') ||
        (t.parentId && transactions.some(p =>
          p.id === t.parentId &&
          typeof p.recurrence === 'string' &&
          p.recurrence.trim() !== ''
        ));
      if (hasRecurrenceFinal) {
        const recIc = document.createElement('span');
        recIc.className = 'icon-repeat';
        left.insertBefore(recIc, left.firstChild);
      }
    }
  }

  const right = document.createElement('div');
  right.className = 'op-right';
  const value = document.createElement('span');
  value.className = 'value';
  value.textContent = `R$ ${(tx.val < 0 ? '-' : '')}${Math.abs(tx.val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  if (tx.val < 0) {
    value.classList.add('negative');
  } else {
    value.classList.add('positive');
  }
  right.appendChild(value);
  topRow.appendChild(left);
  topRow.appendChild(right);
  d.appendChild(topRow);

  // Timestamp & method
  const ts = document.createElement('div');
  ts.className = 'timestamp';
  const [y, mo, da] = tx.opDate.split('-').map(Number);
  const dateObj = new Date(y, mo - 1, da);
  const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const methodLabel = tx.method === 'Dinheiro' ? 'Dinheiro' : `Cartão ${tx.method}`;
  if (tx.planned) {
    ts.textContent = `${dateStr} - ${methodLabel}`;
  } else if (tx.opDate === todayISO()) {
    const timeStr = new Date(tx.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
    ts.textContent = timeStr;
  } else {
    ts.textContent = dateStr;
  }
  d.appendChild(ts);

  // Assemble wrapper and return
  wrap.appendChild(actions);
  wrap.appendChild(d);
  return wrap;
}
// swipe-init for operations is now handled via initSwipe at the end of the file.

function addCard(){const n=cardName.value.trim(),cl=+cardClose.value,du=+cardDue.value;if(!n||cl<1||cl>31||du<1||du>31||cl>=du||cards.some(c=>c.name===n)){alert('Dados inválidos');return;}cards.push({name:n,close:cl,due:du});cacheSet('cards', cards);save('cards',cards);refreshMethods();renderCardList();cardName.value='';cardClose.value='';cardDue.value='';}


// ---------- Pay Invoice Modal (reuse txModal) ----------
const invoiceParcelCheckbox = document.getElementById('invoiceParcel');
const invoiceParcelRow = document.getElementById('invoiceParcelRow');

function openPayInvoiceModal(cardName, dueISO, remaining, totalAbs, adjustedBefore) {
  // Open first (to avoid reset wiping our prefill), then prefill
  const wasHidden = txModal.classList.contains('hidden');
  if (wasHidden) toggleTxModal();
  isPayInvoiceMode = true;
  pendingInvoiceCtx = { card: cardName, dueISO, remaining, totalAbs, adjustedBefore };
  if (txModal) txModal.dataset.mode = 'pay-invoice';
  // Prefill form
  const today = todayISO();
  desc.value = `Pagamento fatura – ${cardName}`;
  // Set expense toggle active and format value as BRL (negative)
  document.querySelectorAll('.value-toggle button').forEach(b => b.classList.remove('active'));
  const expBtn = document.querySelector('.value-toggle button[data-type="expense"]');
  if (expBtn) expBtn.classList.add('active');
  const rem = Number(remaining) || 0;
  val.value = (-rem).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  date.value = today;
  // Lock method to Dinheiro
  hiddenSelect.value = 'Dinheiro';
  const methodSwitch = document.querySelector('.method-switch');
  if (methodSwitch) methodSwitch.dataset.selected = 'Dinheiro';
  methodButtons.forEach(b => { b.classList.toggle('active', b.dataset.method === 'Dinheiro'); });
  // Show parcel option (off by default)
  if (invoiceParcelRow) invoiceParcelRow.style.display = '';
  // Fix label content/order: [text span] ..... [checkbox]
  if (invoiceParcelRow && invoiceParcelCheckbox) {
    const cb = invoiceParcelCheckbox;
    // Preserve checkbox, rebuild label content
    invoiceParcelRow.textContent = '';
    const textSpan = document.createElement('span');
    textSpan.textContent = 'Parcelar fatura';
    invoiceParcelRow.appendChild(textSpan);
    invoiceParcelRow.appendChild(cb);
  }
  if (invoiceParcelCheckbox) invoiceParcelCheckbox.checked = false;
  installments.disabled = true;
  parcelasBlock.classList.add('hidden');
  recurrence.value = '';
  // Title and button
  txModalTitle.textContent = 'Pagar fatura';
  addBtn.textContent = 'Pagar';
}

// Toggle parcel block only in pay-invoice mode
if (invoiceParcelCheckbox) {
  invoiceParcelCheckbox.addEventListener('change', () => {
    if (!isPayInvoiceMode) return;
    if (invoiceParcelCheckbox.checked) {
      // Populate installments if not yet
      const sel = document.getElementById('installments');
      if (sel && !sel.dataset.populated) {
        sel.innerHTML = '';
        for (let i = 2; i <= 24; i++) {
          const o = document.createElement('option');
          o.value = String(i);
          o.textContent = `${i}x`;
          sel.appendChild(o);
        }
        sel.dataset.populated = '1';
      }
      parcelasBlock.classList.remove('hidden');
      installments.disabled = false;
      recurrence.value = 'M';
      // Default to 2x on (re)enable if previous value was 1 or empty
      if (!installments.value || installments.value === '1') installments.value = '2';
      // Set value field to per‑installment amount (negative)
      const ctx = pendingInvoiceCtx || {};
      const base = Math.abs(Number(ctx.remaining) || 0);
      const n = Math.max(2, parseInt(installments.value || '2', 10) || 2);
      installments.value = String(n);
      const per = n > 0 ? base / n : base;
      val.value = (-per).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      parcelasBlock.classList.add('hidden');
      installments.disabled = true;
      recurrence.value = '';
      installments.value = '1';
      // Restore full remaining amount to value field
      const ctx = pendingInvoiceCtx || {};
      const base = Math.abs(Number(ctx.remaining) || 0);
      val.value = (-base).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  });
}

// Update value when installments count changes (pay‑invoice mode only)
if (installments) {
  installments.addEventListener('change', () => {
    if (!isPayInvoiceMode) return;
    if (!invoiceParcelCheckbox || !invoiceParcelCheckbox.checked) return;
    const ctx = pendingInvoiceCtx || {};
    const base = Math.abs(Number(ctx.remaining) || 0);
    const n = parseInt(installments.value, 10) || 1;
    const per = n > 0 ? base / n : base;
    val.value = (-per).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}


// Localized addTx and helpers
async function addTx() {
  // Edit mode
  if (isEditing !== null) {
    // (mantém lógica de edição original)
    const t = transactions.find(x => x.id === isEditing);
    if (!t) {
      console.error('Transaction not found for editing:', isEditing);
      // reset edit state
      pendingEditMode = null;
      isEditing = null;
      addBtn.textContent = 'Adicionar';
      txModalTitle.textContent = 'Lançar operação';
      toggleTxModal();
      return;
    }
    const newDesc    = desc.value.trim();
    let newVal = parseFloat(val.value.replace(/\./g, '').replace(/,/g, '.')) || 0;
    const activeType = document.querySelector('.value-toggle button.active').dataset.type;
    if (activeType === 'expense') newVal = -Math.abs(newVal);
    const newMethod  = met.value;
    const newOpDate  = date.value;
    const newPostDate = post(newOpDate, newMethod);
    const newRecurrence  = recurrence.value;
    const newInstallments = parseInt(installments.value, 10) || 1;

    switch (pendingEditMode) {
      case 'single':
        // Exception for this occurrence
        t.exceptions = t.exceptions || [];
        if (!t.exceptions.includes(pendingEditTxIso)) {
          t.exceptions.push(pendingEditTxIso);
        }
        // Create standalone edited transaction
        transactions.push({
          id: Date.now(),
          parentId: t.parentId || t.id,
          desc: newDesc,
          val: newVal,
          method: newMethod,
          opDate: newOpDate,
          postDate: newPostDate,
          recurrence: '',
          installments: 1,
          planned: newOpDate > todayISO(),
          ts: new Date().toISOString(),
          modifiedAt: new Date().toISOString()
        });
        break;
      case 'future':
        // End original series at this occurrence
        t.recurrenceEnd = pendingEditTxIso;
        // Create new series starting from this occurrence
        transactions.push({
          id: Date.now(),
          parentId: null,
          desc: newDesc,
          val: newVal,
          method: newMethod,
          opDate: pendingEditTxIso,
          postDate: newPostDate,
          recurrence: newRecurrence,
          installments: newInstallments,
          planned: pendingEditTxIso > todayISO(),
          ts: new Date().toISOString(),
          modifiedAt: new Date().toISOString()
        });
        break;
      case 'all': {
        {
          /* —— EDITAR TODAS ——  
             Apenas altera a REGRA‑MESTRE, preservando todas as ocorrências
             passadas.  Se o registro clicado for uma ocorrência gerada,
             subimos para o pai; caso contrário usamos o próprio. */
          const master = t.parentId
            ? transactions.find(tx => tx.id === t.parentId)
            : t;
          if (master) {
            master.desc         = newDesc;
            master.val          = newVal;
            master.method       = newMethod;
            // Mantemos opDate original; só recalculamos postDate conforme novo método
            master.postDate     = post(master.opDate, newMethod);
            master.recurrence   = recurrence.value;
            master.installments = parseInt(installments.value, 10) || 1;
            master.modifiedAt   = new Date().toISOString();
          }
        }
        break;
      }
      default:
        // Fallback: modify just this entry
        t.desc       = newDesc;
        t.val        = newVal;
        t.method     = newMethod;
        t.opDate     = newOpDate;
        t.postDate   = newPostDate;
        t.recurrence   = newRecurrence;
        t.installments = newInstallments;
        // Ajusta flag planned caso a data da operação ainda não tenha ocorrido
        t.planned      = t.opDate > todayISO();
        t.modifiedAt = new Date().toISOString();
    }
    // Reset editing state
    pendingEditMode    = null;
    pendingEditTxId    = null;
    pendingEditTxIso   = null;
    isEditing          = null;
    addBtn.textContent = 'Adicionar';
    txModalTitle.textContent = 'Lançar operação';
    save('tx', transactions);
    renderTable();
    toggleTxModal();
    // Custom edit confirmation toast
    const formattedVal = parseFloat(val.value.replace(/\./g, '').replace(/,/g, '.'))
      .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const recValue = recurrence.value;
    let toastMsg;
    if (!recValue) {
      // Edição de operação única
      const opDateVal = date.value; // formato YYYY-MM-DD
      toastMsg = `Edição: ${formattedVal} em ${opDateVal.slice(8,10)}/${opDateVal.slice(5,7)}`;
    } else {
      // Edição de recorrência
      const recText = recurrence.options[recurrence.selectedIndex].text.toLowerCase();
      toastMsg = `Edição: ${formattedVal} (${recText})`;
    }
    showToast(toastMsg, 'success');
    return;
  }

  // Adição normal
  // Modo especial: pagamento/parcelamento de fatura
  if (isPayInvoiceMode && pendingInvoiceCtx) {
    const ctx = pendingInvoiceCtx;
    const rawVal = parseFloat(val.value.replace(/\./g, '').replace(/,/g, '.')) || 0;
    const amount = Math.abs(rawVal); // valor informado, sempre positivo
    if (amount <= 0) { showToast('Informe um valor válido.'); return; }
    const remaining = Number(ctx.remaining) || 0;
    const payVal = Math.min(amount, remaining);
    const payDate = date.value || todayISO();
    const nowIso = new Date().toISOString();

    if (invoiceParcelCheckbox && invoiceParcelCheckbox.checked && (parseInt(installments.value,10) || 1) > 1) {
      // Parcelamento: criar ajuste no dueISO e parcelas futuras (recorrência mensal)
      const n = Math.min(24, Math.max(2, parseInt(installments.value, 10) || 2));
      const perParcel = +(payVal / n).toFixed(2);
      // 1) Ajuste que neutraliza parte da fatura no vencimento (somente o valor pago)
      transactions.push({
        id: Date.now(),
        desc: `Ajuste fatura – ${ctx.card}`,
        val: 0,
        method: 'Dinheiro',
        opDate: ctx.dueISO,
        postDate: ctx.dueISO,
        planned: false,
        invoiceAdjust: { card: ctx.card, dueISO: ctx.dueISO, amount: payVal },
        ts: nowIso,
        modifiedAt: nowIso
      });
      // 2) Série mensal de parcelas (Dinheiro) que impactam o saldo nas datas das parcelas
      transactions.push({
        id: Date.now()+1,
        desc: `Parcela fatura – ${ctx.card}`,
        val: -perParcel,
        method: 'Dinheiro',
        opDate: payDate,
        postDate: payDate,
        recurrence: 'M',
        installments: n,
        planned: payDate > todayISO(),
        invoiceParcelOf: { card: ctx.card, dueISO: ctx.dueISO },
        ts: nowIso,
        modifiedAt: nowIso
      });
  } else {
      // Pagamento sem parcelar
      // a) Ajuste no vencimento atual que zera o impacto da fatura
      const totalAbs = Number(ctx.totalAbs) || 0;
      const adjustedBefore = Number(ctx.adjustedBefore) || 0;
      const adjustAmount = Math.max(0, totalAbs - adjustedBefore);
      transactions.push({
        id: Date.now(),
        desc: `Ajuste fatura – ${ctx.card}`,
        val: 0,
        method: 'Dinheiro',
        opDate: ctx.dueISO,
        postDate: ctx.dueISO,
        planned: false,
        invoiceAdjust: { card: ctx.card, dueISO: ctx.dueISO, amount: adjustAmount },
        ts: nowIso,
        modifiedAt: nowIso
      });
      // b) Registro de pagamento (confirmação)
      transactions.push({
        id: Date.now()+1,
        desc: `Pagamento fatura – ${ctx.card}`,
        val: -payVal,
        method: 'Dinheiro',
        opDate: payDate,
        postDate: payDate,
        planned: payDate > todayISO(),
        invoicePayment: { card: ctx.card, dueISO: ctx.dueISO },
        ts: nowIso,
        modifiedAt: nowIso
      });
      // c) Se pagamento parcial, rola o restante para a próxima fatura
      const remainingAfter = Math.max(0, remaining - payVal);
      if (remainingAfter > 0) {
        // Calcula próximo vencimento (mesmo dia do mês, ajustando para o último dia se necessário)
        const base = new Date(ctx.dueISO + 'T00:00:00');
        const y = base.getFullYear();
        const m = base.getMonth(); // 0-based
        const d = base.getDate();
        const lastNext = new Date(y, m + 2, 0).getDate(); // last day of next month
        const nextDue = new Date(y, m + 1, Math.min(d, lastNext));
        const nextDueISO = nextDue.toISOString().slice(0,10);
        // Rollover para a próxima fatura com rótulo amigável (ex.: "Pendente da fatura de Setembro")
        const monthName = base.toLocaleDateString('pt-BR', { month: 'long' });
        const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        transactions.push({
          id: Date.now()+2,
          desc: `Pendente da fatura de ${monthLabel}`,
          val: -remainingAfter,
          method: ctx.card,
          opDate: ctx.dueISO,      // operação "executada"; não aparece no dia (cartão executado)
          postDate: nextDueISO,    // impacta a fatura do próximo vencimento
          planned: false,
          invoiceRolloverOf: { card: ctx.card, fromDueISO: ctx.dueISO },
          ts: nowIso,
          modifiedAt: nowIso
        });
      }
    }
    // Persist & UI
    save('tx', transactions);
    renderTable();
    toggleTxModal();
    // reset pay mode state
    isPayInvoiceMode = false;
    pendingInvoiceCtx = null;
    if (txModal && txModal.dataset && txModal.dataset.mode) delete txModal.dataset.mode;
    addBtn.textContent = 'Adicionar';
    txModalTitle.textContent = 'Lançar operação';
    showToast('Pagamento registrado', 'success');
    return;
  }

  if (startBalance === null) {
    showToast('Defina o saldo inicial primeiro (pode ser 0).');
    return;
  }
  const formData = collectTxFormData();
  if (!formData) return;
  const tx = buildTransaction(formData);
  const _promise = finalizeTransaction(tx); // fire-and-forget
  resetTxForm();                            // fecha o modal já
  _promise.catch(err => console.error('finalizeTransaction failed:', err));
}

// 1. Coleta os dados do formulário e valida
function collectTxFormData() {
  const d = desc.value.trim();
  let v = parseFloat(val.value.replace(/\./g, '').replace(/,/g, '.')) || 0;
  const activeType = document.querySelector('.value-toggle button.active').dataset.type;
  if (activeType === 'expense') v = -Math.abs(v);
  const m = met.value;
  const iso = date.value;
  const recur = recurrence.value;
  // Parcelamento desativado: sempre 1
  const inst = 1;
  if (!d || isNaN(v) || !iso) {
    alert('Complete os campos');
    return null;
  }
  return {
    desc: d,
    val: v,
    method: m,
    opDate: iso,
    recurrence: recur,
    installments: inst
  };
}

// 2. Monta o objeto transação final
function buildTransaction(data) {
  return {
    id: Date.now(),
    parentId: null,
    desc: data.desc,
    val: data.val,
    method: data.method,
    opDate: data.opDate,
    postDate: post(data.opDate, data.method),
    recurrence: data.recurrence,
    installments: 1,
    planned: data.opDate > todayISO(),
    ts: new Date().toISOString(),
    modifiedAt: new Date().toISOString()
  };
}

// 3. Adiciona ao array global, salva e renderiza
async function finalizeTransaction(tx) {
  let batch = tx.recurrence ? [tx] : [tx];

  // Atualiza UI/estado imediatamente
  transactions.push(...batch);
  sortTransactions();
  cacheSet('tx', transactions);

  try {
    if (!navigator.onLine) {
      for (const t of batch) await queueTx(t);
      updatePendingBadge();
      renderTable();
      showToast('Offline: transação salva na fila', 'error');
      return;
    }

    // Online: enfileira sem aguardar e faz flush em background
    for (const t of batch) queueTx(t); // fire-and-forget
    flushQueue().catch(err => console.error('flushQueue (async) failed:', err));

    updatePendingBadge();
    renderTable();
    save('tx', transactions);
  } catch (e) {
    console.error('finalizeTransaction error:', e);
  }
}

// 4. Fecha modal, toast de sucesso e limpa campos
function resetTxForm() {
  desc.value = '';
  val.value  = '';
  date.value = todayISO();
  toggleTxModal();
  // Custom save confirmation toast
  const v = 0; // valor já limpo, mas podemos mostrar mensagem genérica
  // Recupera última transação para mensagem
  let last = transactions[transactions.length - 1];
  let formattedVal = last && typeof last.val === 'number'
    ? last.val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '';
  const recValue = recurrence.value;
  let toastMsg;
  if (!recValue && last) {
    const opDateVal = last.opDate; // formato YYYY-MM-DD
    toastMsg = `${formattedVal} salvo em ${opDateVal.slice(8,10)}/${opDateVal.slice(5,7)}`;
  } else if (last) {
    const recText = recurrence.options[recurrence.selectedIndex].text.toLowerCase();
    toastMsg = `${formattedVal} salvo (${recText})`;
  } else {
    toastMsg = `Transação salva`;
  }
  showToast(toastMsg, 'success');
}

// Função auxiliar para gerar recorrências
function generateOccurrences(baseTx) {
  const recur = baseTx.recurrence;
  if (!recur) return [];
  const occurrences = [];
  const parentId = baseTx.id;
  // Limita a 12 ocorrências (exemplo: 1 ano) para evitar explosão
  let max = 12;
  let d = new Date(baseTx.opDate);
  for (let i = 1; i < max; i++) {
    // Avança data conforme recorrência
    switch(recur) {
      case 'D': d.setDate(d.getDate() + 1); break;
      case 'W': d.setDate(d.getDate() + 7); break;
      case 'BW': d.setDate(d.getDate() + 14); break;
      case 'M': d.setMonth(d.getMonth() + 1); break;
      case 'Q': d.setMonth(d.getMonth() + 3); break;
      case 'S': d.setMonth(d.getMonth() + 6); break;
      case 'Y': d.setFullYear(d.getFullYear() + 1); break;
      default: break;
    }
    const nextIso = d.toISOString().slice(0, 10);
    // Calcula postDate com a regra de cartão
    let postDate = post(nextIso, baseTx.method);
    occurrences.push({
      ...baseTx,
      id: parentId + i,
      parentId,
      opDate: nextIso,
      postDate: postDate,
      planned: postDate > todayISO(),
      ts: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      recurrence: '',
      installments: 1
    });
  }
  return occurrences;
}
// Função utilitária para buscar cartão por id (caso não exista)
function getCardById(id) {
  if (!id) return null;
  // Tenta encontrar cartão pelo campo id, ou pelo nome (fallback)
  return cards.find(c => c.id === id || c.name === id) || null;
}

// Função utilitária para formatar data ISO (YYYY-MM-DD)
function formatDateISO(date) {
  if (!(date instanceof Date)) return '';
  return date.toISOString().slice(0,10);
}

// Delete a transaction (with options for recurring rules)
function delTx(id, iso) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;

  // Se NÃO for recorrente (nem ocorrência destacada), exclui direto
  if (!t.recurrence && !t.parentId) {
    transactions = transactions.filter(x => x.id !== id);
    save('tx', transactions);
    renderTable();
    showToast('Operação excluída.', 'success');
    return;
  }

  // Recorrente → abre modal de escopo
  pendingDeleteTxId = id;
  pendingDeleteTxIso = iso || t.opDate;
  deleteRecurrenceModal.classList.remove('hidden');
}

function closeDeleteModal() {
  deleteRecurrenceModal.classList.add('hidden');
  pendingDeleteTxId = null;
  pendingDeleteTxIso = null;
}

// Modal handlers
closeDeleteRecurrenceModal.onclick = closeDeleteModal;
cancelDeleteRecurrence.onclick = closeDeleteModal;
deleteRecurrenceModal.onclick = e => { if (e.target === deleteRecurrenceModal) closeDeleteModal(); };

// Helper: find the master recurring rule for a given tx/iso
function findMasterRuleFor(tx, iso) {
  if (!tx) return null;
  if (tx.recurrence && tx.recurrence.trim() !== '') return tx;
  if (tx.parentId) {
    const parent = transactions.find(p => p.id === tx.parentId);
    if (parent) return parent;
  }
  // Heuristic: find a rule that occurs on the same date and looks like this tx
  for (const p of transactions) {
    if (!p.recurrence || !p.recurrence.trim()) continue;
    if (!occursOn(p, iso)) continue;
    const sameMethod = (p.method || '') === (tx.method || '');
    const sameDesc   = (p.desc || '') === (tx.desc || '');
    const sameVal    = Math.abs(Number(p.val || 0) - Number(tx.val || 0)) < 0.005;
    if (sameMethod && (sameDesc || sameVal)) return p;
  }
  return null;
}

deleteSingleBtn.onclick = () => {
  const tx = transactions.find(t => t.id === pendingDeleteTxId);
  const iso = pendingDeleteTxIso;
  if (!tx) { closeDeleteModal(); return; }
  const master = findMasterRuleFor(tx, iso);
  if (master) {
    master.exceptions = master.exceptions || [];
    if (!master.exceptions.includes(iso)) master.exceptions.push(iso);
    showToast('Ocorrência excluída!', 'success');
  } else {
    // fallback: not a recurrence → hard delete
    transactions = transactions.filter(x => x.id !== tx.id);
    showToast('Operação excluída.', 'success');
  }
  save('tx', transactions);
  renderTable();
  closeDeleteModal();
};

deleteFutureBtn.onclick = () => {
  const tx = transactions.find(t => t.id === pendingDeleteTxId);
  const iso = pendingDeleteTxIso;
  if (!tx) { closeDeleteModal(); return; }
  const master = findMasterRuleFor(tx, iso);
  if (master) {
    master.recurrenceEnd = iso;
    showToast('Esta e futuras excluídas!', 'success');
  } else {
    // fallback: not a recurrence → delete only this occurrence
    transactions = transactions.filter(x => x.id !== tx.id);
    showToast('Operação excluída.', 'success');
  }
  save('tx', transactions);
  renderTable();
  closeDeleteModal();
};

deleteAllBtn.onclick = () => {
  const tx = transactions.find(t => t.id === pendingDeleteTxId);
  if (!tx) { closeDeleteModal(); return; }
  const master = findMasterRuleFor(tx, pendingDeleteTxIso) || tx;
  // Remove both master rule and any occurrences with parentId
  transactions = transactions.filter(t => t.id !== master.id && t.parentId !== master.id);
  save('tx', transactions);
  renderTable();
  closeDeleteModal();
  showToast('Todas as recorrências excluídas!', 'success');
};

// Modal Editar Recorrência handlers
function closeEditModal() {
  editRecurrenceModal.classList.add('hidden');
}
closeEditRecurrenceModal.onclick = closeEditModal;
cancelEditRecurrence.onclick = closeEditModal;
editRecurrenceModal.onclick = e => { if (e.target === editRecurrenceModal) closeEditModal(); };

editSingleBtn.onclick = () => {
  pendingEditMode = 'single';
  closeEditModal();
  editTx(pendingEditTxId);
};
editFutureBtn.onclick = () => {
  pendingEditMode = 'future';
  closeEditModal();
  editTx(pendingEditTxId);
};
editAllBtn.onclick = () => {
  pendingEditMode = 'all';
  closeEditModal();
  editTx(pendingEditTxId);
};
const editTx = id => {
  const t = transactions.find(x => x.id === id);
  if (!t) return;

  // 1) Hard reset para não herdar estado da edição anterior
  if (typeof resetTxModal === 'function') resetTxModal();

  // 2) Descrição
  desc.value = t.desc || '';

  // 3) Valor + toggle despesa/receita
  const valInput = document.getElementById('value');
  if (valInput) {
    const abs = Math.abs(Number(t.val || 0));
    valInput.value = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  document.querySelectorAll('.value-toggle button').forEach(b => b.classList.remove('active'));
  const type = (Number(t.val || 0) < 0) ? 'expense' : 'income';
  const typeBtn = document.querySelector(`.value-toggle button[data-type="${type}"]`);
  if (typeBtn) typeBtn.classList.add('active');
  if (type === 'expense' && valInput) {
    valInput.value = '-' + valInput.value.replace(/^-/, '');
  }

  // 4) Método de pagamento (pill + select + radios do cartão)
  met.value = t.method;
  const methodSwitch  = document.querySelector('.method-switch');
  const cardSelectorEl= document.getElementById('cardSelector');
  document.querySelectorAll('.switch-option').forEach(b => b.classList.remove('active'));

  if (t.method === 'Dinheiro') {
    if (methodSwitch) methodSwitch.dataset.selected = 'Dinheiro';
    const cashBtn = document.querySelector('.switch-option[data-method="Dinheiro"]');
    if (cashBtn) cashBtn.classList.add('active');
    if (cardSelectorEl) { cardSelectorEl.innerHTML = ''; cardSelectorEl.hidden = true; }
  } else {
    if (methodSwitch) methodSwitch.dataset.selected = 'Cartão';
    const cardBtn = document.querySelector('.switch-option[data-method="Cartão"]');
    if (cardBtn) cardBtn.classList.add('active');
    // Renderiza as opções de cartão e marca o cartão da transação
    if (typeof renderCardSelector === 'function') renderCardSelector();
    if (cardSelectorEl) {
      const sel = cardSelectorEl.querySelector(`input[name="cardChoice"][value="${CSS.escape(t.method)}"]`);
      if (sel) sel.checked = true;
      cardSelectorEl.hidden = false;
    }
  }

  // 5) Data (respeita pendingEditMode/pendingEditTxIso)
  date.value = (pendingEditMode && pendingEditTxIso) ? pendingEditTxIso : t.opDate;

  // 6) Recorrência / parcelas
  recurrence.value = t.recurrence || '';
  installments.value = String(t.installments || 1);

  // 7) Estado e rótulos
  isEditing = id;
  addBtn.textContent = 'Salvar';
  txModalTitle.textContent = 'Editar operação';

  // 8) Abre o modal apenas se estiver fechado (evita fechar sem querer)
  if (txModal.classList.contains('hidden')) {
    toggleTxModal();
  }
  const vEl = document.getElementById('value');
  if (vEl) { vEl.focus(); vEl.select(); }
};

// ===== Hook único para EDITAR: decide entre modal de escopo (recorrente) ou edição direta =====
document.addEventListener('click', (e) => {
  const editEl = e.target.closest('.icon-edit, [data-action="edit"]');
  if (!editEl) return;

  // tenta obter o id a partir do elemento da linha
  const container = editEl.closest('.op-item, .op-line, .swipe-wrapper') || document;
  const txEl = container.querySelector('[data-tx-id]');
  const id = txEl ? Number(txEl.dataset.txId) : null;
  if (!id) return;

  const t = transactions.find(x => x.id === id);
  if (!t) return;

  pendingEditTxId  = id;
  pendingEditTxIso = t.opDate;

  if (t.recurrence || t.parentId) {
    // recorrente → abre modal de escopo de edição
    editRecurrenceModal.classList.remove('hidden');
  } else {
    // não recorrente → vai direto para edição
    editTx(id);
  }

  e.preventDefault();
  e.stopPropagation();
});

function renderTable() {
  clearTableContent();
  const groups = groupTransactionsByMonth();
  renderTransactionGroups(groups);
}

// Defensive render: avoids silent failures leaving the UI empty
function safeRenderTable(attempt = 1) {
  try {
    renderTable();
  } catch (err) {
    console.error('renderTable failed (attempt ' + attempt + '):', err);
    try { showToast('Erro ao renderizar. Tentando novamente…', 'error', 2500); } catch (_) {}
    if (attempt < 3) setTimeout(() => safeRenderTable(attempt + 1), 300);
  }
}

// 1. NÃO limpe o #accordion aqui para preservar estado; apenas zere o tableBody (legacy).
function clearTableContent() {
  // Preserva o estado do acordeão; a limpeza/recálculo é feita dentro de renderAccordion().
  if (typeof tbody !== 'undefined' && tbody) {
    tbody.innerHTML = '';
  }
}

// 2. Agrupa as transações globais por mês (YYYY-MM) e retorna um Map ordenado por data.
function groupTransactionsByMonth() {
  // Agrupa transações por mês (YYYY-MM)
  const groups = new Map();
  sortTransactions();
  for (const tx of transactions) {
    // Usa postDate para agrupamento por mês, com fallback seguro
    const pd = tx.postDate || (tx.opDate && tx.method ? post(tx.opDate, tx.method) : tx.opDate);
    if (!pd || typeof pd.slice !== 'function') continue; // ignora itens malformados
    const key = pd.slice(0, 7); // YYYY-MM
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }
  // Ordena o Map por chave (YYYY-MM), decrescente (mais recente primeiro)
  return new Map([...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}

// 3. Recebe o Map agrupado e itera renderizando os meses em ordem decrescente, usando renderAccordion
function renderTransactionGroups(groups) {
  // Aqui, para manter compatibilidade com a UI, apenas chama renderAccordion
  // que já monta o acordeão por mês/dia/fatura, usando os dados globais.
  // Se desejar, pode passar os grupos para renderAccordion para customização.
  renderAccordion();
}


// -----------------------------------------------------------------------------
// Acordeão: mês → dia → fatura
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Accordion: month ▶ day ▶ invoice
// Shows every month (Jan–Dec) and every day (01–31),
// past months collapsed by default, current & future months open.
// -----------------------------------------------------------------------------
function renderAccordion() {
  const acc = document.getElementById('accordion');
  if (!acc) return;
  const hydrating = acc.dataset && acc.dataset.state === 'skeleton';
  // Salva quais <details> estão abertos
  const openKeys = Array.from(acc.querySelectorAll('details[open]'))
                        .map(d => d.dataset.key || '');
  // Preserve which invoice panels are open
  const openInvoices = Array.from(
    acc.querySelectorAll('details.invoice[open]')
  ).map(d => d.dataset.pd);
  if (!hydrating) acc.innerHTML = '';

  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const currency = v => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const curMonth = new Date().getMonth();   // 0‑based

  // Helper para criar o header da fatura do cartão
  function createCardInvoiceHeader(cardName, cardTotalAmount, dueISO) {
    const invSum = document.createElement('summary');
    invSum.classList.add('invoice-header-line');
    // Formatação do total original da fatura (valor bruto)
    const formattedTotal = cardTotalAmount < 0
      ? `R$ -${Math.abs(cardTotalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : `R$ ${cardTotalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    // Metadados: pagamentos (dinheiro), ajustes e parcelamento
    const paidAbs = transactions
      .filter(t => t.invoicePayment && t.invoicePayment.card === cardName && t.invoicePayment.dueISO === dueISO)
      .reduce((s, t) => s + Math.abs(Number(t.val) || 0), 0);
    const parcel = transactions.find(t => t.invoiceParcelOf && t.invoiceParcelOf.card === cardName && t.invoiceParcelOf.dueISO === dueISO);
    const totalAbs = Math.abs(cardTotalAmount);

    // Regras de exibição: só marcar como pago/strike após uma ação do usuário (pagamento ou parcelamento)
    const struck = (paidAbs > 0) || !!parcel;
    let note = '';
    if (parcel) {
      const n = parseInt(parcel.installments, 10) || 0;
      const per = Math.abs(Number(parcel.val) || 0);
      const perFmt = `R$ ${per.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      note = `<small class="note">Parcelada em ${n} vezes de ${perFmt}</small>`;
    } else if (paidAbs >= totalAbs - 0.005) { // tolerância de centavos
      note = `<small class="note">Paga</small>`;
    } else if (paidAbs > 0) {
      const remaining = Math.max(0, totalAbs - paidAbs);
      note = `<small class="note">Restante - R$ ${remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</small>`;
    }

    invSum.innerHTML = `
      <span class="invoice-label">Fatura – ${cardName}</span>
      <span class="invoice-total"><span class="amount${struck ? ' struck' : ''}">${formattedTotal}</span>${note}</span>
    `;
    return invSum;
  }

  // Helper para calcular a data de vencimento (YYYY-MM-DD) do cartão para determinado mês/ano
  function getCardDueDateKey(card, year, month) {
    // card.due: dia do vencimento
    // month: 0-based
    // year: full year
    const pad = n => String(n).padStart(2, '0');
    return `${year}-${pad(month + 1)}-${pad(card.due)}`;
  }

  // Helper para obter todas as transações de um cartão para o mês/ano da data
  function getAllTransactionsOnCard(cardName, year, month) {
    const txs = [];
    const targetMonth = month;           // 0‑based
    const targetYear  = year;

    // Define a 60‑day window that comfortably spans:
    // • todo o mês alvo
    // • o intervalo entre o fechamento do cartão do mês anterior
    //   e a data de vencimento da fatura do mês alvo.
    const windowStart = new Date(targetYear, targetMonth - 1, 1); // 1.º dia do mês anterior
    const windowEnd   = new Date(targetYear, targetMonth + 1, 0); // último dia do mês seguinte

    // Percorre todas as transações já persistidas
    transactions.forEach(tx => {
      if (tx.method !== cardName) return;

      // 1. Operações únicas --------------------------------------------
      if (!tx.recurrence) {
        const pd = new Date(tx.postDate);
        if (pd.getFullYear() === targetYear && pd.getMonth() === targetMonth) {
          txs.push(tx);
        }
        return;          // done
      }

      // 2. Operações recorrentes ---------------------------------------
      // Gera ocorrências apenas dentro da janela de 60 dias para performance.
      for (let d = new Date(windowStart); d <= windowEnd; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (!occursOn(tx, iso)) continue;

        const pd  = post(iso, cardName);
        const pdDate = new Date(pd);
        if (pdDate.getFullYear() === targetYear && pdDate.getMonth() === targetMonth) {
          txs.push({
            ...tx,
            opDate: iso,           // dia real da compra
            postDate: pd,          // dia de vencimento da fatura
            planned: iso > todayISO()
          });
        }
      }
    });

    // Exibe na fatura apenas transações que já foram executadas
    return txs.filter(t => !t.planned);
  }

  // Helper to get all transactions of a specific ISO date
  const txByDate = iso => {
  const list = [];
  const today = todayISO();

  // ================= NON-RECURRING =================
  transactions.forEach(t => {
    if (t.recurrence) return;            // só não-recorrentes aqui
    if (t.opDate !== iso) return;        // renderiza sempre no opDate
    // Oculta movimentos internos da fatura (pagamento/ajuste)
    if (t.invoicePayment || t.invoiceAdjust) return;

    if (t.method !== 'Dinheiro') {
      // CARTÃO
      if (t.planned) {
        // planejada → aparece no dia lançado (opDate)
        list.push(t);
      } else {
        // executada → NÃO aparece no dia; vai só para a fatura (postDate)
      }
    } else {
      // DINHEIRO → aparece sempre no opDate (planejada ou executada)
      list.push(t);
    }
  });

  // ================= RECURRING RULES =================
  transactions
    .filter(t => t.recurrence)
    .forEach(master => {
      if (!occursOn(master, iso)) return; // materializa somente a ocorrência do dia

      const pd = post(iso, master.method);
      const plannedFlag = iso > today;    // futuro → planejada; passado/hoje → executada

      if (master.method !== 'Dinheiro') {
        // CARTÃO recorrente
        if (plannedFlag) {
          // planejada → aparece no opDate
          list.push({
            ...master,
            opDate: iso,
            postDate: pd,
            planned: true,
            recurrence: ''
          });
        } else {
          // executada → NÃO aparece no dia; vai só para a fatura no postDate
        }
      } else {
      // DINHEIRO recorrente → sempre aparece no opDate (planejada/executada)
      list.push({
        ...master,
        opDate: iso,
        postDate: post(iso, 'Dinheiro'),
        planned: plannedFlag,
        recurrence: ''
      });
    }
  });

  // Ordem cronológica estável (por opDate e ts)
  list.sort((a, b) => {
    const dateCmp = a.opDate.localeCompare(b.opDate);
    if (dateCmp !== 0) return dateCmp;
    return (a.ts || '').localeCompare(b.ts || '');
  });

  return list;
  };

  let runningBalance = startBalance || 0;          // saldo acumulado
  for (let mIdx = 0; mIdx < 12; mIdx++) {
    const nomeMes = new Date(2025, mIdx).toLocaleDateString('pt-BR', { month: 'long' });
    // Build or reuse month container
    let mDet;
    if (hydrating) {
      mDet = acc.querySelector(`details.month[data-key="m-${mIdx}"]`) || document.createElement('details');
      mDet.className = 'month';
      mDet.dataset.key = `m-${mIdx}`;
      const isOpen = mIdx >= curMonth;
      mDet.open = openKeys.includes(mDet.dataset.key) || isOpen;
      if (!mDet.parentElement) acc.appendChild(mDet);
      // Ensure summary exists and is in final structure
      let mSum = mDet.querySelector('summary.month-divider');
      if (!mSum) {
        mSum = document.createElement('summary');
        mSum.className = 'month-divider';
        mDet.prepend(mSum);
      }
      // Update header content (month name; meta updated later)
      mSum.innerHTML = `
        <div class="month-row">
          <span class="month-name">${nomeMes.toUpperCase()}</span>
        </div>
        <div class="month-meta">
          <span class="meta-label"></span>
          <span class="meta-value"></span>
        </div>`;
    } else {
      mDet = document.createElement('details');
      mDet.className = 'month';
      mDet.dataset.key = `m-${mIdx}`;   // identifica o mês
      const isOpen = mIdx >= curMonth;
      mDet.open = openKeys.includes(mDet.dataset.key) || isOpen;
    }
    // Month total = sum of all tx in that month
    const monthTotal = transactions
      .filter(t => new Date(t.postDate).getMonth() === mIdx)
      .reduce((s,t) => s + t.val, 0);
    // Cabeçalho flutuante dos meses
    let mSum = mDet.querySelector('summary.month-divider');
    if (!mSum) { mSum = document.createElement('summary'); mSum.className = 'month-divider'; }

    const monthActual = transactions
      .filter(t => {
        const pd = new Date(t.postDate);
        return pd.getMonth() === mIdx && !t.planned;
      })
      .reduce((s, t) => s + t.val, 0);

    const monthPlanned = transactions
      .filter(t => {
        const pd = new Date(t.postDate);
        return pd.getMonth() === mIdx && t.planned;
      })
      .reduce((s, t) => s + t.val, 0);

    let metaLabel = '';
    let metaValue = '';

    if (mIdx < curMonth) { // meses passados
      metaLabel = 'Saldo final:';
      metaValue = currency(monthActual);
    } else if (mIdx === curMonth) { // mês corrente
      metaLabel = 'Saldo atual:';
      metaValue = currency(monthActual);
    } else { // meses futuros
      metaLabel = 'Saldo projetado:';
      metaValue = currency(monthActual + monthPlanned);
    }

    mSum.innerHTML = `
      <div class="month-row">
        <span class="month-name">${nomeMes.toUpperCase()}</span>
      </div>
      <div class="month-meta">
        <span class="meta-label">${metaLabel}</span>
        <span class="meta-value">${metaValue}</span>
      </div>`;

    if (!hydrating) mDet.appendChild(mSum);

    // Garante o número correto de dias em cada mês
    const daysInMonth = new Date(2025, mIdx + 1, 0).getDate();
    let monthEndBalanceForHeader;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(2025, mIdx, d);
      const iso = formatToISO(dateObj);
      const dayTx = txByDate(iso);

      // === DAILY IMPACT (novas regras) — TABELA: só cálculo, sem UI ===
const invoicesByCard = {};
const addToGroup = (cardName, tx) => {
  if (!invoicesByCard[cardName]) invoicesByCard[cardName] = [];
  invoicesByCard[cardName].push(tx);
};

// Não-recorrentes de cartão: vencem hoje
transactions.forEach(t => {
  if (t.method !== 'Dinheiro' && !t.recurrence && t.postDate === iso) {
    addToGroup(t.method, t);
  }
});

// Recorrentes de cartão: varre 60 dias p/ trás por ocorrências cujo postDate == hoje
const _scanStart = new Date(iso);
_scanStart.setDate(_scanStart.getDate() - 60);
for (const master of transactions.filter(t => t.recurrence && t.method !== 'Dinheiro')) {
  for (let d2 = new Date(_scanStart); d2 <= new Date(iso); d2.setDate(d2.getDate() + 1)) {
    const occIso = d2.toISOString().slice(0, 10);
    if (!occursOn(master, occIso)) continue;
    const pd = post(occIso, master.method);
    if (pd === iso) {
      addToGroup(master.method, {
        ...master,
        opDate: occIso,
        postDate: iso,
        planned: false,
        recurrence: ''
      });
    }
  }
}

// 1) Dinheiro impacta o saldo no dia da operação (inclui invoicePayment; exclui invoiceAdjust)
//    Agora considera também as ocorrências de recorrências em Dinheiro no dia
const cashNonRecurring = transactions
  .filter(t => t.method === 'Dinheiro' && !t.recurrence && t.opDate === iso)
  .filter(t => !t.invoiceAdjust) // ajustes da fatura têm val=0 e não devem afetar caixa
  .reduce((s, t) => s + (Number(t.val) || 0), 0);

// Soma das recorrências de Dinheiro que ocorrem neste dia
const cashRecurring = transactions
  .filter(t => t.method === 'Dinheiro' && t.recurrence)
  .filter(t => occursOn(t, iso))
  .reduce((s, t) => s + (Number(t.val) || 0), 0);

const cashImpact = cashNonRecurring + cashRecurring;

// 2) Cartões impactam via total da fatura no vencimento, menos ajustes (parcelamentos/rollovers)
const invoiceTotals = {};
Object.keys(invoicesByCard).forEach(card => {
  invoiceTotals[card] = invoicesByCard[card].reduce((s, t) => s + t.val, 0);
});
// Soma ajustes positivos que deslocam parte da fatura deste dueISO
const sumAdjustFor = (cardName, dueISO) => transactions
  .filter(t => t.invoiceAdjust && t.invoiceAdjust.card === cardName && t.invoiceAdjust.dueISO === dueISO)
  .reduce((s, t) => s + (Number(t.invoiceAdjust.amount) || 0), 0);
let cardImpact = 0;
Object.keys(invoiceTotals).forEach(card => {
  const adj = sumAdjustFor(card, iso);
  // Ajustes positivos reduzem o impacto da fatura no dia
  cardImpact += (invoiceTotals[card] + adj);
});

const dayTotal = cashImpact + cardImpact;
      runningBalance += dayTotal;                           // atualiza saldo acumulado
      const dow = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
      let dDet;
      if (hydrating) {
        dDet = mDet.querySelector(`details.day[data-key="d-${iso}"]`) || document.createElement('details');
        dDet.className = 'day';
        dDet.dataset.key = `d-${iso}`;
        dDet.open = openKeys.includes(dDet.dataset.key);
        dDet.dataset.has = String(dayTx.length > 0);
        if (!dDet.parentElement) mDet.appendChild(dDet);
      } else {
        dDet = document.createElement('details');
        dDet.dataset.has = String(dayTx.length > 0);
        dDet.className = 'day';
        dDet.dataset.key = `d-${iso}`;    // identifica o dia YYYY‑MM‑DD
        dDet.open = openKeys.includes(dDet.dataset.key);
      }
      const today = todayISO();
      if (iso === today) dDet.classList.add('today');
      let dSum = dDet.querySelector('summary.day-summary');
      if (!dSum) { dSum = document.createElement('summary'); dSum.className = 'day-summary'; }
      const saldoFormatado = runningBalance < 0
        ? `R$ -${Math.abs(runningBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : `R$ ${runningBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const baseLabel = `${String(d).padStart(2,'0')} - ${dow.charAt(0).toUpperCase() + dow.slice(1)}`;
      const hasCardDue = cards.some(card => card.due === d);
      const hasSalary  = dayTx.some(t =>
        SALARY_WORDS.some(w => t.desc.toLowerCase().includes(w))
      );

      const labelParts = [baseLabel];
      if (hasCardDue) labelParts.push('<span class="icon-invoice"></span>');
      if (hasSalary)  labelParts.push('<span class="icon-salary"></span>');

      const labelWithDue = labelParts.join('');
      dSum.innerHTML = `<span>${labelWithDue}</span><span class="day-balance" style="margin-left:auto">${saldoFormatado}</span>`;
      if (runningBalance < 0) dDet.classList.add('negative');
      // Replace or append summary
      if (!hydrating) dDet.appendChild(dSum); else if (!dDet.contains(dSum)) dDet.prepend(dSum);

      // Seção de planejados (apenas se houver planejados)
      const plannedOps = dayTx
        .filter(t => t.planned)
        .sort((a, b) => {
          const dateCmp = a.opDate.localeCompare(b.opDate);
          if (dateCmp !== 0) return dateCmp;
          return (a.ts || '').localeCompare(b.ts || '');
        });

      // === INVOICE UI (vencendo hoje) ===
      // Remove restos de render anteriores
      if (!hydrating) { (dDet.querySelectorAll && dDet.querySelectorAll('details.invoice').forEach(n => n.remove())); }

      if (!hydrating) Object.keys(invoicesByCard).forEach(cardName => {
        const det = document.createElement('details');
        det.className = 'invoice swipe-wrapper';
        det.dataset.pd = iso; // YYYY-MM-DD (vencimento)
        // id de swipe para localizar ações fora do <details>
        det.dataset.swipeId = `inv_${cardName.replace(/[^a-z0-9]/gi,'')}_${iso.replace(/-/g,'')}_${Math.random().toString(36).slice(2,7)}`;

        // Cabeçalho padrão da fatura
        const invHeader = createCardInvoiceHeader(cardName, invoiceTotals[cardName] || 0, iso);
        det.appendChild(invHeader);

        // Ações do swipe como irmã de <details>, para não serem ocultadas quando colapsado
        const headerActions = document.createElement('div');
        headerActions.className = 'swipe-actions';
        headerActions.dataset.for = det.dataset.swipeId;
        const payBtn = document.createElement('button');
        payBtn.className = 'icon';
        const payIcon = document.createElement('div');
        payIcon.className = 'icon-action icon-pay';
        payBtn.appendChild(payIcon);
        headerActions.appendChild(payBtn);
        // Posiciona sobre o header usando o container do dia
        dDet.style.position = dDet.style.position || 'relative';
        Object.assign(headerActions.style, {
          position:'absolute',
          right:'0',            // fica colado à direita; visibilidade controlada por opacity
          background:'transparent',
          zIndex: 3,
          pointerEvents: 'none' // habilita somente quando revelado pelo swipe
        });
        requestAnimationFrame(() => {
          const top = det.offsetTop + invHeader.offsetTop;
          headerActions.style.top = top + 'px';
          headerActions.style.height = invHeader.getBoundingClientRect().height + 'px';
        });
        dDet.appendChild(headerActions);
        // Não empurra para fora da tela; usamos opacity/pointer-events
        // Ao clicar em pagar, abrir modal de pagamento com valor restante
        payBtn.addEventListener('click', () => {
          const dueISO = iso;
          const total = invoiceTotals[cardName] || 0;
          const paid = transactions.filter(t => t.invoicePayment && t.invoicePayment.card===cardName && t.invoicePayment.dueISO===dueISO)
            .reduce((s,t)=> s + Math.abs(t.val||0), 0);
          const adjusted = transactions.filter(t => t.invoiceAdjust && t.invoiceAdjust.card===cardName && t.invoiceAdjust.dueISO===dueISO)
            .reduce((s,t)=> s + Math.abs(Number(t.invoiceAdjust.amount)||0), 0);
          const remaining = Math.max(0, Math.abs(total) - paid - adjusted);
          openPayInvoiceModal(cardName, dueISO, remaining, Math.abs(total), adjusted);
        });

        // Itens da fatura (apenas visual; o saldo usa somente o total)
        invoicesByCard[cardName]
          .filter(t => !t.planned)
          .forEach(t => det.appendChild(makeLine(t)));
        dDet.appendChild(det);
      });
      if (plannedOps.length) {
        const plannedSection = document.createElement('div');
        plannedSection.className = 'planned-cash';
        const plannedHeader = document.createElement('div');
        plannedHeader.className = 'planned-header';
        plannedHeader.textContent = 'Planejados:';
        plannedSection.appendChild(plannedHeader);
        const plannedList = document.createElement('ul');
        plannedList.className = 'planned-list';
        plannedSection.appendChild(plannedList);

        plannedOps.forEach(t => {
          const li = document.createElement('li');
          li.appendChild(makeLine(t));
          plannedList.appendChild(li);
        });

        dDet.appendChild(plannedSection);
      }


      // Seção de executados em dinheiro (apenas se houver)
      const cashExec = dayTx.filter(t => t.method.toLowerCase() === 'dinheiro' && !t.planned);
      if (cashExec.length) {
        const executedCash = document.createElement('div');
        executedCash.className = 'executed-cash';
        const execHeader = document.createElement('div');
        execHeader.className = 'executed-header';
        execHeader.textContent = 'Executados:';
        executedCash.appendChild(execHeader);
        const execList = document.createElement('ul');
        execList.className = 'executed-list';

        cashExec.forEach(t => {
          const li = document.createElement('li');
          li.appendChild(makeLine(t));
          execList.appendChild(li);
        });

        executedCash.appendChild(execList);
        dDet.appendChild(executedCash);
      }

      mDet.appendChild(dDet);
    }

// --- Atualiza o preview do mês com base no último dia visível ---
monthEndBalanceForHeader = runningBalance; // saldo do último dia do mês
const headerPreviewLabel = (mIdx < curMonth) ? 'Saldo final' : 'Saldo planejado';

    // Atualiza o summary do mês (cabeçalho do accordion)
    const labelEl = mSum.querySelector('.meta-label');
    const valueEl = mSum.querySelector('.meta-value');
    if (labelEl) labelEl.textContent = headerPreviewLabel + ':';
    if (valueEl) valueEl.textContent = currency(monthEndBalanceForHeader);

    // (month summary já foi adicionado no topo; não adicionar novamente)
    if (!hydrating || !mDet.parentElement) acc.appendChild(mDet);

    // Cria linha meta como elemento independente
    const previewLabel = (mIdx < curMonth) ? 'Saldo final:' : 'Saldo planejado:';
    let metaLine = mDet.nextSibling;
    const isMetaLine = node => node && node.nodeType === 1 && node.classList && node.classList.contains('month-meta');
    if (!isMetaLine(metaLine)) {
      metaLine = document.createElement('div');
      metaLine.className = 'month-meta';
    }
    metaLine.innerHTML = `<span>| ${previewLabel}</span><strong>${currency(monthEndBalanceForHeader)}</strong>`;
    // Clique em "Saldo final" também expande/colapsa o mês
    metaLine.addEventListener('click', () => {
      mDet.open = !mDet.open;
    });

    // Se o mês estiver fechado (collapsed), exibe metaLine abaixo de mDet
    if (!mDet.open) {
      if (!isMetaLine(mDet.nextSibling)) acc.appendChild(metaLine);
    } else {
      // se estiver aberto, garanta que a linha meta não fique sobrando
      if (isMetaLine(mDet.nextSibling)) acc.removeChild(mDet.nextSibling);
    }

    // Atualiza visibilidade ao expandir/fechar
    mDet.addEventListener('toggle', () => {
      if (mDet.open) {
        if (metaLine.parentElement === acc) {
          acc.removeChild(metaLine);
        }
      } else {
        acc.insertBefore(metaLine, mDet.nextSibling);
      }
    });
  }
  // Restore open state for invoice panels
  openInvoices.forEach(pd => {
    acc.querySelectorAll(`details.invoice[data-pd="${pd}"]`).forEach(inv => inv.open = true);
  });
  if (hydrating && acc.dataset) delete acc.dataset.state;
  updateStickyMonth();
}

function initStart() {
  const showStart = startBalance === null && transactions.length === 0;
  // exibe ou oculta todo o container de saldo inicial
  startContainer.style.display = showStart ? 'block' : 'none';
  dividerSaldo.style.display = showStart ? 'block' : 'none';
  // (mantém linha antiga para compatibilidade)
  startGroup.style.display = showStart ? 'flex' : 'none';
  // mantém o botão habilitado; a função addTx impede lançamentos
  addBtn.classList.toggle('disabled', showStart);
}
setStartBtn.addEventListener('click', () => {
  const raw = startInput.value || '';
  // remove tudo que não for dígito
  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    alert('Valor inválido');
    return;
  }
  // interpreta como centavos
  const numberValue = parseInt(digits, 10) / 100;
  if (isNaN(numberValue)) {
    alert('Valor inválido');
    return;
  }
  // salva o novo saldo e renderiza novamente
  startBalance = numberValue;
  cacheSet('startBal', startBalance);
  save('startBal', startBalance);
  initStart();
  renderTable();
});

addCardBtn.onclick=addCard;addBtn.onclick=addTx;
openCardBtn.onclick = () => { cardModal.classList.remove('hidden'); updateModalOpenState(); };
closeCardModal.onclick = () => { cardModal.classList.add('hidden'); updateModalOpenState(); };
cardModal.onclick = e => { if (e.target === cardModal) { cardModal.classList.add('hidden'); updateModalOpenState(); } };

 (async () => {
    // Instancia todos os botões “Adicionar” a partir do template
  document.querySelectorAll('[data-add-btn-container]').forEach(container => {
    const tpl = document.getElementById('add-button-template');
    const btn = tpl.content.cloneNode(true).firstElementChild;
    const targetId = container.dataset.targetId;
    if (targetId) btn.id = targetId;
    container.appendChild(btn);
  });
  date.value = todayISO();
  // Renderiza imediatamente com dados em cache
  refreshMethods();
  renderCardList();
  initStart();
  safeRenderTable();
  // exibe conteúdo após carregar dados localmente
  const wrap = document.querySelector('.wrapper');
  wrap.classList.remove('app-hidden');
  // Remove skeleton flag so start-balance obeys real logic
  try { document.documentElement.classList.remove('skeleton-boot'); } catch (_) {}
  // iOS/Safari: force layout settle so bottom extent is correct
  // tiny scroll nudge prevents initial underflow that hides last days
  try {
    const y = wrap.scrollTop;
    wrap.scrollTop = y + 1;
    wrap.scrollTop = y;
  } catch {}

  // Watchdog: se o acordeão não montar, tenta novamente sem travar a UI
  const ensureAccordion = () => {
    const hasMonths = document.querySelector('#accordion details.month');
    if (!hasMonths) {
      console.warn('Accordion still empty; retrying render…');
      safeRenderTable();
    }
  };
  // duas tentativas espaçadas
  setTimeout(ensureAccordion, 1200);
  setTimeout(ensureAccordion, 4000);

  // Spacer dinâmico no fim: só aparece quando o usuário encosta o fim
  // para permitir que o último divider passe sob o pseudo‑footer
  try {
    let endSpacer = document.getElementById('endScrollSpacer');
    if (!endSpacer) {
      endSpacer = document.createElement('div');
      endSpacer.id = 'endScrollSpacer';
      Object.assign(endSpacer.style, {
        height: '0px', width: '100%', pointerEvents: 'none'
      });
      wrap.appendChild(endSpacer);
    }
    const targetSpacer = () => {
      const btn = document.querySelector('.floating-add-button');
      const h = btn ? (btn.getBoundingClientRect().height || 64) : 64;
      return Math.max(72, Math.round(h + 12));
    };
    const updateEndSpacer = () => {
      const nearBottom = (wrap.scrollTop + wrap.clientHeight) >= (wrap.scrollHeight - 2);
      endSpacer.style.height = nearBottom ? (targetSpacer() + 'px') : '0px';
    };
    wrap.addEventListener('scroll', updateEndSpacer);
    window.addEventListener('resize', updateEndSpacer);
    if (window.visualViewport) visualViewport.addEventListener('resize', updateEndSpacer);
    updateEndSpacer();
  } catch (_) {}

  if (typeof PATH === 'string') {
    try {
      const [liveTx, liveCards, liveBal] = await Promise.all([
        load('tx', []),
        load('cards', cards),
        load('startBal', startBalance)
      ]);

      const hasLiveTx    = Array.isArray(liveTx)    ? liveTx.length    > 0 : liveTx    && Object.keys(liveTx).length    > 0;
      const hasLiveCards = Array.isArray(liveCards) ? liveCards.length > 0 : liveCards && Object.keys(liveCards).length > 0;

      // Converte objeto → array se necessário
      const fixedTx = Array.isArray(liveTx) ? liveTx : Object.values(liveTx || {});

      if (hasLiveTx) {
        // Sanitize and persist if needed (one-time migration path on boot)
        const s = sanitizeTransactions(fixedTx);
        if (JSON.stringify(s.list) !== JSON.stringify(transactions)) {
          transactions = s.list;
          cacheSet('tx', transactions);
          if (s.changed) { try { save('tx', transactions); } catch (_) {} }
          renderTable();
        }
      }
      if (hasLiveCards && JSON.stringify(liveCards) !== JSON.stringify(cards)) {
        cards = liveCards;
        if(!cards.some(c=>c.name==='Dinheiro'))cards.unshift({name:'Dinheiro',close:0,due:0});
        cacheSet('cards', cards);
        refreshMethods(); renderCardList(); renderTable();
      }
      if (liveBal !== startBalance) {
        startBalance = liveBal;
        cacheSet('startBal', startBalance);
        initStart(); renderTable();
      }
    } catch (_) { /* ignore boot fetch when not logged yet */ }
  }
  // exibe versão
  const verEl = document.getElementById('version');
  if (verEl) verEl.textContent = `v${APP_VERSION}`;
  // se online, tenta esvaziar fila pendente
  if (navigator.onLine) flushQueue();
})();

// Service Worker registration and sync event (disabled in mock mode)
if (!USE_MOCK && 'serviceWorker' in navigator) {
  // Helper: non-intrusive update banner
  function showUpdateBanner(onUpdateClick) {
    let banner = document.getElementById('updateBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'updateBanner';
      banner.className = 'update-banner';
      const label = document.createElement('div');
      label.textContent = 'Nova versão disponível';
      const btn = document.createElement('button');
      btn.textContent = 'Atualizar';
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Atualizando…';
        try { onUpdateClick && onUpdateClick(); } catch (_) {}
      });
      banner.appendChild(label);
      banner.appendChild(btn);
      document.body.appendChild(banner);
    }
    return banner;
  }

  navigator.serviceWorker.register('sw.js?v=1.4.8(a25)').then(reg => {
    // Only reload when user explicitly accepts the update
    let requestedUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!requestedUpdate) return;
      try { window.location.reload(); } catch (_) {}
    });

    const promptUpdate = (postMsgTarget) => {
      const banner = showUpdateBanner(() => {
        requestedUpdate = true;
        try { postMsgTarget && postMsgTarget.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
      });
      return banner;
    };

    // If an update is already waiting, show prompt
    if (reg.waiting) {
      promptUpdate(reg.waiting);
    }

    // Detect updates while the page is open
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          // New version ready → let user choose when to update
          promptUpdate(sw);
        }
      });
    });
  });
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'sync-tx') flushQueue();
  });
}
// Planejados modal handlers
// Planejados modal – subfunções auxiliares
function updatePlannedModalHeader() {
  // Define título, botão de fechar e demais elementos do cabeçalho do modal Planejados
  // (No HTML já existe: <h2>Planejados</h2> e <button id="closePlannedModal"...>)
  // Aqui pode-se garantir que o título está correto e o botão de fechar visível.
  const plannedModal = document.getElementById('plannedModal');
  if (!plannedModal) return;
  const h2 = plannedModal.querySelector('h2');
  if (h2) h2.textContent = 'Planejados';
  const closeBtn = plannedModal.querySelector('#closePlannedModal');
  if (closeBtn) closeBtn.style.display = '';
}

function preparePlannedList() {
  plannedList.innerHTML = '';

  // Agrupa por data
  const plannedByDate = {};
  const add = (tx) => {
    const key = tx.opDate;
    if (!plannedByDate[key]) plannedByDate[key] = [];
    plannedByDate[key].push(tx);
  };

  const today = todayISO();

  // 1) Planejados já salvos (a partir de hoje)
  for (const tx of transactions) {
    if (!tx) continue;
    if (tx.planned && tx.opDate && tx.opDate >= today) add(tx);
  }

  // 2) Filhas de recorrência projetadas para os próximos 90 dias
  const DAYS_AHEAD = 90;
  for (const master of transactions) {
    if (!master || !master.recurrence) continue;

    for (let i = 1; i <= DAYS_AHEAD; i++) {           // começa em amanhã; hoje nasce executada
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + i);
      const iso = typeof formatToISO === 'function' ? formatToISO(d) : d.toISOString().slice(0,10);
      if (!occursOn(master, iso)) continue;

      // evita duplicata se já houver planejado nesse dia
      const dup = (plannedByDate[iso] || []).some(t =>
        (t.parentId && t.parentId === master.id) ||
        ((t.desc||'')===(master.desc||'') && (t.method||'')===(master.method||'') &&
         Math.abs(Number(t.val||0))===Math.abs(Number(master.val||0)))
      );
      if (dup) continue;

      add({
        ...master,
        id: `${master.id || 'r'}_${iso}`,
        parentId: master.id || null,
        opDate: iso,
        postDate: post(iso, master.method),
        planned: true,
        recurrence: master.recurrence,   // mantém ícone de recorrência
      });
    }
  }

  // 3) Ordena e renderiza mantendo o DOM atual
  const sortedDates = Object.keys(plannedByDate).sort();
  for (const date of sortedDates) {
    const group = plannedByDate[date].sort((a,b)=>(a.ts||'').localeCompare(b.ts||''));

    const dateObj = new Date(date+'T00:00');
    const dateLabel = dateObj.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'});
    const groupHeader = document.createElement('h3');
    groupHeader.textContent = `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)}`;
    plannedList.appendChild(groupHeader);

    for (const tx of group) plannedList.appendChild(makeLine(tx, true)); // sem wrapper extra
  }
}

function bindPlannedActions() {
  // Adiciona interações como gestos de swipe, botões "Hoje"/"Adiar", e event listeners relacionados ao Planejados modal.
  // (No momento, não há ações extras além do checkbox, mas se houver, adicione aqui.)
  // Exemplo: inicializar swipe ou outros listeners no plannedList, se necessário.
  // (No modal Planejados, os listeners de checkbox já são definidos inline; se houver mais, adicionar aqui.)
}

function renderPlannedModal() {
  updatePlannedModalHeader();
  preparePlannedList();
  bindPlannedActions();
}

// Ensure Planejados modal open/close handlers exist exactly once
if (!window.plannedHandlersInit) {
  openPlannedBtn.onclick = () => {
    plannedModal.classList.remove('hidden');
    renderPlannedModal();         // Atualiza sempre ao abrir
    updateModalOpenState();
  };
  closePlannedModal.onclick = () => { plannedModal.classList.add('hidden'); updateModalOpenState(); };
  plannedModal.onclick = e => { if (e.target === plannedModal) { plannedModal.classList.add('hidden'); updateModalOpenState(); } };
  window.plannedHandlersInit = true;
}
// Initialize swipe for operations (op-line)
initSwipe(document.body, '.swipe-wrapper', '.swipe-actions', '.op-line', 'opsSwipeInit');
// Initialize swipe for card list (card-line)
initSwipe(cardList,      '.swipe-wrapper', '.swipe-actions', '.card-line', 'cardsSwipeInit');
// Initialize swipe for invoice headers (summary)
initSwipe(document.body, '.swipe-wrapper', '.swipe-actions', '.invoice-header-line', 'invoiceSwipeInit');
async function hardRepairApp(){
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(()=>{})));
    }
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k).catch(()=>{})));
  } catch (_) {}
  try { location.reload(); } catch (_) {}
}
