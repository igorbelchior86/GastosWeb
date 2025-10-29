import { fmtCurrency, fmtNumber, parseCurrency, escHtml } from './utils/format.js';
import { normalizeStartBalance } from './utils/startBalance.js';
import { formatToISO as utilFormatToISO,todayISO as utilTodayISO,addYearsIso as utilAddYearsIso,isSameDayOfMonth as utilIsSameDayOfMonth,occursOn as utilOccursOn,postDateForCard } from './utils/date.js';
import { initTxUtils } from './ui/transactionUtils.js';
import { setupInvoiceHandlers,openPayInvoiceModal as openPayInvoiceModalMod,addTx as addTxMod, setupPaidStatusControl } from './ui/transactionModal.js';
import { DEFAULT_PROFILE,LEGACY_PROFILE_ID,PROFILE_DATA_KEYS,PROFILE_CACHE_KEYS,getRuntimeProfile,getCurrencyName,getCurrentProfileId,scopedCacheKey,scopedDbSegment } from './utils/profile.js';
import { cacheGet, cacheSet, cacheRemove, cacheClearProfile } from './utils/cache.js';
import { appState,setStartBalance,setStartDate,setStartSet,setBootHydrated,setTransactions,getTransactions,setCards,getCards,subscribeState,setMonthlyTotals,setBudgetsByTag } from './state/appState.js';

import { resetHydration as hydrationReset,registerHydrationTarget as hydrationRegisterTarget,markHydrationTargetReady as hydrationTargetReady,completeHydration as hydrationComplete,isHydrating as hydrationIsInProgress,maybeCompleteHydration as hydrationMaybeComplete } from './ui/hydration.js';

import { refreshMethods as cardRefreshMethods,renderCardList as cardRenderList } from './ui/cards.js';
import { setupSettings } from './ui/settings.js';

import { createYearSelector } from './ui/yearSelector.js';
import { initKeyboardAndScrollHandlers } from './ui/keyboard.js';

import { initStickyHeader } from './ui/stickyHeader.js';
import { initTransactionLine } from './ui/transactionLine.js';

import { initSwipe as initSwipeMod } from './utils/swipe.js';
import { scrollTodayIntoView as scrollTodayIntoViewMod } from './ui/scroll.js';
import { hydrateCache as hydrateCacheMod } from './utils/hydrateCache.js';
import { setupServiceWorker } from './utils/serviceWorker.js';
import { flushQueue as fbFlushQueue } from './services/firebaseService.js';
import { setupPlannedModal } from './ui/plannedModal.js';
import { setupRecurrenceHandlers } from './ui/recurrenceHandlers.js';
import { runBootstrap } from './ui/bootstrap.js';
import { setupEditTransaction } from './ui/editTransaction.js';
import { setupTransactionForm } from './ui/transactionForm.js';
import { renderCardSelectorHelper } from './ui/transactionForm.js';
import { initAccordion } from './ui/accordion.js';
import { setupBudgetAutocomplete } from './ui/budgetAutocomplete.js';
import { setupBudgetHistory } from './ui/budgetHistory.js';
import { setupBudgetPanorama } from './ui/budgetPanorama.js';
import { initOfflineQueue } from './utils/offlineQueue.js';
import { initTransactionSanitize } from './utils/transactionSanitize.js';
import { resetTxModal as resetTxModalMod,updateModalOpenState as updateModalOpenStateMod,focusValueField as focusValueFieldMod } from './ui/txModalUtils.js';
import { applyCurrencyProfile as applyCurrencyProfileMod } from './utils/currencyProfile.js';
import { initThemeFromStorage } from './utils/theme.js';
import { hydratePreferences } from './utils/preferenceHydration.js';
import { initIOSDebug } from './utils/iosDebug.js';
import { loadBudgets, saveBudgets, findActiveByTag, resetBudgetCache, getBudgetStorageKey, reconcileBudgetsWithRemote } from './services/budgetStorage.js';
import { upsertBudgetFromTransaction } from './services/budgetManager.js';
import { getReservedTotalForDate as calculateReservedTotal, spentNoPeriodo as calculateSpentNoPeriodo, refreshBudgetCache, recomputeBudget } from './services/budgetCalculations.js';
import { closeExpiredBudgets, initDayChangeWatcher, ensureRecurringBudgets } from './services/budgetLifecycle.js';
import { extractFirstHashtag } from './utils/tag.js';
import { isBudgetsEnabled, isPanoramaEnabled, getFeatureFlagsApi } from './config/features.js';
import { computeDailyBalances as computeDailyBalancesHelper } from './utils/dailyBalances.js';
import { generateBudgetMaterializationTransactions, rebuildMaterializationCache } from './services/budgetMaterialization.js';
import { injectBudgetMaterializationTransactions } from './utils/materializationInjector.js';

//
import { setupMainEventHandlers } from './uiEventHandlers.js';
import { createOpenEditFlow } from './editFlowHelper.js';

//
import { showToast as showToastHelper,buildSaveToast as buildSaveToastHelper,syncStartInputFromState as syncStartInputFromStateHelper,createPerformResetAllData,createFloatingResetButton,createTogglePlanned,createShowCardModal,createHideCardModal,createRefreshMethods,createRenderCardList,createSafeRenderTable,groupTransactionsByMonth as groupTransactionsByMonthHelper,createAnimateWrapperScroll } from './main_helpers.js';
import { safeFmtCurrency as _safeFmtCurrency,safeFmtNumber as _safeFmtNumber,safeParseCurrency as _safeParseCurrency } from './utils/safeFormat.js';

import { normalizeTransactionRecord as _normalizeTransactionRecord,ensureCashCard as _ensureCashCard } from './utils/txRecord.js';
import { createStartRealtime } from './startRealtimeHelper.js';

import { askMoveToToday as askMoveToTodayMod,askConfirmLogout as askConfirmLogoutMod,askConfirmReset as askConfirmResetMod,scheduleAfterKeyboard as scheduleAfterKeyboardMod,flushKeyboardDeferredTasks as flushKeyboardDeferredTasksMod } from './ui/modalHelpers.js';

const state = appState;
const featureFlags = getFeatureFlagsApi();

try {
  const globalApi = (window.__gastos = window.__gastos || {});
  globalApi.state = state;
  if (!globalApi.featureFlags) {
    globalApi.featureFlags = featureFlags;
  }
} catch (_) {}

let startInputRef=null,reopenPlannedAfterEdit=false;
const sameId = (a, b) => String(a ?? '') === String(b ?? '');

const safeFmtCurrency   = _safeFmtCurrency;
const safeFmtNumber     = _safeFmtNumber;
const safeParseCurrency = _safeParseCurrency;
const normalizeTransactionRecord = _normalizeTransactionRecord;
const ensureCashCard    = _ensureCashCard;
const scheduleAfterKeyboard = scheduleAfterKeyboardMod;
const flushKeyboardDeferredTasks = flushKeyboardDeferredTasksMod;
const askMoveToToday    = askMoveToTodayMod;
const askConfirmLogout  = askConfirmLogoutMod;
const askConfirmReset   = askConfirmResetMod;
let budgetHistory = null;
let panorama = null;

const resetTxModal       = resetTxModalMod;
const updateModalOpenState = updateModalOpenStateMod;
const focusValueField    = focusValueFieldMod;

let updatePendingBadge,markDirty,scheduleBgSync,tryFlushWithBackoff,queueTx,flushQueue;

const initSwipe = initSwipeMod;
const scrollTodayIntoView = scrollTodayIntoViewMod;

function emitTelemetry(eventName, payload = {}) {
  try {
    window.__gastos?.telemetry?.emit?.(eventName, payload);
  } catch (_) {}
}

function getReservedTotalForDateStub(dateISO) {
  const txs = typeof getTransactions === 'function' ? getTransactions() : transactions || [];
  try {
    return calculateReservedTotal(dateISO || todayISO(), txs);
  } catch (_) {
    return 0;
  }
}

function computeMonthlyTotals(transactionsList = (typeof getTransactions === 'function' ? getTransactions() : transactions) || []) {
  const map = {};
  (transactionsList || []).forEach((tx) => {
    if (!tx || tx.planned) return;
    const key = (tx.opDate || '').slice(0, 7);
    if (!key) return;
    if (!map[key]) map[key] = { income: 0, expense: 0 };
    const val = Number(tx.val) || 0;
    if (val > 0) map[key].income += val;
    else map[key].expense += Math.abs(val);
  });
  try { setMonthlyTotals(map, { emit: true }); } catch (err) { console.warn('setMonthlyTotals failed', err); }
  return map;
}

function rebuildBudgetsByTag(transactionsList = (typeof getTransactions === 'function' ? getTransactions() : transactions) || []) {
  try {
    const budgets = (loadBudgets() || []).filter((b) => b && b.status === 'active');
    const index = {};
    budgets.forEach((budget) => {
      if (!budget || !budget.tag) return;
      const normalized = recomputeBudget ? (recomputeBudget({ ...budget }, transactionsList) || budget) : budget;
      index[budget.tag] = normalized;
    });
    setBudgetsByTag(index, { emit: true });
    return index;
  } catch (err) {
    console.warn('rebuildBudgetsByTag failed', err);
    return {};
  }
}

function maybeRefreshBudgetsCache(candidateTxs) {
  if (!isBudgetsEnabled()) return;
  const list = Array.isArray(candidateTxs)
    ? candidateTxs
    : (typeof getTransactions === 'function' ? getTransactions() : transactions || []);
  try {
    refreshBudgetCache(list);
  } catch (err) {
    console.warn('refreshBudgetCache failed', err);
  }
  try { rebuildBudgetsByTag(list); } catch (_) {}
}

function runDailyBudgetMaintenance() {
  if (!isBudgetsEnabled()) return;
  const txs = typeof getTransactions === 'function' ? getTransactions() : transactions || [];
  try { refreshBudgetCache(txs); } catch (_) {}
  try { rebuildBudgetsByTag(txs); } catch (_) {}
  // Ensure budgets are persisted to remote so other devices stay in sync
  try { saveBudgets(loadBudgets()); } catch (_) {}
  // Materialize today's recurring cycle budgets so reservations work off persisted data
  try {
    const { created } = ensureRecurringBudgets(txs, todayISO());
    if (created > 0) {
      try { refreshBudgetCache(txs); } catch (_) {}
      try { rebuildBudgetsByTag(txs); } catch (_) {}
    }
  } catch (err) { console.warn('ensureRecurringBudgets failed', err); }
  try {
    const { closed } = closeExpiredBudgets(txs, todayISO());
    if (closed > 0) {
      try { renderTable(); } catch (_) {}
    }
  } catch (err) {
    console.warn('closeExpiredBudgets failed', err);
  }
  try { computeMonthlyTotals(txs); } catch (_) {}
}

function normalizeISODate(input){if(!input)return null;if(input instanceof Date)return input.toISOString().slice(0,10);const str=String(input).trim();if(!str)return null;const match=str.match(/^(\d{4}-\d{2}-\d{2})/);return match?match[1]:null;}


function registerHydrationTarget(k,e){hydrationRegisterTarget(k,e);}function markHydrationTargetReady(k){hydrationTargetReady(k);}function maybeCompleteHydration(){hydrationMaybeComplete();}function completeHydration(){hydrationComplete();}function isHydrating(){return hydrationIsInProgress();}

hydrationReset();

const INITIAL_CASH_CARD = { name: 'Dinheiro', close: 0, due: 0 };
let transactions = [];
let cards = [INITIAL_CASH_CARD];
const USE_MOCK = false;

let VIEW_YEAR = new Date().getFullYear();

const formatToISO = utilFormatToISO;
const todayISO    = utilTodayISO;
const addYearsIso = utilAddYearsIso;
const isSameDayOfMonth = utilIsSameDayOfMonth;
const occursOn    = (tx, iso) => utilOccursOn(tx, iso);
const post        = (iso, m) => postDateForCard(iso, m, cards);

try { window.todayISO = todayISO; } catch (_) {}

const { sortTransactions, sanitizeTransactions, recomputePostDates } =
  initTransactionSanitize({ getTransactions, setTransactions, cards, post, todayISO });

const yearSelectorApi = createYearSelector({
  getViewYear: () => VIEW_YEAR,
  setViewYear: (year) => {
    VIEW_YEAR = year;
    if (window.__gastos) window.__gastos.VIEW_YEAR = year;
  },
  getTransactions: () => {
    try { return getTransactions ? getTransactions() : transactions; }
    catch { return transactions; }
  },
  renderTable: () => {
    try { return renderTable(); } catch (_) {}
  }
});

let pendingDeleteTxId=null,pendingDeleteTxIso=null,pendingEditTxId=null,pendingEditTxIso=null,pendingEditMode=null;

let profileListeners=[];
let startRealtimeFn=null;

function cleanupProfileListeners() {
  if (!profileListeners || !profileListeners.length) return;
  profileListeners.forEach(unsub => {
    try { typeof unsub === 'function' && unsub(); }
    catch (err) { console.warn('Listener cleanup failed', err); }
  });
  profileListeners = [];
}


function profileRef(key) {
  if (!firebaseDb || !PATH) return null;
  const segment = scopedDbSegment(key);
  return ref(firebaseDb, `${PATH}/${segment}`);
}


function hydrateStateFromCache(options = {}) {
  return hydrateCacheMod(options);
}

const deleteRecurrenceModal=document.getElementById('deleteRecurrenceModal'),closeDeleteRecurrenceModal=document.getElementById('closeDeleteRecurrenceModal'),deleteSingleBtn=document.getElementById('deleteSingleBtn'),deleteFutureBtn=document.getElementById('deleteFutureBtn'),deleteAllBtn=document.getElementById('deleteAllBtn'),cancelDeleteRecurrence=document.getElementById('cancelDeleteRecurrence'),editRecurrenceModal=document.getElementById('editRecurrenceModal'),closeEditRecurrenceModal=document.getElementById('closeEditRecurrenceModal'),editSingleBtn=document.getElementById('editSingleBtn'),editFutureBtn=document.getElementById('editFutureBtn'),editAllBtn=document.getElementById('editAllBtn'),cancelEditRecurrence=document.getElementById('cancelEditRecurrence'),confirmMoveModal=document.getElementById('confirmMoveModal'),confirmMoveYes=document.getElementById('confirmMoveYes'),confirmMoveNo=document.getElementById('confirmMoveNo'),closeConfirmMove=document.getElementById('closeConfirmMove'),confirmMoveText=document.getElementById('confirmMoveText'),confirmLogoutModal=document.getElementById('confirmLogoutModal'),confirmLogoutYes=document.getElementById('confirmLogoutYes'),confirmLogoutNo=document.getElementById('confirmLogoutNo'),closeConfirmLogout=document.getElementById('closeConfirmLogout'),confirmLogoutText=document.getElementById('confirmLogoutText'),settingsModalEl=document.getElementById('settingsModal'),toggleThemeBtn=document.getElementById('toggleThemeBtn');
if (toggleThemeBtn) {
  toggleThemeBtn.onclick = () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    html.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
  };
}
const closeSettingsModalBtn = document.getElementById('closeSettingsModal');

const settingsApi = setupSettings(settingsModalEl);

let isPayInvoiceMode=false,pendingInvoiceCtx=null;

const openPlannedBtn=document.getElementById('openPlannedBtn'),plannedModal=document.getElementById('plannedModal'),closePlannedModal=document.getElementById('closePlannedModal'),plannedList=document.getElementById('plannedList'),headerSeg=document.querySelector('.header-seg');

/**
 * Close ALL open modals (pseudo-footer priority: these 3 buttons take precedence)
 */
function closeAllModals() {
  console.log('[main.js] closeAllModals() called');
  const modals = [
    'txModal',
    'cardModal',
    'plannedModal',
    'settingsModal',
    'yearModal',
    'panoramaModal',
    'currencyProfileModal',
    'deleteRecurrenceModal',
    'editRecurrenceModal',
    'confirmMoveModal',
    'confirmLogoutModal',
    'confirmResetModal'
  ];
  modals.forEach(id => {
    const modal = document.getElementById(id);
    if (modal && !modal.classList.contains('hidden')) {
      console.log(`[main.js] Closing modal: ${id}`);
      modal.classList.add('hidden');
    }
  });
  updateModalOpenState && updateModalOpenState();
}

function renderSettingsModal() {
  return settingsApi.renderSettings();
}
function openSettings() {
  settingsApi.openSettings();
}
function closeSettings() {
  settingsApi.closeSettings();
}
// Settings modal interactions are wired up in uiEventHandlers.js
try { document.addEventListener('auth:state', () => { settingsApi.renderSettings(); }); } catch(_) {}

const yearSelector=document.getElementById('yearSelector'),yearModal=document.getElementById('yearModal'),closeYearModalBtn=document.getElementById('closeYearModal');
// Year selector modal interactions are wired up in uiEventHandlers.js

// Button that scrolls the view to today.
const homeBtn=document.getElementById('scrollTodayBtn'),bottomPill=document.querySelector('.floating-pill');

function fixPlannedAlignment(){} const WDAY_LONG={}; function expandPlannedDayLabels(){}

const plannedBox = plannedModal ? plannedModal.querySelector('.bottom-modal-box') : null;

// Initialize user preferences (theme, currency profile) early to avoid flashing
// This synchronously applies preferences from storage, preventing UI flicker
initThemeFromStorage(); // Legacy init for immediate theme (no await)
// hydratePreferences will be called later with Firebase config when available

/**
 * Apply a currency/profile by id.
 * - sets window.APP_PROFILE
 * - creates window.APP_FMT Intl.NumberFormat for currency
 * - persists choice to localStorage
 * - toggles UI bits controlled by profile.features (e.g., invoice parcel)
 */
function applyCurrencyProfile(profileId, options = {}) {
  return applyCurrencyProfileMod(profileId, options);
}

try{
  const savedProfile = localStorage.getItem('ui:profile') || (window.CURRENCY_PROFILES ? Object.keys(window.CURRENCY_PROFILES)[0] : null);
  if (savedProfile) applyCurrencyProfile(savedProfile);
}catch(e){}



//
import { setupIdbCache } from './idbHelper.js';
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

import { firebaseConfig } from './config/firebaseConfig.js';
import { AuthService } from './services/authService.js';

import { FirebaseService as FirebaseSvc } from './services/firebaseService.js';

try {
  FirebaseSvc.setMockMode(Boolean(USE_MOCK));
  if (!USE_MOCK && typeof FirebaseSvc.init === 'function') {
    FirebaseSvc.init(firebaseConfig).catch(err => { console.warn('FirebaseSvc.init failed', err); });
  }
} catch (e) { /* ignore init errors for now */ }

// Initialize user preferences early (with Firebase config)
// This applies theme and currency profile from storage, preventing UI flashes
// NOTE: Must be called AFTER Firebase initialization but we defer the actual sync
// The hydration will override the default profile if a preference was saved
async function initPreferencesAfterFirebase() {
  try {
    await hydratePreferences(firebaseConfig);
  } catch (err) {
    console.warn('Preference hydration failed:', err);
  }
}
// Call immediately without await - let it run async
initPreferencesAfterFirebase();

// AuthService is now initialized in globals.js to ensure it's ready before login.view.js loads
try {
  // Only initialize if not already done (globals.js should have done it)
  if (!AuthService.getCurrentUser && !window.Auth) {
    AuthService.init(firebaseConfig).catch(err => {
      console.warn('AuthService.init failed', err);
    });
  }
} catch (e) {
  /* ignore */
}


//
const { idbGet, idbSet, idbRemove } = await setupIdbCache();

/**
 * Initialize swipe-to-reveal actions on elements.
 * @param {ParentNode} root       Root element to listen on (e.g., document or specific container).
 * @param {string} wrapperSel     Selector for swipe wrapper (e.g., '.swipe-wrapper').
 * @param {string} actionsSel     Selector for swipe actions (e.g., '.swipe-actions').
 * @param {string} lineSel        Selector for the line to translate (e.g., '.op-line' or '.card-line').
 * @param {boolean} onceFlag      Name of global flag to prevent multiple inits.
 */

document.addEventListener('click', (e) => {
  const sum = e.target.closest('.invoice-header-line');
  if (!sum) return;
  const det = sum.closest('details.invoice');
  if (det && det.dataset.swiping === '1') {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

initIOSDebug(firebaseConfig);

let PATH;
const WID_CASA = 'orcamento365_9b8e04c5';
const CASA_EMAILS = ['icmbelchior@gmail.com','sarargjesus@gmail.com'];
function resolvePathForUser(user){
  if (!user) return null;
  const email = (user.email || '').toLowerCase();
  if (CASA_EMAILS.includes(email)) {
    return WID_CASA;
  }
  const personalPath = `users/${user.uid}`;
  return personalPath;
}

const APP_VERSION = 'v1.5.0(c09)';

const METRICS_ENABLED = true;
const _bootT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
function logMetric(name, payload) {
  try {
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
window.addEventListener('load', () => {
  const now = (performance && performance.now) ? performance.now() : Date.now();
  logMetric('boot', { firstPaint_ms: Math.round(now - _bootT0) });
});
let save, load;
let firebaseDb;

if (!USE_MOCK) {
  const cfg = firebaseConfig;
  const app  = (getApps().length ? getApp() : initializeApp(cfg));
  const db   = getDatabase(app);
  firebaseDb = db;



  save = async (k, v) => {
    if (!navigator.onLine) {
      markDirty(k);
      if (k === 'tx') cacheSet('tx', v);
      if (k === 'cards') cacheSet('cards', v);
      if (k === 'startBal') cacheSet('startBal', v);
      if (k === 'startSet') cacheSet('startSet', v);
      if (k === 'budgets') cacheSet('budgets', v);
      return; // no remote write while offline
    }
    const remoteKey = scopedDbSegment(k);
    return set(ref(db, `${PATH}/${remoteKey}`), v);
  };
  load = async (k, d) => {
    const remoteKey = scopedDbSegment(k);
    const s = await get(ref(db, `${PATH}/${remoteKey}`));
    return s.exists() ? s.val() : d;
  };
} else {
  PATH = 'mock_365';
  try { FirebaseSvc.setPath(PATH); } catch (_) {}
  save = (k, v) => {
    const scoped = scopedCacheKey(k);
    localStorage.setItem(`${PATH}_${scoped}`, JSON.stringify(v));
  };
  load = async (k, d) => {
    const scoped = scopedCacheKey(k);
    const raw = localStorage.getItem(`${PATH}_${scoped}`);
    if (raw != null) return JSON.parse(raw);
    return d;
  };
}





setStartBalance(null);
setStartDate(null);
setStartSet(false);
setBootHydrated(false);
const $=id=>document.getElementById(id);
const tbody=document.querySelector('#dailyTable tbody'),wrapperEl=document.querySelector('.wrapper'),headerEl=document.querySelector('.app-header'),txModalTitle=document.querySelector('#txModal h2');let wrapperScrollAnimation=null,wrapperScrollTop=0,wrapperTodayAnchor=null,stickyMonthVisible=false,stickyMonthLabel='',stickyHeightGuess=52;

let recalculateHeaderOffset = () => {}; // default no-op
try {
  const stickyHeaderAPI = initStickyHeader({
    wrapperEl,
    headerEl,
    getViewYear: () => VIEW_YEAR,
    scheduleAfterKeyboard,
  });
  if (stickyHeaderAPI && typeof stickyHeaderAPI.recalculateHeaderOffset === 'function') {
    recalculateHeaderOffset = stickyHeaderAPI.recalculateHeaderOffset;
  }
} catch (_) {}



const showToast = (...args) => showToastHelper(...args);

const buildSaveToast = (tx) => buildSaveToastHelper(tx, {
  safeFmtCurrency,
  post: (iso, method) => post(iso, method),
  todayISO,
  documentRef: document
});

// Replace the inline syncStartInputFromState with a helper call. By binding
// state, inputRef and formatting functions here we avoid referring directly to
// module‑scoped variables within the helper.
const syncStartInputFromState = () =>
  syncStartInputFromStateHelper({ state, inputRef: startInputRef, safeFmtCurrency, documentRef: document });

// Create placeholders for functions that will be bound using helper factories.
// They are declared as 'let' so that they can be reassigned later once the
// relevant DOM elements and state have been initialised.
let refreshMethods = () => {};
let renderCardList = () => {};
let showCardModal = () => {};
let hideCardModal = () => {};
let togglePlanned = async () => {};
let performResetAllData = async () => {};
const renderPlannedModal = () => window.__gastos?.renderPlannedModal?.();
// Provide a safe table renderer that automatically retries on failure.
const safeRenderTable = createSafeRenderTable({ renderTable, showToast });

// Use the helper for grouping transactions by month. We wrap it in a function
// to supply dynamic dependencies such as the post date calculator.
const groupTransactionsByMonth = () =>
  groupTransactionsByMonthHelper({
    sortTransactions,
    getTransactions,
    transactions,
    post: (iso, method) => post(iso, method),
  });

// Placeholder for animateWrapperScroll, initialised to a no‑op. It will be
// rebound later with the proper scrolling context.
let animateWrapperScroll = (targetTop) => {
  if (!wrapperEl) return;
  if (wrapperScrollAnimation) return;
  wrapperEl.scrollTop = targetTop;
  wrapperTodayAnchor = targetTop;
};

// Placeholder for openEditFlow. The real implementation will be bound
// via createOpenEditFlow later in the startup sequence.
let openEditFlow;


if (!USE_MOCK) {
  // Build the realtime listener using a helper. The returned function encapsulates
  // the complex logic for subscribing to Firebase database changes and updating
  // local state. It receives accessors and mutators for mutable values such as
  // PATH, transactions and cards so that updates inside the helper reflect back
  // into this module.
  const startRealtime = createStartRealtime({
    getPath: () => PATH,
    setPath: (val) => { PATH = val; },
    cleanupProfileListeners,
    resetHydration: hydrationReset,
    firebaseDb,
    ref,
    get,
    scopedDbSegment,
    profileRef,
    registerHydrationTarget,
    hydrateStateFromCache,
    maybeCompleteHydration,
    subscribeState,
    getTransactions,
    setTransactions,
    transactionsRef: {
      get: () => transactions,
      set: (val) => { transactions = val; }
    },
    getCards: () => {
      try { return getCards(); } catch (_) { return cards; }
    },
    setCards,
    cardsRef: {
      get: () => cards,
      set: (val) => { cards = val; }
    },
    state,
    normalizeTransactionRecord,
    cacheGet,
    cacheSet,
    onValue,
    sanitizeTransactions,
    recomputePostDates,
    save,
    sortTransactions,
    renderTable,
    plannedModal,
    renderPlannedModal,
    fixPlannedAlignment,
    expandPlannedDayLabels,
    markHydrationTargetReady,
    setStartBalance,
    setStartDate,
    normalizeISODate,
    refreshMethodsFn: () => refreshMethods(),
    renderCardListFn: () => renderCardList(),
    initStart,
    load,
    completeHydration,
    recalculateHeaderOffset,
    syncStartInputFromState,
    ensureStartSetFromBalance,
    profileListenersRef: {
      get: () => profileListeners,
      set: (val) => { profileListeners = val; }
    },
    // budgets sync
    loadBudgets,
    saveBudgets,
    refreshBudgetCache,
    rebuildBudgetsByTag,
    // budget materialization
    rebuildMaterializationCache,
  });
  startRealtimeFn = startRealtime;

  const readyUser = (window.Auth && window.Auth.currentUser) ? window.Auth.currentUser : null;
  if (readyUser) { 
    PATH = resolvePathForUser(readyUser); 
    try { FirebaseSvc.setPath(PATH); } catch(_) {}
    startRealtimeFn && startRealtimeFn(); 
    setTimeout(() => { 
      try { 
        if (typeof recalculateHeaderOffset === 'function') recalculateHeaderOffset(); 
      } catch (_) {} 
    }, 100);
  } else {
    const h = (e) => {
      const u = e.detail && e.detail.user;
      if (u) { 
        document.removeEventListener('auth:state', h); 
        PATH = resolvePathForUser(u); 
        try { FirebaseSvc.setPath(PATH); } catch(_) {}
        startRealtimeFn && startRealtimeFn(); 
        setTimeout(() => { 
          try { 
            if (typeof recalculateHeaderOffset === 'function') recalculateHeaderOffset(); 
          } catch (_) {} 
        }, 100);
      } else {
        PATH = null;
        try { FirebaseSvc.setPath(null); } catch(_) {}
      }
    };
    document.addEventListener('auth:state', h);
  }
} else {
  hydrationReset();
  const [liveTx, liveCards, liveBal] = await Promise.all([
    load('tx', []),
    load('cards', cards),
    load('startBal', state.startBalance)
  ]);

  const hasLiveTx    = Array.isArray(liveTx)    ? liveTx.length    > 0 : liveTx    && Object.keys(liveTx).length    > 0;
  const hasLiveCards = Array.isArray(liveCards) ? liveCards.length > 0 : liveCards && Object.keys(liveCards).length > 0;

  const fixedTx = Array.isArray(liveTx) ? liveTx : Object.values(liveTx || {});

  setTransactions(cacheGet('tx', []));
  transactions = getTransactions();
  setCards(cacheGet('cards', [{name:'Dinheiro',close:0,due:0}]));
  try { cards = getCards(); } catch (_) { cards = cacheGet('cards', [{name:'Dinheiro',close:0,due:0}]); }
  // Ensure window.__gastos.cards is synchronized with local cards array
  window.__gastos.cards = cards;
  setStartBalance(cacheGet('startBal', null));
  setStartDate(normalizeISODate(cacheGet('startDate', null)));
  if (state.startDate == null && (state.startBalance === 0 || state.startBalance === '0')) {
    setStartBalance(null, { emit: false });
    try { cacheSet('startBal', null); } catch (_) {}
  }

  if (hasLiveTx && JSON.stringify(fixedTx) !== JSON.stringify(cacheGet('tx', []))) {
  setTransactions(fixedTx);
  transactions = getTransactions();
    cacheSet('tx', fixedTx);
    renderTable();
  }
  if (hasLiveCards && JSON.stringify(liveCards) !== JSON.stringify(cards)) {
    const updatedCards = Array.isArray(liveCards) ? liveCards : Object.values(liveCards || {});
    if (!updatedCards.some(c => c && c.name === 'Dinheiro')) updatedCards.unshift({ name:'Dinheiro', close:0, due:0 });
  setCards(updatedCards);
  try { cards = getCards(); } catch (_) { cards = updatedCards; }
    cacheSet('cards', updatedCards);
    refreshMethods(); renderCardList(); renderTable();
  }
  const nextStartBal = normalizeStartBalance(liveBal);
  const currentStartBal = normalizeStartBalance(state.startBalance);
  if (nextStartBal !== currentStartBal) {
    setStartBalance(nextStartBal, { emit: false });
    cacheSet('startBal', state.startBalance);
    initStart(); renderTable();
  }
  try { computeMonthlyTotals(transactions); rebuildBudgetsByTag(transactions); } catch (_) {}

  // Initialize budget materialization cache after hydration
  try { rebuildMaterializationCache(transactions); } catch (_) {}

  completeHydration();
}
const openTxBtn = document.getElementById('openTxModal');
const txModal   = document.getElementById('txModal');
const closeTxModal = document.getElementById('closeTxModal');

/**
 * Reset the fields and state of the transaction modal.
 */

/**
 * Toggle the visibility of the transaction modal.
 */
function toggleTxModal(){
  // Block opening transaction modal if start balance not set
  const isOpening=txModal.classList.contains('hidden');
  if(isOpening){
    // LÓGICA SIMPLES: Se saldo inicial visível, modal lançar operação OFF
    // Verifica se a caixa de saldo inicial está visível
    const startContainer = document.getElementById('startGroup') || document.querySelector('.start-container');
    const isStartVisible = startContainer && startContainer.style.display !== 'none';
    
    if(isStartVisible){
      showToast('Configure o Saldo inicial primeiro', 'warning');
      return;
    }
    
    if(typeof window!=='undefined'&&typeof window.__unlockKeyboardGap==='function'){
      try{window.__unlockKeyboardGap();}catch(_){}
    }
    // Only reset modal if not in editing mode
    const g = window.__gastos;
    if(!isEditing && !g?.isEditing){resetTxModal();}
  }
  txModal.classList.toggle('hidden');
  if(openTxBtn)openTxBtn.style.transform=isOpening?'rotate(45deg)':'rotate(0deg)';
  const g = window.__gastos;
  // Removed automatic focus to prevent viewport/keyboard issues on mobile
  // if(isOpening && !isEditing && !g?.isEditing)focusValueField();
  
  // Update modal state with iOS scroll fix
  if(!isOpening){
    updateModalOpenState();
    // Simple iOS Safari scroll unlock gambiarra
    if(/iPhone|iPad|iPod/i.test(navigator.userAgent)){
      setTimeout(() => {
        const wrapper = document.querySelector('.wrapper');
        if(wrapper && wrapper.scrollTop !== undefined){
          // Micro nudge to wake up Safari scroll system
          const scroll = wrapper.scrollTop;
          wrapper.scrollTo(0, scroll + 0.1);
          wrapper.scrollTo(0, scroll);
        }
      }, 50);
    }
    isEditing=null;
    pendingEditMode=null;
    pendingEditTxId=null;
    pendingEditTxIso=null;
    if(typeof window!=='undefined'&&typeof window.__unlockKeyboardGap==='function'){
      try{window.__unlockKeyboardGap();}catch(_){}
    }
    try { resetTxModal(); } catch (_) {}
  } else {
    updateModalOpenState();
  }
}


if(openTxBtn)openTxBtn.onclick=()=>{
  isEditing=null;pendingEditMode=null;pendingEditTxId=null;pendingEditTxIso=null;
  if(txModal&&txModal.classList.contains('hidden')){resetTxModal();}
  toggleTxModal();
  // Removed automatic focus - user will tap the field when ready
};

if(closeTxModal)closeTxModal.onclick=toggleTxModal;if(txModal)txModal.onclick=e=>{if(e.target===txModal)toggleTxModal();};
// Bottom pill navigation and scroll/home/settings interactions are wired up in uiEventHandlers.js

// Settings modal interactions are wired up via uiEventHandlers.js

const currency=v=>safeFmtCurrency(v),meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],SALARY_WORDS=['salário','salario','provento','rendimento','pagamento','paycheck','salary'],mobile=()=>window.innerWidth<=480,fmt=d=>{const date=d instanceof Date?d:new Date(d);return date.toLocaleDateString('pt-BR',mobile()?{day:'2-digit',month:'2-digit'}:{day:'2-digit',month:'2-digit',year:'numeric'});};





const desc=$('desc'),val=$('value'),met=$('method'),date=$('opDate'),addBtn=$('addBtn');
if(addBtn&&!addBtn.dataset.toastSaveHook){
  addBtn.dataset.toastSaveHook='1';
  addBtn.addEventListener('click',()=>{
    const label=(addBtn.textContent||'').toLowerCase();
    if(!label.includes('adicion'))return;
    setTimeout(()=>{
      // Only show auto-save toast if addTx actually succeeded and modal closed
      try { if(!(window.__gastos && window.__gastos.__lastAddSucceeded)) return; } catch(_) { return; }
      try { if (txModal && !txModal.classList.contains('hidden')) return; } catch(_) {}
      try { window.__gastos.__lastAddSucceeded = false; } catch(_) {}
      if(!Array.isArray(transactions)||!transactions.length)return;
      let latest=null;for(const t of transactions){if(!latest||(t.ts||'')>(latest.ts||''))latest=t;}
      if(!latest)return;
      try{showToast(buildSaveToast(latest),'success');}catch(_){}}
    ,0);
  },{capture:true});
}
try {
  setupTransactionForm({
    valueInput: val,
    valueToggleButtons: document.querySelectorAll('.value-toggle button'),
    methodButtons: document.querySelectorAll('.switch-option'),
    hiddenSelect: document.getElementById('method'),
    cards,
    safeFmtNumber,
    safeFmtCurrency,
  });
  setupBudgetAutocomplete({ txModal, descInput: desc, getTransactions, isBudgetsEnabled });
  budgetHistory = setupBudgetHistory({ txModal, getTransactions, isBudgetsEnabled, findActiveBudgetByTag });
} catch (_) {}

const recurrence=$('recurrence'),parcelasBlock=$('parcelasBlock'),installments=$('installments'),invoiceParcelCheckbox=document.getElementById('invoiceParcel'),invoiceParcelRow=document.getElementById('invoiceParcelRow');let isEditing=null;

const notify=(msg,type='error')=>{const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.style.setProperty('--icon',type==='error'?'\u2715':'\u2713');t.classList.remove('success','error');t.classList.add(type);void t.offsetWidth;t.classList.add('show');setTimeout(()=>{t.classList.remove('show');},5000);};

let makeLine=null,addTx=null;if(typeof window!=='undefined')window.addTx=addTx;

const globalGastos = typeof window !== 'undefined'
  ? (window.__gastos = window.__gastos || {})
  : {};

Object.assign(globalGastos, {
  appVersion: APP_VERSION,
  txModal,
  toggleTxModal,
  desc,
  val,
  safeFmtNumber,
  safeFmtCurrency,
  safeParseCurrency,
  date,
  hiddenSelect: document.getElementById('method'),
  methodButtons: document.querySelectorAll('.switch-option'),
  invoiceParcelRow: document.getElementById('invoiceParcel'),
  invoiceParcelCheckbox: document.getElementById('invoiceParcel'),
  installments,
  parcelasBlock,
  recurrence,
  txModalTitle,
  addBtn,
  todayISO,
  budgetHistory,
  isEditing,
  pendingEditMode,
  pendingEditTxIso,
  pendingEditTxId,
  isPayInvoiceMode,
  pendingInvoiceCtx,
  transactions,
  getTransactions,
  setTransactions,
  addTransaction,
  sameId,
  post,
  occursOn,
  save,
  load,
  renderTable,
  safeRenderTable,
  showToast,
  notify,
  extractFirstHashtag,
  askMoveToToday,
  askConfirmLogout,
  askConfirmReset,
  plannedModal,
  openPlannedBtn,
  closePlannedModal,
  plannedList,
  updateModalOpenState,
  makeLine,
  initSwipe,
  deleteRecurrenceModal,
  closeDeleteRecurrenceModal,
  deleteSingleBtn,
  deleteFutureBtn,
  deleteAllBtn,
  cancelDeleteRecurrence,
  editRecurrenceModal,
  closeEditRecurrenceModal,
  cancelEditRecurrence,
  editSingleBtn,
  editFutureBtn,
  editAllBtn,
  pendingDeleteTxId,
  pendingDeleteTxIso,
  pendingEditTxId,
  pendingEditTxIso,
  pendingEditMode,
  reopenPlannedAfterEdit,
  removeTransaction,
  renderPlannedModal,
  renderCardSelectorHelper,
  wrapperEl,
  stickyHeightGuess,
  animateWrapperScroll,
  hydrateStateFromCache,
  performResetAllData,
  maybeRefreshBudgetsCache,
  loadBudgets,
  saveBudgets,
  findActiveByTag,
  resetBudgetCache,
  getBudgetStorageKey,
  upsertBudgetFromTransaction,
  refreshBudgetCache,
  yearSelectorApi,
  getViewYear: () => VIEW_YEAR,
  VIEW_YEAR,
  cards,
  openPayInvoiceModal,
  resetTxModal,
  resetAppStateForProfileChange,
  addTx: null,
});

if (!globalGastos.featureFlags) {
  globalGastos.featureFlags = featureFlags;
}
if (!globalGastos.getFeatureFlags) {
  globalGastos.getFeatureFlags = featureFlags.getAll;
}
if (!globalGastos.setFeatureFlag) {
  globalGastos.setFeatureFlag = () => true;
}
if (!globalGastos.clearFeatureFlags) {
  globalGastos.clearFeatureFlags = featureFlags.clearOverrides;
}
globalGastos.isBudgetsFeatureEnabled = isBudgetsEnabled;
globalGastos.isPanoramaFeatureEnabled = isPanoramaEnabled;
globalGastos.getReservedTotalForDate = getReservedTotalForDateStub;
globalGastos.loadBudgets = loadBudgets;
globalGastos.saveBudgets = saveBudgets;
globalGastos.findActiveBudgetByTag = findActiveByTag;
globalGastos.resetBudgetCache = resetBudgetCache;
globalGastos.getBudgetStorageKey = getBudgetStorageKey;
globalGastos.upsertBudgetFromTransaction = upsertBudgetFromTransaction;
globalGastos.spentNoPeriodo = calculateSpentNoPeriodo;
globalGastos.refreshBudgetCache = () => {
  const txs = typeof getTransactions === 'function' ? getTransactions() : transactions || [];
  try { refreshBudgetCache(txs); } catch (_) {}
};
globalGastos.maybeRefreshBudgetsCache = maybeRefreshBudgetsCache;

// Expor utilidades para outros módulos e garantir telemetria
if (!globalGastos.computeMonthlyTotals) {
  globalGastos.computeMonthlyTotals = (list) => {
    try { return computeMonthlyTotals(list); } catch (_) { return {}; }
  };
}
if (!globalGastos.computeDailyBalances) {
  globalGastos.computeDailyBalances = (list, sb, sd) => {
    try {
      return computeDailyBalancesHelper(
        list || transactions,
        sb ?? state.startBalance,
        sd ?? state.startDate,
        { ignoreInvoiceMeta: true, useTxByDate: true }
      );
    } catch (_) { return {}; }
  };
}
if (!globalGastos.rebuildBudgetsByTag) {
  globalGastos.rebuildBudgetsByTag = (list) => {
    try { return rebuildBudgetsByTag(list); } catch (_) { return {}; }
  };
}
if (!globalGastos.emitTelemetry) {
  globalGastos.emitTelemetry = (name, payload = {}) => {
    try { emitTelemetry(name, payload); } catch (_) {}
  };
}
if (!globalGastos.telemetry || typeof globalGastos.telemetry.emit !== 'function') {
  globalGastos.telemetry = {
    emit: (name, payload = {}) => {
      try { console.info('[telemetry]', name, payload); } catch (_) {}
    }
  };
}

window.performResetAllData = performResetAllData;
window.safeRenderTable = safeRenderTable;
window.refreshMethods = refreshMethods;
window.renderCardList = renderCardList;
window.initStart = initStart;
window.ensureStartSetFromBalance = ensureStartSetFromBalance;
window.askConfirmLogout = askConfirmLogout;
window.askConfirmReset = askConfirmReset;
window.openPayInvoiceModal = openPayInvoiceModal;
window.resetTxModal = resetTxModal;
window.resetAppStateForProfileChange = resetAppStateForProfileChange;
window.setCards = (list) => {
  const next = setCards(list);
  try {
    cards = Array.isArray(next) ? next.slice() : [];
    if (window.__gastos) window.__gastos.cards = cards.slice();
    try { refreshMethods(); } catch (_) {}
    try { renderCardList(); } catch (_) {}
  } catch (_) {}
  return next;
};
window.setTransactions = (list) => {
  const next = setTransactions(list);
  try {
    transactions = Array.isArray(next) ? next.slice() : [];
    if (window.__gastos) window.__gastos.transactions = transactions.slice();
    try { renderTable(); } catch (_) {}
    maybeRefreshBudgetsCache(transactions);
  } catch (_) {}
  return next;
};
try {
  if (window.__gastos) {
    window.__gastos.setCards = window.setCards;
    window.__gastos.setTransactions = window.setTransactions;
    window.__gastos.resetAppStateForProfileChange = resetAppStateForProfileChange;
  }
} catch (_) {}

subscribeState(({ changedKeys = [], state: snapshot } = {}) => {
  if (!snapshot) return;
  if (changedKeys.includes('cards')) {
    cards = Array.isArray(snapshot.cards) ? snapshot.cards.slice() : [];
    try { window.__gastos.cards = cards.slice(); } catch (_) {}
  }
  if (changedKeys.includes('transactions')) {
    transactions = Array.isArray(snapshot.transactions) ? snapshot.transactions.slice() : [];
    try { window.__gastos.transactions = transactions.slice(); } catch (_) {}
    maybeRefreshBudgetsCache(transactions);
  }
});

try {
  const offlineApi = initOfflineQueue({
    cacheGet,
    cacheSet,
    save,
    state,
    getTransactions,
    setTransactions,
    cards,
    renderTable,
    showToast,
    USE_MOCK
  });
  updatePendingBadge   = offlineApi.updatePendingBadge;
  markDirty            = offlineApi.markDirty;
  scheduleBgSync       = offlineApi.scheduleBgSync;
  tryFlushWithBackoff  = offlineApi.tryFlushWithBackoff;
  queueTx              = offlineApi.queueTx;
  flushQueue           = offlineApi.flushQueue;
} catch (e) { console.error('initOfflineQueue failed', e); }

setupInvoiceHandlers();
try { setupPaidStatusControl(); } catch (_) {}

setupPlannedModal();
setupRecurrenceHandlers();

setupEditTransaction();

parcelasBlock.classList.add('hidden');
installments.value = '1';
installments.disabled = true;
recurrence.onchange = () => {
  if (recurrence.value !== '') installments.value = '1';
};

function resetAppStateForProfileChange(reason = 'profile-change') {
  try {
    isEditing = null;
    pendingEditMode = null;
    pendingEditTxId = null;
    pendingEditTxIso = null;
    isPayInvoiceMode = false;
    pendingInvoiceCtx = null;

    if (window.__gastos) {
      window.__gastos.isEditing = null;
      window.__gastos.pendingEditMode = null;
      window.__gastos.pendingEditTxId = null;
      window.__gastos.pendingEditTxIso = null;
      window.__gastos.isPayInvoiceMode = false;
      window.__gastos.pendingInvoiceCtx = null;
    }

    // Reset modal immediately so new profile starts fresh
    try {
      resetTxModal();
    } catch (_) {}
    // Ensure modal title/button reflect default state before closing
    try {
      if (txModalTitle) txModalTitle.textContent = 'Lançar operação';
      const modalEl = document.getElementById('txModal');
      if (modalEl) {
        const titleEl = modalEl.querySelector('h2');
        if (titleEl) titleEl.textContent = 'Lançar operação';
      }
      if (addBtn) addBtn.textContent = 'Adicionar';
      const addButtonEl = document.getElementById('addBtn');
      if (addButtonEl) addButtonEl.textContent = 'Adicionar';
    } catch (_) {}

    const todayString = typeof todayISO === 'function' ? todayISO() : (new Date()).toISOString().slice(0, 10);
    const dateInputEl = document.getElementById('opDate');
    if (dateInputEl) dateInputEl.value = todayString;

    if (addBtn) addBtn.textContent = 'Adicionar';
    if (txModalTitle) txModalTitle.textContent = 'Lançar operação';

    if (txModal) {
      txModal.classList.add('hidden');
      if (txModal.dataset) delete txModal.dataset.mode;
    }
    updateModalOpenState();

    const valueToggleButtons = document.querySelectorAll('.value-toggle button');
    valueToggleButtons.forEach((btn) => btn.classList.remove('active'));
    const defaultToggle = Array.from(valueToggleButtons).find((btn) => btn.dataset?.type === 'expense');
    if (defaultToggle) defaultToggle.classList.add('active');

    const methodButtonsEls = document.querySelectorAll('.method-switch .switch-option');
    methodButtonsEls.forEach((btn) => btn.classList.remove('active'));
    const cashBtn = Array.from(methodButtonsEls).find((btn) => btn.dataset?.method === 'Dinheiro');
    if (cashBtn) cashBtn.classList.add('active');
    const methodSwitchEl = document.querySelector('.method-switch');
    if (methodSwitchEl) methodSwitchEl.dataset.selected = 'Dinheiro';
    const hiddenMethodEl = document.getElementById('method');
    if (hiddenMethodEl) hiddenMethodEl.value = 'Dinheiro';

    const cardSelectorEl = document.getElementById('cardSelector');
    if (cardSelectorEl) {
      cardSelectorEl.innerHTML = '';
      cardSelectorEl.hidden = true;
    }
    if (invoiceParcelRow) invoiceParcelRow.style.display = 'none';
    if (invoiceParcelCheckbox) invoiceParcelCheckbox.checked = false;
    if (parcelasBlock) parcelasBlock.classList.add('hidden');
    if (installments) {
      installments.value = '1';
      installments.disabled = true;
    }
    if (recurrence) recurrence.value = '';

    const defaultCards = [{ name: 'Dinheiro', close: 0, due: 0 }];
    try {
      if (typeof window.setTransactions === 'function') {
        window.setTransactions([]);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.warn('[profile-reset] failed to reset transactions via global setter', err);
      setTransactions([]);
    }
    try {
      if (typeof window.setCards === 'function') {
        window.setCards(defaultCards);
      } else {
        setCards(defaultCards);
      }
    } catch (err) {
      console.warn('[profile-reset] failed to reset cards via global setter', err);
      setCards(defaultCards);
    }

    cards = getCards ? getCards() : defaultCards.slice();
    transactions = getTransactions ? getTransactions() : [];

    if (window.__gastos) {
      window.__gastos.cards = cards.slice();
      window.__gastos.transactions = transactions.slice();
    }

    try {
      cacheSet('cards', cards);
      cacheSet('tx', transactions);
    } catch (_) {}

    // Reset start balance properties IN MEMORY so new profile data can load from Firebase
    // IMPORTANT: Do NOT persist null values to Firebase! That would delete existing data.
    // Just clear local state and let Firebase listeners repopulate with the correct values.
    try {
      setStartBalance(null, { emit: false });
      setStartDate(null, { emit: false });
      state.startSet = false;
      cacheSet('startBal', null);
      cacheSet('startDate', null);
      cacheSet('startSet', false);
      
      // NOTE: We do NOT call save() here because that would delete Firebase data.
      // The Firebase listeners will automatically load the correct values for the new profile.
    } catch (_) {}

    try { refreshMethods(); } catch (_) {}
    try { renderCardList(); } catch (_) {}
    try { renderTable(); } catch (_) {}
    try { initStart(); } catch (_) {}
    updateModalOpenState();
  } catch (err) {
    console.warn('resetAppStateForProfileChange failed:', err);
  }
}

if (typeof window !== 'undefined') {
  const handleProfileReset = (evt) => {
    const reason = evt && evt.type === 'profileChangeReset'
      ? `profileChangeReset:${evt.detail?.profileId || 'unknown'}`
      : 'currencyProfileChanged';
    resetAppStateForProfileChange(reason);
  };
  window.addEventListener('currencyProfileChanged', handleProfileReset);
  window.addEventListener('profileChangeReset', handleProfileReset);
}

const cardName=$('cardName'),cardClose=$('cardClose'),cardDue=$('cardDue'),addCardBtn=$('addCardBtn'),cardList=$('cardList');
const startGroup=$('startGroup'),startInput=$('startInput'),setStartBtn=$('setStartBtn'),resetBtn=$('resetData');
if (startInput) startInputRef = startInput;


function ensureStartSetFromBalance(o={}){const{persist=true,refresh=true}=o;if(state.startSet===true||state.startBalance==null||Number.isNaN(Number(state.startBalance)))return;state.startSet=true;try{cacheSet('startSet',true);}catch(_){ }if(persist&&typeof save==='function'&&PATH){Promise.resolve().then(()=>save('startSet',true)).catch(()=>{});}if(refresh){try{initStart();}catch(_){}}}


if(resetBtn){resetBtn.hidden=false;resetBtn.style.display='';resetBtn.addEventListener('click',()=>performResetAllData(true));}
if(startInput){startInput.addEventListener('input',()=>{const digits=startInput.value.replace(/\D/g,'');if(!digits){startInput.value='';return;}const numberValue=parseInt(digits,10)/100;startInput.value=safeFmtCurrency(numberValue);});}
const startContainer=document.querySelector('.start-container'),dividerSaldo=document.getElementById('dividerSaldo');



// Bind openEditFlow using the editFlow helper. The returned function
// utilises getters/setters to interact with state and DOM elements
// defined in this module. This must occur before initTransactionLine
// is called so that the transaction line helpers receive a valid
// openEditFlow implementation.
try {
  openEditFlow = createOpenEditFlow({
    transactionsRef: {
      get: () => {
        try { return getTransactions ? getTransactions() : transactions; }
        catch { return transactions; }
      },
      set: (val) => { transactions = val; }
    },
    occursOn,
    plannedModal,
    editRecurrenceModal,
    updateModalOpenState,
    reopenPlannedAfterEditRef: {
      get: () => reopenPlannedAfterEdit,
      set: (val) => { reopenPlannedAfterEdit = val; }
    },
    pendingEditModeRef: {
      get: () => pendingEditMode,
      set: (val) => { pendingEditMode = val; }
    },
    pendingEditTxIdRef: {
      get: () => pendingEditTxId,
      set: (val) => { 
        pendingEditTxId = val;
        if (window.__gastos) window.__gastos.pendingEditTxId = val;
      }
    },
    pendingEditTxIsoRef: {
      get: () => pendingEditTxIso,
      set: (val) => { 
        pendingEditTxIso = val;
        if (window.__gastos) window.__gastos.pendingEditTxIso = val;
      }
    },
    isDetachedOccurrence,
    editTx: (id) => {
      const g = typeof window !== 'undefined' ? window.__gastos : undefined;
      if (g && typeof g.editTx === 'function') {
        return g.editTx(id);
      }
    }
  });
} catch (err) {
  console.error('Failed to bind openEditFlow via editFlowHelper:', err);
}



makeLine = initTransactionLine({
  getTransactions,
  transactions,
  openEditFlow,
  delTx,
  sameId,
  occursOn,
  todayISO,
  safeFmtCurrency,
  togglePlanned: null, // Will be set after createTogglePlanned
});
window.__gastos.makeLine = makeLine;

const openCardBtn=document.getElementById('openCardModal');
const cardModal=document.getElementById('cardModal');
const closeCardModal=document.getElementById('closeCardModal');

try { runBootstrap(); } catch (e) { console.warn('runBootstrap failed to start', e); }

// After the bootstrap completes, initialise helper-based implementations for
// various routines that were previously defined inline in this file. These
// assignments rebind the placeholders declared earlier (refreshMethods,
// renderCardList, showCardModal, hideCardModal, togglePlanned,
// performResetAllData, animateWrapperScroll) to concrete implementations
// using the extracted helpers. Wrapping in a try/catch prevents errors
// here from derailing application startup.
try {
  refreshMethods = createRefreshMethods({
    cardRefreshMethods,
    met,
    cards
  });
  renderCardList = createRenderCardList({
    cardRenderList,
    cards,
    cardModal,
    cardList,
    initSwipe,
    getTransactions,
    setTransactions,
    transactions,
    save,
    refreshMethods,
    met,
    post: (iso, method) => post(iso, method)
  });
  showCardModal = createShowCardModal({
    cardModal,
    updateModalOpenState,
    renderCardList
  });
  hideCardModal = createHideCardModal({
    cardModal,
    updateModalOpenState
  });
  togglePlanned = createTogglePlanned({
    transactions,
    sameId,
    plannedModal,
    askMoveToToday,
    getTransactions,
    setTransactions,
    post: (iso, method) => post(iso, method),
  todayISO,
  save,
  renderTable,
  renderPlannedModal,
  notify,
  refreshBudgetsCache: maybeRefreshBudgetsCache
});
  panorama = setupBudgetPanorama({
    button: openCardBtn,
    isPanoramaEnabled,
    getTransactions,
    safeFmtCurrency,
    todayISO,
    showBudgetHistory: (tag) => budgetHistory?.showHistory?.(tag)
  });

  if (openCardBtn) {
    console.info('[panorama] attaching handler to header button');
    openCardBtn.dataset.panoramaHook = '1';
    openCardBtn.addEventListener('click', (event) => {
      console.info('[panorama] header button click', { hasPanorama: !!panorama, hasHandle: panorama && typeof panorama.handleOpen === 'function' });
      if (panorama && typeof panorama.handleOpen === 'function') {
        try {
          const opened = panorama.handleOpen();
          if (opened) {
            console.info('[panorama] opened sheet');
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        } catch (err) {
          console.error('[panorama] handleOpen failed', err);
        }
      }
      console.info('[panorama] falling back to cards modal');
      showCardModal();
    });
  } else {
    console.warn('[panorama] header button not found');
  }

  // Update the deps object passed to makeLine so it can access togglePlanned
  // This is safe because getTogglePlanned() reads from deps dynamically
  if (makeLine.__deps__) {
    makeLine.__deps__.togglePlanned = togglePlanned;
  }
  
  // Ensure togglePlanned is available to transactionLine event handlers
  if (window.__gastos) {
    window.__gastos.togglePlanned = togglePlanned;
  }
  
  performResetAllData = createPerformResetAllData({
    setTransactions,
    setCards,
    state,
    cacheSet,
    getTransactions,
    getCards,
    save,
    refreshMethods: () => refreshMethods(),
    renderCardList: () => renderCardList(),
    initStart,
    renderTable,
    showToast,
    syncStartInputFromState,
    saveBudgets,
    resetBudgetCache,
    maybeRefreshBudgetsCache,
    flushQueue: fbFlushQueue,
  });
  // Expose the new reset routine globally so existing code can invoke it.
  try { window.performResetAllData = performResetAllData; } catch (_) {}
  // Create a floating reset button via the helper.
  createFloatingResetButton({ performResetAllData });
  
  // Add card modal functions to window.__gastos after they're created
  try { 
    window.__gastos.showCardModal = showCardModal;
    window.__gastos.hideCardModal = hideCardModal;
    window.__gastos.setCards = window.setCards;  // Export setCards for Firebase sync
    window.__gastos.openPanorama = () => {
      try { return panorama && typeof panorama.handleOpen === 'function' ? panorama.handleOpen() : false; } catch (_) { return false; }
    };
    window.__gastos.refreshPanorama = () => {
      try { return panorama && typeof panorama.refresh === 'function' ? panorama.refresh() : false; } catch (_) { return false; }
    };
    window.__gastos.reconcileBudgets = () => {
      try { return reconcileBudgetsWithRemote(); } catch (_) { return Promise.resolve(); }
    };
  } catch (_) {}
  // Rebind the scroll animation helper. Use getters/setters so that
  // assignments inside the helper update module‑level variables.
  animateWrapperScroll = createAnimateWrapperScroll({
    wrapperEl,
    get wrapperScrollAnimation() { return wrapperScrollAnimation; },
    set wrapperScrollAnimation(val) { wrapperScrollAnimation = val; },
    get wrapperTodayAnchor() { return wrapperTodayAnchor; },
    set wrapperTodayAnchor(val) { wrapperTodayAnchor = val; },
  });
  // CRITICAL: Update the global context to use the new animated function
  if (window.__gastos) {
    window.__gastos.animateWrapperScroll = animateWrapperScroll;
    window.__gastos.scrollTodayIntoView = scrollTodayIntoView;
  }
} catch (err) {
  console.error('Helper binding failed:', err);
}

function isDetachedOccurrence(tx){return !tx.recurrence&&!!tx.parentId;}


function addCard(){const n=cardName.value.trim(),cl=+cardClose.value,du=+cardDue.value;if(!n||cl<1||cl>31||du<1||du>31||cl>=du||cards.some(c=>c.name===n)){alert('Dados inválidos');return;}cards.push({name:n,close:cl,due:du});window.__gastos.cards = cards;cacheSet('cards', cards);save('cards',cards);refreshMethods();renderCardList();
// Force update card selector in transaction modal if currently showing cards
const cardSelectorEl = document.getElementById('cardSelector');
const methodSwitch = document.querySelector('.method-switch');
if (cardSelectorEl && methodSwitch && methodSwitch.dataset.selected === 'Cartão') {
  try {
    if (window.__gastos && window.__gastos.renderCardSelectorHelper) {
      window.__gastos.renderCardSelectorHelper({ cards: window.__gastos.cards, hiddenSelect: document.getElementById('method') });
      cardSelectorEl.hidden = false;
    }
  } catch (_) {}
}
cardName.value='';cardClose.value='';cardDue.value='';}

// Bind addCard event directly (from historical fix)
if (addCardBtn) {
  addCardBtn.onclick = () => {
    addCard();
  };
}

function openPayInvoiceModal(cardName,dueISO,remaining,totalAbs,adjustedBefore){return openPayInvoiceModalMod(cardName,dueISO,remaining,totalAbs,adjustedBefore);}


addTx=async()=>addTxMod();
if (typeof window !== 'undefined') window.addTx = addTx;
// Update the global context with the real addTx function
if (window.__gastos) window.__gastos.addTx = addTx;
// Removed unused transaction form helper stubs (collectTxFormData, buildTransaction, finalizeTransaction, resetTxForm)


function delTx(id,iso){const g=typeof window!=='undefined'?window.__gastos:undefined;if(g&&typeof g.delTx==='function')return g.delTx(id,iso);}

function closeDeleteModal(){const g=typeof window!=='undefined'?window.__gastos:undefined;if(g&&typeof g.closeDeleteModal==='function')return g.closeDeleteModal();}



function findMasterRuleFor(tx,iso){const g=typeof window!=='undefined'?window.__gastos:undefined;if(g&&typeof g.findMasterRuleFor==='function')return g.findMasterRuleFor(tx,iso);return null;}


function closeEditModal(){editRecurrenceModal.classList.add('hidden');updateModalOpenState();if(reopenPlannedAfterEdit&&plannedModal){reopenPlannedAfterEdit=false;window.__gastos?.renderPlannedModal?.();plannedModal.classList.remove('hidden');updateModalOpenState();}}
if(closeEditRecurrenceModal)closeEditRecurrenceModal.onclick=closeEditModal;
if(cancelEditRecurrence)cancelEditRecurrence.onclick=closeEditModal;
if(editRecurrenceModal)editRecurrenceModal.onclick=e=>{if(e.target===editRecurrenceModal)closeEditModal();};
if(editSingleBtn){
  editSingleBtn.onclick=()=>{
    pendingEditMode='single';
    if(window.__gastos) {
      window.__gastos.pendingEditMode = pendingEditMode;
    }
    if(window.__gastos && window.__gastos.editTx){
      window.__gastos.editTx(window.__gastos.pendingEditTxId || pendingEditTxId);
    }
    closeEditModal();
  };
}
if(editFutureBtn){
  editFutureBtn.onclick=()=>{
    pendingEditMode='future';
    if(window.__gastos) {
      window.__gastos.pendingEditMode = pendingEditMode;
    }
    if(window.__gastos && window.__gastos.editTx){
      window.__gastos.editTx(window.__gastos.pendingEditTxId || pendingEditTxId);
    }
    closeEditModal();
  };
}
if(editAllBtn){
  editAllBtn.onclick=()=>{
    pendingEditMode='all';
    if(window.__gastos) {
      window.__gastos.pendingEditMode = pendingEditMode;
    }
    if(window.__gastos && window.__gastos.editTx){
      window.__gastos.editTx(window.__gastos.pendingEditTxId || pendingEditTxId);
    }
    closeEditModal();
  };
}
const editTx=id=>{const g=typeof window!=='undefined'?window.__gastos:undefined;if(g&&typeof g.editTx==='function')return g.editTx(id);};

document.addEventListener('click',e=>{
  const editEl=e.target.closest('.icon-edit,[data-action=\"edit\"]');
  if(!editEl)return;
  const container=editEl.closest('.op-item,.op-line,.swipe-wrapper')||document;
  const txEl=container.querySelector('[data-tx-id]');
  const id=txEl?Number(txEl.dataset.txId):null;
  if(!id)return;
  
  // Try to get the date from the DOM element
  // The date should be stored somewhere in the parent structure
  const dateEl = container.closest('[data-date]') || container.querySelector('[data-date]');
  const dateFromDom = dateEl ? dateEl.dataset.date : null;
  
  const txs=getTransactions?getTransactions():transactions;
  const t=txs.find(x=>x&&x.id===id);
  if(!t)return;
  
  // Use the date from DOM if available, otherwise fallback to t.opDate
  const targetDate = dateFromDom || t.opDate;
  
  try{
    if(typeof openEditFlow==='function'){
      openEditFlow(t, targetDate);
    }else{
      const g=typeof window!=='undefined'?window.__gastos:undefined;
      if(g&&typeof g.editTx==='function')g.editTx(id);
    }
  }catch(err){
    console.error('openEditFlow failed, falling back to direct edit:',err);
    const g=typeof window!=='undefined'?window.__gastos:undefined;
    if(g&&typeof g.editTx==='function')g.editTx(id);
  }
  e.preventDefault();
  e.stopPropagation();
});

function renderTable(){
  // Preserve position robustly: anchor nearest day to the sticky header line
  let prevScrollTop = null;
  let restoreScrollByAnchor = null;
  // Lock auto-scrollers during re-render to avoid external jumps (iOS PWA)
  try { if (window.__gastos) window.__gastos.__lockAutoScroll = true; } catch (_) {}
  try {
    if (wrapperEl && typeof wrapperEl.scrollTop === 'number') prevScrollTop = wrapperEl.scrollTop;
    const wrap = wrapperEl;
    if (wrap) {
      const header = document.querySelector('.app-header');
      const headerHeight = header ? (header.offsetHeight || 0) : 0;
      const sticky = document.querySelector('.sticky-month');
      let stickyHeight = 0;
      if (sticky) {
        const measured = sticky.offsetHeight || stickyHeightGuess || 0;
        if (measured > 0) stickyHeight = measured;
      }
      const gap = 8;
      const anchorY = headerHeight + stickyHeight + gap; // target line inside viewport
      const days = Array.from(document.querySelectorAll('details.day'));
      if (days.length) {
        let best = null; let bestDelta = Infinity;
        days.forEach((el) => {
          const r = el.getBoundingClientRect();
          const d = Math.abs(r.top - anchorY);
          if (d < bestDelta) { bestDelta = d; best = el; }
        });
        const key = best && best.dataset ? best.dataset.key : null;
        const beforeTop = best ? best.getBoundingClientRect().top : null;
        if (key && beforeTop != null) {
          restoreScrollByAnchor = () => {
            try {
              const after = document.querySelector(`details.day[data-key="${key}"]`);
              if (!after) return;
              const afterTop = after.getBoundingClientRect().top;
              const adjust = afterTop - beforeTop;
              if (Math.abs(adjust) > 1 && wrapperEl) wrapperEl.scrollTop += adjust;
            } catch (_) {}
          };
        }
      }
    }
  } catch (_) {}
  const hydrating=isHydrating();
  // Ensure dual daily balances (projected vs available) are computed
  // before rendering so the day-headers can use them instead of the
  // legacy single running balance fallback.
  try {
    let txs = (typeof getTransactions === 'function' ? getTransactions() : transactions) || [];
    // Apply budget materialization transactions for balance calculations
    // These are temporary injections that don't persist to storage
    try {
      txs = injectBudgetMaterializationTransactions(txs);
    } catch (_) {}
    const res = computeDailyBalancesHelper(txs, state.startBalance, state.startDate, { ignoreInvoiceMeta: true });
    try { if (window.__gastos) window.__gastos.dailyBalances = res.byDay; } catch (_) {}
  } catch (_) {}
  clearTableContent();
  const acc=document.getElementById('accordion');
  
  // Atualizar flag de skeleton antes de reconstruir o DOM para evitar inserir placeholders quando já temos dados reais.
  if(hydrating){
    if(acc) acc.dataset.state='skeleton';
  } else {
    if(acc && acc.dataset.state){
      delete acc.dataset.state;
    }
  }
  
  const groups=groupTransactionsByMonth();
  renderTransactionGroups(groups);
  
  setTimeout(()=>{
    try{
      if(typeof recalculateHeaderOffset==='function') recalculateHeaderOffset();
    } catch(_) {}
    // First try anchor-based restoration to keep the same day under the header
    try { if (typeof restoreScrollByAnchor === 'function') restoreScrollByAnchor(); } catch (_) {}
    // Fallback: restore previous scroll exactly (helps iOS 17/26 PWA)
    try {
      if (wrapperEl != null && prevScrollTop != null && Math.abs((wrapperEl.scrollTop||0) - prevScrollTop) > 1) {
        wrapperEl.scrollTop = prevScrollTop;
      }
    } catch (_) {}
    // Release auto-scroll lock shortly after layout settles
    setTimeout(() => { try { if (window.__gastos) window.__gastos.__lockAutoScroll = false; } catch (_) {} }, 80);
  }, 100);
}


function clearTableContent(){if(typeof tbody!=='undefined'&&tbody)tbody.innerHTML='';}


function renderTransactionGroups(groups){accordionApi.renderAccordion();}



// Create a wrapped getTransactions that includes budget materializations
const getTransactionsWithMaterializations = () => {
  try {
    const txs = typeof getTransactions === 'function' ? getTransactions() : transactions;
    const result = injectBudgetMaterializationTransactions(txs);
    return result;
  } catch (err) {
    console.error('[getTransactionsWithMaterializations] Error:', err);
    return typeof getTransactions === 'function' ? getTransactions() : transactions;
  }
};

const { txByDate, calculateDateRange } = initTxUtils({
  cards,
  getTransactions: getTransactionsWithMaterializations,
  transactions,
  post,
  occursOn,
  todayISO,
  VIEW_YEAR,
  getViewYear: () => VIEW_YEAR
});

// Expose the exact helpers the accordion uses so the Planned modal can
// mirror its source-of-truth expansion logic.
try {
  if (window.__gastos) {
    window.__gastos.txByDate = txByDate;
    window.__gastos.calculateDateRange = calculateDateRange;
    // Expose wrapped getTransactions with materializations
    window.__gastos.getTransactionsWithMaterializations = getTransactionsWithMaterializations;
  }
} catch (_) {}

const accordionApi = initAccordion({
  acc: document.getElementById('accordion'),
  getTransactions: getTransactionsWithMaterializations,
  transactions,
  cards,
  getCards,
  state,
  calculateDateRange,
  VIEW_YEAR,
  getViewYear: () => VIEW_YEAR,
  txByDate,
  safeFmtCurrency,
  SALARY_WORDS,
  makeLine,
  getReservedTotalForDate: getReservedTotalForDateStub,
  isBudgetsFeatureEnabled: isBudgetsEnabled,
});

// Renderizar o accordion imediatamente (com shimmer nos valores durante hidratação)
renderTable();
// Close past-due budgets on app open
  try { runDailyBudgetMaintenance(); } catch (_) {}
  // Kick a reconciliation in the background to align devices after startup
  try { reconcileBudgetsWithRemote(); } catch (_) {}



const YEAR_SELECTOR_MIN = 1990;
const YEAR_SELECTOR_MAX = 3000;

// Unused yearSelector and accordion wrapper functions removed; call yearSelectorApi.* or accordionApi.* directly


function initStart(){const g=typeof window!=='undefined'?window.__gastos:undefined;if(g&&typeof g.initStart==='function')return g.initStart();}

// Use Firebase service flushQueue so profile-scoped dirtyQueue is flushed
setupServiceWorker({ USE_MOCK, flushQueue: fbFlushQueue });

// Also flush pending profile-scoped writes when the browser comes online
try {
  window.addEventListener('online', () => { try { fbFlushQueue(); } catch (_) {} });
} catch (_) {}

initSwipe(document.body, '.swipe-wrapper', '.swipe-actions', '.op-line', 'opsSwipeInit');
if (cardList) initSwipe(cardList, '.swipe-wrapper', '.swipe-actions', '.card-line', 'cardsSwipeInit');
initSwipe(document.body, '.swipe-wrapper', '.swipe-actions', '.invoice-header-line', 'invoiceSwipeInit');

yearSelectorApi.updateYearTitle();
initKeyboardAndScrollHandlers();

// Watch for day change to close expired budgets automatically
try {
  initDayChangeWatcher(() => {
    try { runDailyBudgetMaintenance(); } catch (_) {}
  });
} catch (_) {}

// Wire up UI event handlers using the extracted module. Only pass
// references that should be managed by the helper; omit others
// (e.g., openTxBtn) so that existing logic remains unaffected.
try {
  setupMainEventHandlers({
    headerSeg,
    openPlannedBtn,
    yearSelector,
    yearSelectorApi,
    closeYearModalBtn,
    yearModal,
    bottomPill,
    renderPlannedModal,
    fixPlannedAlignment,
    expandPlannedDayLabels,
    plannedModal,
    plannedBox,
    plannedList,
    openTxBtn: null,
    closeTxModal: null,
    txModal: null,
    toggleTxModal: null,
    homeBtn,
    scrollTodayIntoView,
    openSettings,
    closeSettings,
    closeAllModals,
    settingsModalEl,
    closeSettingsModalBtn,
    updateModalOpenState,
  });
} catch (err) {
  console.error('Failed to setup main event handlers:', err);
}
