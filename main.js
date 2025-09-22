import { fmtCurrency, fmtNumber, parseCurrency, escHtml } from './js/utils/format-utils.js';
import {
  DEFAULT_PROFILE,
  LEGACY_PROFILE_ID,
  PROFILE_DATA_KEYS,
  PROFILE_CACHE_KEYS,
  getRuntimeProfile,
  getCurrencyName,
  getCurrentProfileId,
  scopedCacheKey,
  scopedDbSegment
} from './js/utils/profile-utils.js';
import { cacheGet, cacheSet, cacheRemove, cacheClearProfile } from './js/utils/cache-utils.js';
import {
  appState,
  setStartBalance,
  setStartDate,
  setStartSet,
  setBootHydrated
} from './js/state/app-state.js';

const state = appState;

let startInputRef = null;

const hydrationTargets = new Map();
let hydrationInProgress = true;
let reopenPlannedAfterEdit = false;
const sameId = (a, b) => String(a ?? '') === String(b ?? '');

function resetHydration() {
  hydrationInProgress = true;
  hydrationTargets.clear();
  try { document.documentElement.classList.add('skeleton-boot'); } catch (_) {}
}

function registerHydrationTarget(key, enabled) {
  if (!enabled || !key) return;
  hydrationTargets.set(key, false);
}

function markHydrationTargetReady(key) {
  if (!key || !hydrationTargets.has(key)) return;
  hydrationTargets.set(key, true);
  maybeCompleteHydration();
}

function maybeCompleteHydration() {
  if (!hydrationInProgress) return;
  for (const status of hydrationTargets.values()) {
    if (status === false) return;
  }
  completeHydration();
}

function completeHydration() {
  if (!hydrationInProgress) return;
  hydrationInProgress = false;
  hydrationTargets.clear();
  ensureStartSetFromBalance({ persist: true });
  try { refreshMethods(); } catch (_) {}
  try { renderCardList(); } catch (_) {}
  try { initStart(); } catch (_) {}
  try { safeRenderTable(); } catch (_) {}
  try { document.documentElement.classList.remove('skeleton-boot'); } catch (_) {}
}

function isHydrating() {
  return hydrationInProgress;
}

resetHydration();

const INITIAL_CASH_CARD = { name: 'Dinheiro', close: 0, due: 0 };
let transactions = [];
let cards = [INITIAL_CASH_CARD];
// Flag for mocking data while working on UI.
// Switch to `false` to reconnect to production Firebase.
const USE_MOCK = false;              // conectar ao Firebase (TESTE via config import)

// Year selector state
let VIEW_YEAR = new Date().getFullYear(); // Ano atual padrão

// Recorrência: Exclusão e Edição de recorrência
let pendingDeleteTxId = null;
let pendingDeleteTxIso = null;
let pendingEditTxId = null;
let pendingEditTxIso = null;
let pendingEditMode = null;

let profileListeners = [];
let startRealtimeFn = null;

function cleanupProfileListeners() {
  if (!profileListeners || !profileListeners.length) return;
  profileListeners.forEach(unsub => {
    try { typeof unsub === 'function' && unsub(); }
    catch (err) { console.warn('Listener cleanup failed', err); }
  });
  profileListeners = [];
}

function safeFmtCurrency(value, options) {
  try { return fmtCurrency(value, options); } catch (_) {}
  const profile = getRuntimeProfile();
  const decimals = options?.maximumFractionDigits ?? options?.minimumFractionDigits ?? (profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
  try {
    const nf = new Intl.NumberFormat(profile.locale || DEFAULT_PROFILE.locale, {
      style: 'currency',
      currency: profile.currency || DEFAULT_PROFILE.currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return nf.format(Number(value) || 0);
  } catch (_) {
    return `${profile.currency || DEFAULT_PROFILE.currency} ${(Number(value) || 0).toFixed(decimals)}`;
  }
}

function safeFmtNumber(value, options = {}) {
  try { return fmtNumber(value, options); } catch (_) {}
  const profile = getRuntimeProfile();
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? Math.max(minimumFractionDigits, profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
  try {
    const nf = new Intl.NumberFormat(profile.locale || DEFAULT_PROFILE.locale, {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping: options.useGrouping !== false
    });
    return nf.format(Number(value) || 0);
  } catch (_) {
    return (Number(value) || 0).toFixed(Math.max(0, maximumFractionDigits));
  }
}

function profileRef(key) {
  if (!firebaseDb || !PATH) return null;
  const segment = scopedDbSegment(key);
  return ref(firebaseDb, `${PATH}/${segment}`);
}

function safeParseCurrency(raw) {
  try { return parseCurrency(raw); } catch (_) {}
  if (typeof raw === 'number') return raw;
  if (!raw) return 0;
  return Number(String(raw).replace(/[^0-9+\-.,]/g, '').replace(/\./g, '').replace(/,/g, '.')) || 0;
}

function normalizeTransactionRecord(t) {
  if (!t) return t;
  return {
    ...t,
    method: (t.method && t.method.toLowerCase() === 'dinheiro') ? 'Dinheiro' : t.method,
    recurrence: t.recurrence ?? '',
    installments: t.installments ?? 1,
    parentId: t.parentId ?? null
  };
}

function ensureCashCard(list) {
  const cardsList = Array.isArray(list) ? list.filter(Boolean).map(c => ({ ...c })) : [];
  if (!cardsList.some(c => c && c.name === 'Dinheiro')) {
    cardsList.unshift({ name: 'Dinheiro', close: 0, due: 0 });
  }
  return cardsList;
}

function hydrateStateFromCache(options = {}) {
  const { render = true } = options;
  const cachedTx = cacheGet('tx', []);
  transactions = (cachedTx || [])
    .filter(Boolean)
    .map(normalizeTransactionRecord);
  sortTransactions();

  cards = ensureCashCard(cacheGet('cards', [{ name: 'Dinheiro', close: 0, due: 0 }]));
  state.startBalance = cacheGet('startBal', null);
  state.startDate = cacheGet('startDate', null);
  state.startSet = cacheGet('startSet', false);

  if (state.startDate == null && (state.startBalance === 0 || state.startBalance === '0')) {
    state.startBalance = null;
    try { cacheSet('startBal', null); } catch (_) {}
  }

  syncStartInputFromState();

  state.bootHydrated = true;

  ensureStartSetFromBalance();

  if (render && !isHydrating()) {
    try { initStart(); } catch (_) {}
    try { if (typeof refreshMethods === 'function') refreshMethods(); } catch (_) {}
    try { if (typeof renderCardList === 'function') renderCardList(); } catch (_) {}
    try { if (typeof renderTable === 'function') renderTable(); } catch (_) {}
    try {
      if (plannedModal && !plannedModal.classList.contains('hidden')) {
        if (typeof renderPlannedModal === 'function') renderPlannedModal();
        if (typeof fixPlannedAlignment === 'function') fixPlannedAlignment();
        if (typeof expandPlannedDayLabels === 'function') expandPlannedDayLabels();
      }
    } catch (_) {}
  }
  updatePendingBadge();
}

const keyboardDeferredTasks = new Set();

function scheduleAfterKeyboard(fn) {
  if (typeof fn !== 'function') return;
  try {
    if (document.documentElement?.dataset?.vvKb === '1') {
      keyboardDeferredTasks.add(fn);
      return;
    }
  } catch (_) {}
  fn();
}

function flushKeyboardDeferredTasks() {
  if (!keyboardDeferredTasks.size) return;
  const tasks = Array.from(keyboardDeferredTasks);
  keyboardDeferredTasks.clear();
  tasks.forEach(fn => {
    try { fn(); }
    catch (err) { console.error('Deferred keyboard task failed', err); }
  });
}
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
// Modal Confirmar sair da conta - refs
const confirmLogoutModal = document.getElementById('confirmLogoutModal');
const confirmLogoutYes   = document.getElementById('confirmLogoutYes');
const confirmLogoutNo    = document.getElementById('confirmLogoutNo');
const closeConfirmLogout = document.getElementById('closeConfirmLogout');
const confirmLogoutText  = document.getElementById('confirmLogoutText');
// Settings modal – refs
const settingsModalEl = document.getElementById('settingsModal');
const toggleThemeBtn = document.getElementById('toggleThemeBtn');
if (toggleThemeBtn) {
  toggleThemeBtn.onclick = () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    html.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
  };
}
const closeSettingsModalBtn = document.getElementById('closeSettingsModal');

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
      updateModalOpenState();
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
    updateModalOpenState();
  });
}

function askConfirmLogout() {
  if (!confirmLogoutModal || !confirmLogoutYes || !confirmLogoutNo) {
    return Promise.resolve(window.confirm('Deseja mesmo desconectar?'));
  }
  return new Promise(resolve => {
    const cleanup = () => {
      confirmLogoutModal.classList.add('hidden');
      updateModalOpenState();
      confirmLogoutYes.onclick = null;
      confirmLogoutNo.onclick = null;
      if (closeConfirmLogout) closeConfirmLogout.onclick = null;
      confirmLogoutModal.onclick = null;
    };
    confirmLogoutYes.onclick = () => { cleanup(); resolve(true); };
    confirmLogoutNo.onclick  = () => { cleanup(); resolve(false); };
    if (closeConfirmLogout) closeConfirmLogout.onclick = () => { cleanup(); resolve(false); };
    confirmLogoutModal.onclick = (e) => { if (e.target === confirmLogoutModal) { cleanup(); resolve(false); } };
    confirmLogoutModal.classList.remove('hidden');
    updateModalOpenState();
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
// ---------------- Settings (Ajustes) modal ----------------
function renderSettingsModal(){
  if (!settingsModalEl) return;
  const box = settingsModalEl.querySelector('.modal-content');
  if (!box) return;
  const u = (window.Auth && window.Auth.currentUser) ? window.Auth.currentUser : null;
  const name  = u && u.displayName ? u.displayName : 'Usuário';
  const email = u && u.email ? u.email : '';
  const photo = u && u.photoURL ? u.photoURL : '';
  box.innerHTML = `
    <div class="settings-card">
      <div class="settings-profile">
        <div class="settings-avatar">
          <img id="settingsAvatar" alt="" referrerpolicy="no-referrer" decoding="async" loading="lazy"/>
        </div>
        <div class="settings-names">
          <div class="settings-name">${escHtml(name)}</div>
          <div class="settings-sub">${escHtml(email)}</div>
        </div>
      </div>
    </div>

  <h2 class="settings-title" style="margin:18px 0 8px 0;font-size:1rem;font-weight:700;color:var(--txt-main);">Personalização</h2>
    <div class="settings-card settings-theme-card">
      <div class="theme-row" id="themeButtons">
        <button type="button" class="theme-btn" data-theme="light">Claro</button>
        <button type="button" class="theme-btn" data-theme="dark">Escuro</button>
        <button type="button" class="theme-btn" data-theme="system">Sistema</button>
      </div>
      <div style="margin-top:4px;padding:0;">
        <div id="currencyProfileRow" class="settings-row" style="display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:10px;background:var(--card-bg);box-shadow:var(--card-shadow);cursor:pointer;">
          <div id="currencyProfileLabel" style="font-weight:600;color:var(--txt-main);font-size:15px;">Brasil (BRL)</div>
          <div style="color:var(--txt-muted);font-size:18px;">›</div>
        </div>
      </div>
    </div>

    <h2 class="settings-title" style="margin:18px 0 8px 0;font-size:1rem;font-weight:700;color:var(--txt-main);">Sobre</h2>
    <div class="settings-list">
      <div class="settings-item">
        <div class="left">
          <span class="version-number">${APP_VERSION}</span>
        </div>
        <div class="right"></div>
      </div>

      <div class="settings-item danger">
        <button type="button" id="resetDataBtn" class="settings-cta">
          <span>Apagar Todos os Dados</span>
        </button>
      </div>
    </div>

    <div class="settings-list">
      <div class="settings-item danger">
        <button type="button" id="logoutBtn" class="settings-cta">
          <span class="settings-icon icon-logout"></span>
          <span>Sair da conta</span>
        </button>
      </div>
    </div>`;
  const img = box.querySelector('#settingsAvatar');
  if (img) {
    if (photo) {
      try { img.src = photo.replace(/=s\d+-c.*/, '=s128-c'); } catch(_) { img.src = photo; }
    } else {
      img.src = 'icons/icon-180x180.png';
    }
    img.onerror = () => { img.onerror = null; img.src = 'icons/icon-180x180.png'; };
  }
  const outBtn = box.querySelector('#logoutBtn');
  if (outBtn) outBtn.onclick = async () => {
    const ok = await askConfirmLogout();
    if (!ok) return;
    try { await window.Auth?.signOut(); } catch(_) {}
    closeSettings();
  };
  // Theme buttons wiring
  const themeButtons = box.querySelectorAll('.theme-btn');
  if (themeButtons && themeButtons.length) {
    const saved = localStorage.getItem('ui:theme') || 'system';
    // helper to update visuals
    function updateThemeButtons(active) {
      themeButtons.forEach(b => {
        const t = b.dataset.theme;
        const isActive = t === active;
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }
    // initialize visuals
    updateThemeButtons(saved === 'system' ? 'system' : saved);
    themeButtons.forEach(b => {
      b.addEventListener('click', () => {
        const v = b.dataset.theme;
        localStorage.setItem('ui:theme', v);
        applyThemePreference(v);
        updateThemeButtons(v);
      });
    });
  }

  // Currency/profile row wiring (opens a modal list)
  const profileRow = box.querySelector('#currencyProfileRow');
  if (profileRow && window.CURRENCY_PROFILES) {
    const updateRowLabel = () => {
      const cur = localStorage.getItem('ui:profile') || Object.keys(window.CURRENCY_PROFILES)[0];
      const p = window.CURRENCY_PROFILES[cur] || Object.values(window.CURRENCY_PROFILES)[0];
      const left = profileRow.querySelector('#currencyProfileLabel');
      if (left) {
        left.textContent = p ? p.name : '—';
        left.style.setProperty('color', 'var(--txt-main)', 'important');
        left.style.setProperty('opacity', '1', 'important');
      }
    };
    updateRowLabel();
    profileRow.addEventListener('click', () => {
      const modal = document.getElementById('currencyProfileModal');
      const list = document.getElementById('currencyProfileList');
      if (!modal || !list) return;
      // populate list
      list.innerHTML = '';
      Object.keys(window.CURRENCY_PROFILES).forEach(k => {
        const p = window.CURRENCY_PROFILES[k];
        const li = document.createElement('li');
        li.style.padding = '12px 10px';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
        li.style.cursor = 'pointer';
  // make sure list text is high-contrast and visible in all themes
  li.style.fontSize = '16px';
  li.style.fontWeight = '600';
  li.style.background = 'transparent';
  // use setProperty with priority to override strict theme rules if needed
  li.style.setProperty('color', 'var(--txt-main)', 'important');
  li.style.setProperty('opacity', '1', 'important');
  li.style.setProperty('mix-blend-mode', 'normal', 'important');
        li.style.userSelect = 'none';
        li.textContent = p.name;
        li.dataset.profileId = p.id;
        li.addEventListener('click', () => {
          modal.classList.add('hidden');
          updateModalOpenState();
          if (typeof closeSettings === 'function') {
            closeSettings();
          }
          applyCurrencyProfile(p.id, { notify: true });
          updateRowLabel();
        });
        // touch / hover feedback
        li.addEventListener('pointerenter', () => { li.style.background = 'rgba(255,255,255,0.02)'; });
        li.addEventListener('pointerleave', () => { li.style.background = 'transparent'; });
        list.appendChild(li);
      });
      modal.classList.remove('hidden');
      updateModalOpenState();
    });
  }

  // wire currency profile modal close
  const closeCurrencyProfileModal = document.getElementById('closeCurrencyProfileModal');
  const currencyProfileModalEl = document.getElementById('currencyProfileModal');
  if (closeCurrencyProfileModal && currencyProfileModalEl) {
    closeCurrencyProfileModal.addEventListener('click', () => { currencyProfileModalEl.classList.add('hidden'); updateModalOpenState(); });
    currencyProfileModalEl.addEventListener('click', (e) => { if (e.target === currencyProfileModalEl) { currencyProfileModalEl.classList.add('hidden'); updateModalOpenState(); } });
  }

  // Reset button inside settings modal
  const localResetBtn = box.querySelector('#resetDataBtn');
  if (localResetBtn) {
    localResetBtn.addEventListener('click', () => {
      const confirmModal = document.getElementById('confirmResetModal');
      if (confirmModal) {
        confirmModal.classList.remove('hidden');
        updateModalOpenState();
      } else {
        // fallback: call existing function directly
        try { performResetAllData(true); } catch (e) { console.error(e); }
      }
    });
  }

  // Wire confirmation modal buttons if modal exists in DOM
  const confirmResetModal = document.getElementById('confirmResetModal');
  const confirmResetYes = document.getElementById('confirmResetYes');
  const confirmResetNo = document.getElementById('confirmResetNo');
  const closeConfirmReset = document.getElementById('closeConfirmReset');
  if (confirmResetModal) {
    if (confirmResetYes) confirmResetYes.onclick = async () => {
      // proceed without extra confirm (we already asked via modal)
      confirmResetModal.classList.add('hidden');
      updateModalOpenState();
      try { await performResetAllData(false); } catch (e) { console.error(e); }
    };
    if (confirmResetNo) confirmResetNo.onclick = () => { confirmResetModal.classList.add('hidden'); updateModalOpenState(); };
    if (closeConfirmReset) closeConfirmReset.onclick = () => { confirmResetModal.classList.add('hidden'); updateModalOpenState(); };
    confirmResetModal.onclick = (e) => { if (e.target === confirmResetModal) { confirmResetModal.classList.add('hidden'); updateModalOpenState(); } };
  }
}
function openSettings(){ if (!settingsModalEl) return; renderSettingsModal(); settingsModalEl.classList.remove('hidden'); updateModalOpenState(); }
function closeSettings(){ if (!settingsModalEl) return; settingsModalEl.classList.add('hidden'); updateModalOpenState(); }
if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', closeSettings);
if (settingsModalEl) settingsModalEl.addEventListener('click', (e)=>{ if (e.target === settingsModalEl) closeSettings(); });
// React to auth state updates and keep the modal content fresh
try { document.addEventListener('auth:state', renderSettingsModal); } catch(_) {}

// Year selector event listeners
const yearSelector = document.getElementById('yearSelector');
const yearModal = document.getElementById('yearModal');
const closeYearModalBtn = document.getElementById('closeYearModal');

if (yearSelector) {
  // Keep click behavior (open modal)
  yearSelector.addEventListener('click', openYearModal);

  // Keyboard navigation: ArrowLeft / ArrowRight change year without opening modal
  yearSelector.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectYear(VIEW_YEAR - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectYear(VIEW_YEAR + 1);
    }
  });

  // Wheel support: scroll to change year (vertical wheel only)
  yearSelector.addEventListener('wheel', (e) => {
    if (e.deltaY === 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (e.deltaY < 0) selectYear(VIEW_YEAR + 1);
    else if (e.deltaY > 0) selectYear(VIEW_YEAR - 1);
  }, { passive: false });
}

if (closeYearModalBtn) {
  closeYearModalBtn.addEventListener('click', closeYearModal);
}

if (yearModal) {
  yearModal.addEventListener('click', (e) => {
    if (e.target === yearModal) closeYearModal();
  });
}

// Bottom floating pill actions
const bottomPill = document.querySelector('.floating-pill');
if (bottomPill) {
  bottomPill.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-option');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'settings') {
      openSettings();
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

// ---------------- Theme helpers ----------------
function getSystemPref() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch (_) { return 'dark'; }
}

function applyThemePreference(pref) {
  // pref: 'light' | 'dark' | 'system'
  let resolved = pref === 'system' ? getSystemPref() : pref;
  const root = document.documentElement;
  if (resolved === 'light') {
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
  } else {
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
  }
}

function initThemeFromStorage(){
  const saved = localStorage.getItem('ui:theme') || 'system';
  applyThemePreference(saved);
  // If system preference changes and user chose 'system', listen and update
  try {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener && mq.addEventListener('change', () => {
      const current = localStorage.getItem('ui:theme') || 'system';
      if (current === 'system') applyThemePreference('system');
    });
  } catch (_) {}
}

// Initialize theme early
initThemeFromStorage();

/**
 * Apply a currency/profile by id.
 * - sets window.APP_PROFILE
 * - creates window.APP_FMT Intl.NumberFormat for currency
 * - persists choice to localStorage
 * - toggles UI bits controlled by profile.features (e.g., invoice parcel)
 */
function applyCurrencyProfile(profileId, options = {}){
  const { notify = false } = options;
  if (!window.CURRENCY_PROFILES) return;
  const p = window.CURRENCY_PROFILES[profileId] || Object.values(window.CURRENCY_PROFILES)[0];
  if (!p) return;
  resetHydration();
  window.APP_PROFILE = p;
  const profileDecimals = Number.isFinite(p.decimalPlaces) ? p.decimalPlaces : 2;
  try{
    window.APP_FMT = new Intl.NumberFormat(p.locale, { style: 'currency', currency: p.currency, minimumFractionDigits: profileDecimals, maximumFractionDigits: profileDecimals });
  }catch(e){
    window.APP_FMT = { format: v => (Number(v).toFixed(profileDecimals) + ' ' + p.currency) };
  }
  try{
    window.APP_NUM = new Intl.NumberFormat(p.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.max(profileDecimals, 2)
    });
  }catch(e){
    window.APP_NUM = { format: v => Number(v ?? 0).toFixed(profileDecimals) };
  }
  localStorage.setItem('ui:profile', p.id);

  // toggle invoice parcel row if present
  const invoiceRow = document.getElementById('invoiceParcelRow');
  if (invoiceRow){
    if (p.features && p.features.invoiceParcel === false){
      invoiceRow.style.display = 'none';
    } else {
      invoiceRow.style.display = '';
    }
  }

  // update placeholders that show currency examples
  const startInput = document.querySelector('.start-container .currency-input');
  if (startInput){
    const decimals = Number.isFinite(p.decimalPlaces) ? p.decimalPlaces : (DEFAULT_PROFILE.decimalPlaces ?? 2);
    try {
      const placeholderFmt = new Intl.NumberFormat(p.locale || DEFAULT_PROFILE.locale, {
        style: 'currency',
        currency: p.currency || DEFAULT_PROFILE.currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
      startInput.placeholder = placeholderFmt.format(0);
    } catch (_) {
      const cur = p.currency || DEFAULT_PROFILE.currency;
      startInput.placeholder = `${cur} ${(0).toFixed(decimals)}`;
    }
    syncStartInputFromState();
  }

  const newStartDate = cacheGet('startDate', null);
  const newStartBalanceRaw = cacheGet('startBal', null);
  state.startDate = newStartDate;
  state.startBalance = (newStartDate == null && (newStartBalanceRaw === 0 || newStartBalanceRaw === '0'))
    ? null
    : newStartBalanceRaw;
  state.startSet = cacheGet('startSet', false);
  ensureStartSetFromBalance({ persist: false });
  syncStartInputFromState();

  if (notify && typeof showToast === 'function') {
    const label = p && p.name ? p.name : (profileId || 'perfil');
    showToast(`Moeda ajustada para ${label}`, 'success', 3600);
  }

  cleanupProfileListeners();
  const runAfterBoot = () => {
    try { hydrateStateFromCache(); } catch (err) { console.error('Failed to hydrate cache for profile', err); }
    if (typeof renderTxModal === 'function') {
      try { renderTxModal(); } catch (e) { console.error('renderTxModal failed after profile change', e); }
    }
    if (!USE_MOCK && typeof startRealtimeFn === 'function' && PATH) {
      startRealtimeFn().catch(err => {
        console.error('Failed to restart realtime after profile change', err);
      });
    }
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(runAfterBoot);
  else Promise.resolve().then(runAfterBoot);
}

// Apply saved profile on load (if profiles are available)
try{
  const savedProfile = localStorage.getItem('ui:profile') || (window.CURRENCY_PROFILES ? Object.keys(window.CURRENCY_PROFILES)[0] : null);
  if (savedProfile) applyCurrencyProfile(savedProfile);
}catch(e){}


import { openDB } from 'https://unpkg.com/idb?module';
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

// Configuração do Firebase de TESTE (arquivo separado)
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
async function idbRemove(k) { try { await cacheDB.delete('kv', k); } catch {} }

if (typeof window !== 'undefined') {
  window.APP_CACHE_BACKING = {
    idbGet,
    idbSet,
    idbRemove
  };
}

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

// Debug info for iOS PWA troubleshooting
const ua = navigator.userAgent.toLowerCase();
const isIOSDebug = /iphone|ipad|ipod/.test(ua);
const standaloneDebug = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ('standalone' in navigator && navigator.standalone);

if (isIOSDebug && standaloneDebug) {
  console.log('🔧 iOS PWA Debug Info:');
  console.log('- User Agent:', navigator.userAgent);
  console.log('- Display Mode:', window.matchMedia ? window.matchMedia('(display-mode: standalone)').matches : 'unknown');
  console.log('- Navigator Standalone:', navigator.standalone);
  console.log('- Firebase Config:', firebaseConfig ? 'loaded' : 'missing');
  console.log('- Auth State:', window.Auth ? 'initialized' : 'pending');
  
  // iOS 26 viewport debugging
  console.log('📱 iOS 26 Viewport Info:');
  console.log('- window.innerHeight:', window.innerHeight);
  console.log('- window.outerHeight:', window.outerHeight);
  console.log('- screen.height:', screen.height);
  console.log('- visualViewport:', window.visualViewport ? {
    height: window.visualViewport.height,
    width: window.visualViewport.width,
    offsetTop: window.visualViewport.offsetTop
  } : 'not supported');
  
  // Check safe area support
  const testDiv = document.createElement('div');
  testDiv.style.cssText = 'position: fixed; top: env(safe-area-inset-top); left: env(safe-area-inset-left); visibility: hidden;';
  document.body.appendChild(testDiv);
  const computedStyle = getComputedStyle(testDiv);
  console.log('- Safe area insets:', {
    top: computedStyle.top,
    left: computedStyle.left,
    supported: computedStyle.top !== 'env(safe-area-inset-top)'
  });
  document.body.removeChild(testDiv);
  
  // Check viewport unit support
  const viewportSupport = {
    vh: CSS.supports('height', '100vh'),
    svh: CSS.supports('height', '100svh'),
    dvh: CSS.supports('height', '100dvh'),
    lvh: CSS.supports('height', '100lvh')
  };
  console.log('- Viewport units support:', viewportSupport);
  
  // Monitor auth state changes
  document.addEventListener('auth:state', (e) => {
    const user = e.detail && e.detail.user;
    console.log('🔧 iOS PWA Auth State:', user ? {
      email: user.email,
      uid: user.uid,
      emailVerified: user.emailVerified
    } : 'signed out');
  });
  
  // Monitor network status
  const logNetworkStatus = () => {
    console.log('🔧 iOS PWA Network:', navigator.onLine ? 'online' : 'offline');
  };
  logNetworkStatus();
  window.addEventListener('online', logNetworkStatus);
  window.addEventListener('offline', logNetworkStatus);
}

let PATH;
// Casa compartilhada (PROD atual) e e‑mails que devem enxergar esta Casa
const WID_CASA = 'orcamento365_9b8e04c5';
const CASA_EMAILS = ['icmbelchior@gmail.com','sarargjesus@gmail.com'];
function resolvePathForUser(user){
  if (!user) return null;
  const email = (user.email || '').toLowerCase();
  console.log('Resolving path for user:', email);
  if (CASA_EMAILS.includes(email)) {
    console.log('User mapped to shared workspace:', WID_CASA);
    return WID_CASA;
  }
  const personalPath = `users/${user.uid}`;
  console.log('User mapped to personal workspace:', personalPath);
  return personalPath;
}

const APP_VERSION = 'v1.4.9(a60)';
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
      if (k === 'startSet') cacheSet('startSet', v);
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
  // Modo MOCK (LocalStorage)
  PATH = 'mock_365';
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
  const allowed = ['tx','cards','startBal','startSet'];
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
    if (q.includes('startBal')) await save('startBal', state.startBalance);
    if (q.includes('startSet')) await save('startSet', state.startSet);
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
setStartBalance(null);
setStartDate(null);
setStartSet(false);
setBootHydrated(false);
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

// Revalida postDate e normaliza método de cartão para dados legados
function recomputePostDates() {
  if (!Array.isArray(cards) || !cards.length) return false;
  let changed = false;
  const norm = (s) => (s==null?'' : String(s)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const nonCash = cards.filter(c => c && c.name !== 'Dinheiro');
  const singleCardName = nonCash.length === 1 ? nonCash[0].name : null;

  const inferCardForTx = (tx) => {
    const m = tx.method || '';
    const mNorm = norm(m);
    if (mNorm === 'dinheiro') return null; // dinheiro não precisa mapear
    // se já corresponde a um cartão existente, retorna o nome canônico
    const found = cards.find(c => c && norm(c.name) === mNorm);
    if (found) return found.name;
    // tenta inferir pelo postDate esperado: qual cartão gera esse postDate a partir do opDate?
    if (tx.opDate && tx.postDate) {
      const candidates = nonCash.filter(c => post(tx.opDate, c.name) === tx.postDate);
      if (candidates.length === 1) return candidates[0].name;
    }
    // fallback seguro: se usuário só tem um cartão, assume-o apenas se método vier vazio/genérico
    if (singleCardName && (!m || mNorm === 'cartao' || mNorm === 'cartão')) return singleCardName;
    return null; // ambíguo: não altera
  };

  transactions = (transactions || []).map(t => {
    if (!t) return t;
    const nt = { ...t };
    const inferred = inferCardForTx(nt);
    if (inferred && nt.method !== inferred) { nt.method = inferred; changed = true; }
    const isCash = norm(nt.method) === 'dinheiro';
    const isKnownCard = !isCash && cards.some(c => c && c.name === nt.method);
    const desired = isCash ? nt.opDate : (isKnownCard ? post(nt.opDate, nt.method) : nt.postDate);
    if (desired && nt.postDate !== desired) { nt.postDate = desired; changed = true; }
    return nt;
  });
  return changed;
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
    const formattedVal = safeFmtCurrency(valueNum);
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
  const startRealtime = async () => {
    console.log('Starting realtime listeners for PATH:', PATH);
    cleanupProfileListeners();
    resetHydration();

    // Enhanced iOS PWA: Wait for redirect completion if needed
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ('standalone' in navigator && navigator.standalone);
    
    if (isIOS && standalone && window.Auth && window.Auth.waitForRedirect) {
      console.log('iOS PWA: Waiting for redirect completion before starting listeners');
      await window.Auth.waitForRedirect();
    }
    
    // Enhanced permission check with better fallback for iOS PWA
    try {
      const u = window.Auth && window.Auth.currentUser;
      if (u && PATH) {
        console.log('Testing access to PATH:', PATH, 'for user:', u.email);
        const testRef = ref(firebaseDb, `${PATH}/${scopedDbSegment('startBal')}`);
        try {
          await get(testRef);
          console.log('Access confirmed to PATH:', PATH);
        } catch (err) {
          console.error('Access denied to PATH:', PATH, 'Error:', err);
          if (err && (err.code === 'PERMISSION_DENIED' || err.code === 'permission-denied')) {
            const fallback = `users/${u.uid}`;
            console.log('Falling back to personal workspace:', fallback);
            if (PATH !== fallback) {
              PATH = fallback;
              console.log('PATH updated to fallback:', PATH);
              // For iOS PWA, add small delay to ensure auth state is stable
              if (isIOS && standalone) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error during PATH verification:', err);
    }

    // Live listeners (Realtime DB)
    const txRef       = profileRef('tx');
    const cardsRef    = profileRef('cards');
    const balRef      = profileRef('startBal');
    const startDateRef= profileRef('startDate');
    const startSetRef = profileRef('startSet');

    const listeners = [];

    registerHydrationTarget('tx', !!txRef);
    registerHydrationTarget('cards', !!cardsRef);
    registerHydrationTarget('startBal', !!balRef);
    registerHydrationTarget('startDate', !!startDateRef);
    registerHydrationTarget('startSet', !!startSetRef);

  // initialize from cache first for instant UI
  hydrateStateFromCache();

    maybeCompleteHydration();

  // Listen for tx changes (LWW merge per item)
  if (txRef) listeners.push(onValue(txRef, (snap) => {
    try {
    const raw  = snap.val() ?? [];
    const incoming = Array.isArray(raw) ? raw : Object.values(raw);

    // normalize helper
    const norm = normalizeTransactionRecord;

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
    // Revalida postDate/método se cartões já conhecidos
    const fixed = recomputePostDates();
    cacheSet('tx', transactions);
    if (s.changed || fixed) {
      // Persist best-effort somente quando algo mudou localmente
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
    } finally {
      markHydrationTargetReady('tx');
    }
  }));

  // Listen for card changes
  if (cardsRef) listeners.push(onValue(cardsRef, (snap) => {
    const raw  = snap.val() ?? [];
    const next = Array.isArray(raw) ? raw : Object.values(raw);
    try {
      if (JSON.stringify(next) === JSON.stringify(cards)) {
        markHydrationTargetReady('cards');
        return;
      }

      cards = next;
      if (!cards.some(c => c.name === 'Dinheiro')) {
        cards.unshift({ name: 'Dinheiro', close: 0, due: 0 });
      }
      cacheSet('cards', cards);
      // Revalida transações à luz do cadastro de cartões atual
      const fixed = recomputePostDates();
      if (fixed) { try { save('tx', transactions); } catch (_) {} cacheSet('tx', transactions); }
      refreshMethods();
      renderCardList();
      renderTable();
    } finally {
      markHydrationTargetReady('cards');
    }
  }));

  // Listen for balance changes
  if (balRef) listeners.push(onValue(balRef, (snap) => {
    const val = snap.exists() ? snap.val() : null;
    if (val === state.startBalance) {
      markHydrationTargetReady('startBal');
      return;
    }
    try {
      state.startBalance = val;
      cacheSet('startBal', state.startBalance);
      syncStartInputFromState();
      ensureStartSetFromBalance();
      initStart();
      renderTable();
    } finally {
      markHydrationTargetReady('startBal');
    }
  }));
  if (startDateRef) listeners.push(onValue(startDateRef, (snap) => {
    const val = snap.exists() ? snap.val() : null;
    if (val === state.startDate) {
      markHydrationTargetReady('startDate');
      return;
    }
    try {
      state.startDate = val;
      try { cacheSet('startDate', state.startDate); } catch (_) {}
      ensureStartSetFromBalance({ persist: false, refresh: false });
      initStart();
      renderTable();
    } finally {
      markHydrationTargetReady('startDate');
    }
  }));
  // Listen for persisted startSet flag changes so remote clears/sets propagate
  if (startSetRef) listeners.push(onValue(startSetRef, (snap) => {
    const val = snap.exists() ? !!snap.val() : false;
    if (val === state.startSet) {
      markHydrationTargetReady('startSet');
      return;
    }
    try {
      state.startSet = val;
      try { cacheSet('startSet', state.startSet); } catch(_) {}
      initStart();
      renderTable();
    } finally {
      markHydrationTargetReady('startSet');
    }
  }));

  profileListeners = listeners;
  };
  startRealtimeFn = startRealtime;

  const readyUser = (window.Auth && window.Auth.currentUser) ? window.Auth.currentUser : null;
  if (readyUser) { 
    console.log('User already ready:', readyUser.email);
    PATH = resolvePathForUser(readyUser); 
    startRealtimeFn && startRealtimeFn(); 
    // Recalcula a altura do header para usuário já logado
    setTimeout(() => recalculateHeaderOffset(), 100);
  } else {
    console.log('Waiting for auth state...');
    
    const h = (e) => {
      const u = e.detail && e.detail.user;
      console.log('Auth state event received:', u ? u.email : 'signed out');
      if (u) { 
        document.removeEventListener('auth:state', h); 
        PATH = resolvePathForUser(u); 
        console.log('Starting realtime with PATH:', PATH);
        startRealtimeFn && startRealtimeFn(); 
        // Recalcula a altura do header agora que o usuário está logado e o header está visível
        setTimeout(() => recalculateHeaderOffset(), 100);
      } else {
        console.log('User signed out, clearing PATH');
        PATH = null;
      }
    };
    document.addEventListener('auth:state', h);
  }
} else {
  resetHydration();
  // Fallback (mock) — carrega uma vez
  const [liveTx, liveCards, liveBal] = await Promise.all([
    load('tx', []),
    load('cards', cards),
    load('startBal', state.startBalance)
  ]);

  const hasLiveTx    = Array.isArray(liveTx)    ? liveTx.length    > 0 : liveTx    && Object.keys(liveTx).length    > 0;
  const hasLiveCards = Array.isArray(liveCards) ? liveCards.length > 0 : liveCards && Object.keys(liveCards).length > 0;

  const fixedTx = Array.isArray(liveTx) ? liveTx : Object.values(liveTx || {});

  transactions = cacheGet('tx', []);
  cards = cacheGet('cards', [{name:'Dinheiro',close:0,due:0}]);
  state.startBalance = cacheGet('startBal', null);
  state.startDate = cacheGet('startDate', null);
  // Same normalization for mock fallback
  if (state.startDate == null && (state.startBalance === 0 || state.startBalance === '0')) {
    state.startBalance = null;
    try { cacheSet('startBal', null); } catch (_) {}
  }

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
  if (liveBal !== state.startBalance) {
    state.startBalance = liveBal;
    cacheSet('startBal', state.startBalance);
    initStart(); renderTable();
  }

  completeHydration();
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

  // Add/remove the existing modal-open class (used by CSS)
  if (open) root.classList.add('modal-open'); else root.classList.remove('modal-open');

  // Prevent viewport jumps on mobile when a modal opens and the on-screen keyboard appears.
  // Approach: save current scroll position and apply a fixed-position lock to the <body> so
  // the browser won't resize/layout the page when visual viewport changes. Restore on close.
  try {
    if (open) {
      if (!root.classList.contains('modal-locked')) {
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        // Apply lock styles to body
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
        // mark locked and persist scroll value on root for restore
        root.classList.add('modal-locked');
        root.dataset.modalScroll = String(scrollY);
      }
    } else {
      if (root.classList.contains('modal-locked')) {
        // restore
        root.classList.remove('modal-locked');
        const prev = parseInt(root.dataset.modalScroll || '0', 10) || 0;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        // ensure we restore the previous scroll position
        window.scrollTo(0, prev);
        try { delete root.dataset.modalScroll; } catch(_) { root.removeAttribute('data-modal-scroll'); }
      }
    }
  } catch (e) {
    // best-effort only; don't break UI if this fails
    console.error('updateModalOpenState lock/unlock failed', e);
  }

  // Safari iOS fix: Force scroll state cleanup when all modals are closed
  // Fixes bug where accordion scroll becomes unresponsive after opening/closing modals
  if (!open && /Safari/i.test(navigator.userAgent) && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    setTimeout(() => {
      // Force a reflow to reset scroll state
      const wrapper = document.querySelector('.wrapper');
      if (wrapper) {
        const currentScrollTop = wrapper.scrollTop;
        wrapper.style.overflow = 'hidden';
        wrapper.offsetHeight; // Force reflow
        wrapper.style.overflow = 'auto';
        wrapper.scrollTop = currentScrollTop;
      }
    }, 50);
  }
}
if (closeTxModal) closeTxModal.onclick = toggleTxModal;
if (txModal) {
  txModal.onclick = (e) => {
    if (e.target === txModal) toggleTxModal();
  };
}
// Botão Home: centraliza o dia atual, mantendo-o colapsado
const homeBtn = document.getElementById('scrollTodayBtn');
//const settingsModalEl = document.getElementById('settingsModal');
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
      if (action === 'home') {
        scrollTodayIntoView();
      } else if (action === 'settings') {
        // Use openSettings() which renders the theme selector (renderSettingsModal)
        openSettings();
        updateModalOpenState();
      }
    });
  });
  window.addEventListener('resize', updateHighlight);
  setTimeout(updateHighlight, 60);
})();

// Settings modal close handlers
if (closeSettingsModal) closeSettingsModal.onclick = () => { settingsModalEl.classList.add('hidden'); updateModalOpenState(); };
if (settingsModalEl) settingsModalEl.onclick = (e) => { if (e.target === settingsModalEl) { settingsModalEl.classList.add('hidden'); updateModalOpenState(); } };

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
  if (!settingsModalEl) return;
  const box = settingsModalEl.querySelector('.modal-content');
  if (!box) return;
  // Get profile (auth → cache; fallback cache)
  let prof = getProfileFromAuth();
  if (prof && prof.email) persistProfile(prof);
  if (!prof) prof = loadCachedProfile() || { name:'', email:'', photo:'' };

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
  const listHTML = `
    <div class="settings-list">
      <div class="settings-item danger">
        <button id="logoutBtn" class="settings-cta">
          <span class="settings-icon icon-logout"></span>
          <span>Sair da conta</span>
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
    settingsModalEl.classList.add('hidden');
    updateModalOpenState();
    // UI overlay de login aparece via auth state
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

// Safari iOS fix: Force scroll state cleanup when no modals are open
let lastModalState = false;
function resetScrollStateIfNeeded() {
  const currentModalState = anyModalOpen();
  if (lastModalState && !currentModalState) {
    // Modal was just closed - force scroll cleanup for Safari iOS
    if (/Safari/i.test(navigator.userAgent) && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      setTimeout(() => {
        // Force a reflow to reset scroll state
        const wrapper = document.querySelector('.wrapper');
        if (wrapper) {
          const currentScrollTop = wrapper.scrollTop;
          wrapper.style.overflow = 'hidden';
          wrapper.offsetHeight; // Force reflow
          wrapper.style.overflow = 'auto';
          wrapper.scrollTop = currentScrollTop;
        }
      }, 50);
    }
  }
  lastModalState = currentModalState;
}

// Allow scroll inside modal content; block background scroll only
document.addEventListener('touchmove', (e) => {
  resetScrollStateIfNeeded();
  if (!anyModalOpen()) return;
  const target = e.target;
  if (isInScrollableModal(target)) return; // allow natural scroll in modal
  e.preventDefault();
}, { passive: false });
document.addEventListener('wheel', (e) => {
  resetScrollStateIfNeeded();
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
  const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  let keyboardOpen = false;
  let closeTimer = null;

  const applyKeyboardOpen = (gap) => {
    keyboardOpen = true;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (root) {
      root.dataset.vvKb = '1';
      root.classList.add('keyboard-open');
      root.style.setProperty('--kb-offset-bottom', Math.max(0, Math.round(gap)) + 'px');
    }
  };

  const applyKeyboardClosed = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      keyboardOpen = false;
      if (root) {
        delete root.dataset.vvKb;
        root.classList.remove('keyboard-open');
        root.style.removeProperty('--kb-offset-bottom');
      }
      flushKeyboardDeferredTasks();
    }, 200);
  };

  const update = () => {
    const gap = (window.innerHeight || 0) - ((vv.height || 0) + (vv.offsetTop || 0));
    const isKb = IS_IOS && gap > THRESH;
    if (isKb) {
      applyKeyboardOpen(gap);
    } else {
      if (keyboardOpen || root?.dataset?.vvKb === '1') {
        applyKeyboardClosed();
      }
    }
  };

  const scheduleUpdate = (delay = 0) => {
    if (delay <= 0) {
      scheduleAfterKeyboard(update);
    } else {
      setTimeout(() => scheduleAfterKeyboard(update), delay);
    }
  };

  update();
  vv.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => scheduleUpdate(160));
  window.addEventListener('focusin', () => scheduleUpdate());
  window.addEventListener('focusout', () => scheduleUpdate(220));
})();




const currency = (v) => safeFmtCurrency(v);
const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
// Palavras que caracterizam “salário”
const SALARY_WORDS = ['salário', 'salario', 'provento', 'rendimento', 'pagamento', 'paycheck', 'salary'];
const mobile = () => window.innerWidth <= 480;
const fmt = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('pt-BR', mobile()
    ? { day: '2-digit', month: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }
  );
};

// ---------------------------------------------------------------------------
// Sticky month header  (Safari/iOS não suporta <summary> sticky)
// ---------------------------------------------------------------------------
const headerEl      = document.querySelector('.app-header');
let HEADER_OFFSET = headerEl ? headerEl.getBoundingClientRect().height : 58;
const STICKY_VISIBLE = 18;
let stickyMonth = null; // Não cria imediatamente

// Função para criar o sticky header somente quando necessário
function createStickyMonth() {
  if (stickyMonth) return; // Já foi criado
  
  stickyMonth = document.createElement('div');
  stickyMonth.className = 'sticky-month';
  stickyMonth.style.top = (HEADER_OFFSET - STICKY_VISIBLE) + 'px';
  document.body.appendChild(stickyMonth);
}

// Função para recalcular e atualizar a altura do header
function recalculateHeaderOffset() {
  if (!headerEl) return;
  // If visualViewport keyboard flag is set, avoid recalculating header offsets
  // to prevent UI from 'jumping' when the OS on-screen keyboard resizes the viewport.
  try {
    if (document.documentElement?.dataset?.vvKb === '1') {
      scheduleAfterKeyboard(recalculateHeaderOffset);
      return;
    }
  } catch(_) {}
  const h = headerEl.getBoundingClientRect().height;
  
  // Só cria e posiciona o sticky quando o header tiver altura real (> 30px)
  if (h > 30) {
    HEADER_OFFSET = h;
    
    // Cria o sticky se ainda não existir
    if (!stickyMonth) {
      createStickyMonth();
    }
    
    // Atualiza a posição
    if (stickyMonth) {
      stickyMonth.style.top = (HEADER_OFFSET - STICKY_VISIBLE) + 'px';
      // Atualiza o sticky imediatamente após recalcular
      updateStickyMonth();
    }
  }
}

// Recalcula altura do header em rotação / resize
window.addEventListener('resize', recalculateHeaderOffset);

function updateStickyMonth() {
  // Não faz nada se o sticky header ainda não foi criado
  if (!stickyMonth) return;
  
  let label = '';
  let lastDiv = null;
  const divs = document.querySelectorAll('summary.month-divider');
  divs.forEach(div => {
    const rect = div.getBoundingClientRect();
    // choose the last divider whose top passed the header
    if (rect.top <= HEADER_OFFSET) {
      label = div.textContent.replace(/\s+/g, ' ').trim();
      lastDiv = div;
    }
  });
  if (label) {
    // Use the last matching divider element to determine month index/year
    let monthText = '';
    try {
      if (lastDiv) {
        const det = lastDiv.closest('details.month');
        if (det && det.dataset && det.dataset.key) {
          const parts = det.dataset.key.split('-');
          const mIdx = Number(parts[1]);
          if (!Number.isNaN(mIdx)) {
            const dt = new Date(VIEW_YEAR, mIdx, 1);
            monthText = dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            if (monthText && monthText.length) monthText = monthText.charAt(0).toUpperCase() + monthText.slice(1);
          }
        }
      }
    } catch (_) {}
    // Fallback: use the first word from label if anything goes wrong
    if (!monthText) monthText = label.split(/\s+/)[0];
    stickyMonth.textContent = monthText;
    stickyMonth.classList.add('visible');
  } else {
    stickyMonth.classList.remove('visible');
  }
}

// Atualiza stickyMonth ao rolar o container principal
if (wrapperEl) wrapperEl.addEventListener('scroll', updateStickyMonth);
else window.addEventListener('scroll', updateStickyMonth);

// Observer para detectar quando os elementos month-divider são adicionados ao DOM
// e recalcular o header offset se necessário
const observer = new MutationObserver(() => {
  // Quando novos elementos são adicionados, o header pode ter mudado de tamanho
  const hasMonthDividers = document.querySelectorAll('summary.month-divider').length > 0;
  if (hasMonthDividers) {
    setTimeout(() => recalculateHeaderOffset(), 50);
  }
});

// Observa mudanças no container principal onde os meses são renderizados
if (wrapperEl) {
  observer.observe(wrapperEl, { childList: true, subtree: true });
} else if (tbody) {
  observer.observe(tbody.parentElement || document.body, { childList: true, subtree: true });
}

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

// Auto-format value input using the active currency profile while typing
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
  const activeToggle = document.querySelector('.value-toggle button.active');
  const signedValue = (activeToggle && activeToggle.dataset.type === 'expense') ? -numberValue : numberValue;
  val.value = safeFmtNumber(signedValue, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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
    const signedValue = btn.dataset.type === 'expense' ? -numberValue : numberValue;
    val.value = safeFmtNumber(signedValue, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
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
if (startInput) startInputRef = startInput;

function syncStartInputFromState() {
  const input = startInputRef || document.getElementById('startInput');
  if (!input) return;
  if (!startInputRef && input) startInputRef = input;
  if (state.startBalance == null || Number.isNaN(Number(state.startBalance))) {
    input.value = '';
    return;
  }
  try {
    input.value = safeFmtCurrency(state.startBalance, { forceNew: true });
  } catch (_) {
    input.value = String(state.startBalance);
  }
}

function ensureStartSetFromBalance(options = {}) {
  const { persist = true, refresh = true } = options;
  if (state.startSet === true) return;
  if (state.startBalance == null || Number.isNaN(Number(state.startBalance))) return;
  state.startSet = true;
  try { cacheSet('startSet', true); } catch (_) {}
  if (persist && typeof save === 'function' && PATH) {
    Promise.resolve().then(() => save('startSet', true)).catch(() => {});
  }
  if (refresh) {
    try { initStart(); } catch (_) {}
  }
}

// Função reutilizável que executa o reset (confirm dentro da função por padrão)
async function performResetAllData(askConfirm = true) {
  if (askConfirm && !confirm('Deseja realmente APAGAR TODOS OS DADOS? Esta ação é irreversível.')) return;
  try {
    // Clear in-memory
    transactions = [];
    cards = [{ name: 'Dinheiro', close: 0, due: 0 }];
    state.startBalance = null;
    state.startDate = null;
  state.startSet = false;
    syncStartInputFromState();

    // Clear caches (best-effort)
    try { cacheSet('tx', transactions); } catch (_) {}
    try { cacheSet('cards', cards); } catch (_) {}
    try { cacheSet('startBal', state.startBalance); } catch (_) {}
    try { cacheSet('startDate', state.startDate); } catch (_) {}
    try { cacheSet('dirtyQueue', []); } catch (_) {}

    // Try persist (best effort)
    try { await save('tx', transactions); } catch (_) {}
    try { await save('cards', cards); } catch (_) {}
    try { await save('startBal', state.startBalance); } catch (_) {}
    try { await save('startDate', state.startDate); } catch (_) {}
  try { cacheSet('startSet', false); } catch (_) {}
  try { await save('startSet', false); } catch (_) {}

    // Rerender
    refreshMethods(); renderCardList(); initStart(); renderTable();
    showToast('Todos os dados foram apagados.', 'success');
  } catch (err) {
    console.error('Erro ao limpar dados:', err);
    showToast('Erro ao apagar dados. Veja console.', 'error');
  }
}

// Mostra o botão original "Limpar tudo" no fim do acordeão (se existir) e anexa handler
if (resetBtn) {
  resetBtn.hidden = false;
  resetBtn.style.display = '';
  resetBtn.addEventListener('click', () => performResetAllData(true));
}

// Cria um botão flutuante fixo para "Limpar tudo" (sem tocar no HTML original)
(function createFloatingResetButton(){
  try {
    // Avoid creating multiple times
    if (document.getElementById('resetDataFloat')) return;
    const btn = document.createElement('button');
    btn.id = 'resetDataFloat';
    btn.type = 'button';
    btn.className = 'danger reset-float';
    btn.title = 'Limpar tudo';
    btn.textContent = 'Limpar tudo';
    // Inline styles to ensure visibility regardless of CSS
    Object.assign(btn.style, {
      position: 'fixed',
      left: '16px',
      bottom: '94px',
      zIndex: '10000',
      padding: '10px 12px',
      background: '#c53030',
      color: '#fff',
      border: 'none',
      borderRadius: '10px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      cursor: 'pointer',
      fontWeight: '600'
    });

    btn.addEventListener('click', () => performResetAllData(true));

    // Only append when body is ready
    if (document.body) document.body.appendChild(btn);
    else window.addEventListener('load', () => { document.body.appendChild(btn); });
  } catch (_) {}
})();
// Auto-format initial balance input using the active currency profile
if (startInput) {
  startInput.addEventListener('input', () => {
    const digits = startInput.value.replace(/\D/g, '');
    if (!digits) {
      startInput.value = '';
      return;
    }
    const numberValue = parseInt(digits, 10) / 100;
    startInput.value = safeFmtCurrency(numberValue);
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
  const master = transactions.find(x => sameId(x.id, id));
  const shouldRefreshPlannedModal = plannedModal && !plannedModal.classList.contains('hidden');
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
  if (shouldRefreshPlannedModal) {
    try { renderPlannedModal(); } catch (err) { console.error('renderPlannedModal failed', err); }
  }
  // restaura faturas que o usuário tinha expandido
  openInvoices.forEach(pd => {
    const det = document.querySelector(`details.invoice[data-pd="${pd}"]`);
    if (det) det.open = true;
  });

  // mostra o toast por último, já com a tela renderizada
  if (toastMsg) notify(toastMsg, 'success');
};

function openEditFlow(tx, iso) {
  if (!tx) return;
  const hasRecurrence = (() => {
    if (tx.recurrence && tx.recurrence.trim()) return true;
    if (tx.parentId) {
      const parent = transactions.find(p => p.id === tx.parentId);
      if (parent && parent.recurrence && parent.recurrence.trim()) return true;
    }
    for (const p of transactions) {
      if (!p.recurrence || !p.recurrence.trim()) continue;
      if (!occursOn(p, iso)) continue;
      const sameMethod = (p.method || '') === (tx.method || '');
      const sameDesc   = (p.desc || '') === (tx.desc || '');
      const sameVal    = Math.abs(Number(p.val || 0) - Number(tx.val || 0)) < 0.005;
      if (sameMethod && (sameDesc || sameVal)) return true;
    }
    return false;
  })();

  const performEdit = (id) => {
    reopenPlannedAfterEdit = !!(plannedModal && !plannedModal.classList.contains('hidden'));
    if (reopenPlannedAfterEdit) {
      plannedModal.classList.add('hidden');
      updateModalOpenState();
    }
    if (isDetachedOccurrence(tx)) pendingEditMode = null;
    editTx(id);
  };

  // helper to open recurrence modal safely
  const showRecurrenceModal = (id) => {
    pendingEditTxId  = id;
    pendingEditTxIso = iso || tx.opDate;
    reopenPlannedAfterEdit = !!(plannedModal && !plannedModal.classList.contains('hidden'));
    if (reopenPlannedAfterEdit) {
      plannedModal.classList.add('hidden');
      updateModalOpenState();
    }
    editRecurrenceModal.classList.remove('hidden');
    updateModalOpenState();
  };

  if (tx.recurrence || (hasRecurrence && !tx.recurrence && !tx.parentId)) {
    showRecurrenceModal(tx.id);
    return;
  }

  performEdit(tx.id);
}

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
  // Desired layout:
  // [centered] Card name
  // [calendar icon] Fechamento          DD
  // [clock icon]    Vencimento         DD
  // SVGs use currentColor so they render in black/white depending on CSS.
  content.innerHTML = `
    <div class="card-name" style="text-align:center;margin:6px 0; font-weight:700">${escHtml(card.name)}</div>
    <div class="card-detail" style="display:flex;align-items:center;gap:8px;padding:4px 0;color:currentColor">
      <span class="card-icon" style="width:20px;display:inline-flex;align-items:center;color:currentColor">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1 .9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1 -.9-2-2-2zm0 16H5V9h14v11z"/>
        </svg>
      </span>
      <span class="card-label" style="flex:0 0 auto">Fechamento</span>
      <span class="card-value" style="margin-left:auto;font-weight:600">${escHtml(String(card.close))}</span>
    </div>
    <div class="card-detail" style="display:flex;align-items:center;gap:8px;padding:4px 0;color:currentColor">
      <span class="card-icon" style="width:20px;display:inline-flex;align-items:center;color:currentColor">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d="M12 20c4.41 0 8-3.59 8-8s-3.59-8 -8-8 -8 3.59 -8 8 3.59 8 8 8zm0-14c3.31 0 6 2.69 6 6s-2.69 6 -6 6 -6-2.69 -6-6 2.69-6 6-6zm.5 3H11v5l4.25 2.52 .75-1.23 -3.5-2.04V9z"/>
        </svg>
      </span>
      <span class="card-label" style="flex:0 0 auto">Vencimento</span>
      <span class="card-value" style="margin-left:auto;font-weight:600">${escHtml(String(card.due))}</span>
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
  // Resolve list element at call time in case modal DOM is created later.
  let ul = document.getElementById('cardList') || cardList || null;
  if (!ul && cardModal) ul = cardModal.querySelector('#cardList');
  if (!ul) return; // no DOM to render into yet

  try { console.debug && console.debug('renderCardList called, ul=', ul, 'cardsCount=', (cards||[]).length); } catch(_) {}

  ul.innerHTML = '';
  const visibleCards = cards.filter(card => card.name !== 'Dinheiro');
  if (!visibleCards.length) {
    // Show a clear empty state so it's obvious the list is empty (data issue)
    const emptyLi = document.createElement('li');
    emptyLi.className = 'card-empty';
    emptyLi.textContent = 'Nenhum cartão cadastrado';
    ul.appendChild(emptyLi);
  } else {
    visibleCards.forEach(card => {
      const li = createCardListItem(card);
      ul.appendChild(li);
    });
  }
  // Ensure swipe is initialized for this root (safe guard)
  try { if (ul) initSwipe(ul, '.swipe-wrapper', '.swipe-actions', '.card-line', 'cardsSwipeInit'); } catch (_) {}
}
// Helper: returns true if this record is a detached (single‑edited) occurrence
function isDetachedOccurrence(tx) {
  return !tx.recurrence && !!tx.parentId;
}

function makeLine(tx, disableSwipe = false, isInvoiceContext = false) {
  // Create swipe wrapper
  const wrap = document.createElement('div');
  wrap.className = 'swipe-wrapper';

  // Create actions container
  const actions = document.createElement('div');
  actions.className = 'swipe-actions';

  const existsInStore = transactions.some(item => item && String(item.id) === String(tx.id));
  const actionTargetId = existsInStore ? tx.id : (tx.parentId || tx.id);
  const actionTargetTx = transactions.find(item => item && String(item.id) === String(actionTargetId)) || tx;

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'icon edit';
  editBtn.textContent = '';
  const editIconDiv = document.createElement('div');
  editIconDiv.className = 'icon-action icon-edit';
  editBtn.appendChild(editIconDiv);
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditFlow(actionTargetTx, tx.opDate);
  });
  actions.appendChild(editBtn);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'icon danger delete';
  delBtn.textContent = '';
  const delIconDiv = document.createElement('div');
  delIconDiv.className = 'icon-action icon-delete';
  delBtn.appendChild(delIconDiv);
  delBtn.onclick = () => delTx(actionTargetId, tx.opDate);
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

  const appendInvoiceBadge = (target) => {
    if (!target || !tx.invoicePayment) return;
    const badge = document.createElement('span');
    badge.className = 'invoice-payment-badge';
    badge.textContent = 'Pagamento de fatura';
    target.appendChild(badge);
  };

  // Build timestamp text so we can place it under the description
  const ts = document.createElement('div');
  ts.className = 'timestamp';
  (function buildTimestamp(){
    const [y, mo, da] = (tx.opDate || '').split('-').map(Number);
    const dateObj = (isFinite(y) && isFinite(mo) && isFinite(da)) ? new Date(y, mo - 1, da) : new Date();
    const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    let methodLabel = tx.method === 'Dinheiro' ? 'Dinheiro' : `Cartão ${tx.method}`;
    if (tx.method !== 'Dinheiro' && !tx.planned && tx.postDate !== tx.opDate && !isInvoiceContext) {
      const [, pmm, pdd] = (tx.postDate || '').split('-');
      if (pdd && pmm) methodLabel += ` → Fatura ${pdd}/${pmm}`;
    }
    if (tx.planned) {
      ts.textContent = `${dateStr} - ${methodLabel}`;
    } else if (isInvoiceContext) {
      // In invoice view we want a compact timestamp showing only the time (HH:MM) when available
      if (tx.ts) {
        const timeOnly = new Date(tx.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
        ts.textContent = `${timeOnly}`;
      } else {
        // Fallback to short date if there's no precise timestamp
        ts.textContent = `${dateStr}`;
      }
    } else if (tx.opDate === todayISO() && tx.ts) {
      const timeStr = new Date(tx.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
      ts.textContent = `${timeStr} - ${methodLabel}`;
    } else {
      ts.textContent = `${dateStr} - ${methodLabel}`;
    }
  })();

  // --- Planned modal disables swipe, needs different structure ---
  if (disableSwipe === true) {
    // If planned, build checkbox and label
    if (tx.planned) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'plan-check';
      checkbox.name = 'planned';
      checkbox.onchange = (ev) => {
        ev.stopPropagation();
        togglePlanned(actionTargetId, tx.opDate);
      };
      const labelWrapper = document.createElement('span');
      labelWrapper.textContent = tx.desc;
      const leftText = document.createElement('div');
      leftText.className = 'left-text';
      const titleRow = document.createElement('div');
      titleRow.className = 'left-title';
      titleRow.appendChild(labelWrapper);
      appendInvoiceBadge(titleRow);
      leftText.appendChild(titleRow);
      leftText.appendChild(ts);
      left.appendChild(checkbox);
      left.appendChild(leftText);
    } else {
      const descNode = document.createElement('span');
      descNode.textContent = tx.desc;
      const leftText = document.createElement('div');
      leftText.className = 'left-text';
      const titleRow = document.createElement('div');
      titleRow.className = 'left-title';
      titleRow.appendChild(descNode);
      appendInvoiceBadge(titleRow);
      leftText.appendChild(titleRow);
      leftText.appendChild(ts);
      left.appendChild(leftText);
    }
    // Recurrence icon
    const t = tx;
    const hasRecurrence = (() => {
      if (typeof t.recurrence === 'string' && t.recurrence.trim() !== '') return true;
      if (t.parentId) {
        const master = transactions.find(p => sameId(p.id, t.parentId));
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
      const tgt = left.querySelector('.left-title') || left;
      tgt.appendChild(recIcon);
    }
    if (!left.querySelector('.icon-repeat')) {
      const t = tx;
      const hasRecurrenceFinal =
        (typeof t.recurrence === 'string' && t.recurrence.trim() !== '') ||
        (t.parentId && transactions.some(p =>
          sameId(p.id, t.parentId) &&
          typeof p.recurrence === 'string' &&
          p.recurrence.trim() !== ''
        ));
      if (hasRecurrenceFinal) {
        const recIc = document.createElement('span');
        recIc.className = 'icon-repeat';
        const tgt = left.querySelector('.left-title') || left;
        tgt.appendChild(recIc);
      }
    }
  } else {
    // Default structure (swipe enabled)
    if (tx.planned) {
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'plan-check';
      chk.name = 'planned';
      chk.onchange = (ev) => {
        ev.stopPropagation();
        togglePlanned(actionTargetId, tx.opDate);
      };
      left.appendChild(chk);
    }
    const descNode = document.createElement('span');
    descNode.textContent = tx.desc;
    const leftText = document.createElement('div');
    leftText.className = 'left-text';
    const titleRow = document.createElement('div');
    titleRow.className = 'left-title';
    titleRow.appendChild(descNode);
    appendInvoiceBadge(titleRow);
    leftText.appendChild(titleRow);
    leftText.appendChild(ts);
    left.appendChild(leftText);
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
      const tgt = left.querySelector('.left-title') || left;
      tgt.appendChild(recIcon);
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
        const tgt = left.querySelector('.left-title') || left;
        tgt.appendChild(recIc);
      }
    }
  }

  const right = document.createElement('div');
  right.className = 'op-right';
  const value = document.createElement('span');
  value.className = 'value';
  value.textContent = safeFmtCurrency(tx.val, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (tx.val < 0) {
    value.classList.add('negative');
  } else {
    value.classList.add('positive');
  }
  right.appendChild(value);
  topRow.appendChild(left);
  topRow.appendChild(right);
  d.appendChild(topRow);

  // Timestamp now lives under description inside left-text

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
  // Ensure the value toggle reflects expense/receipt and keeps the formatted sign
  document.querySelectorAll('.value-toggle button').forEach(b => b.classList.remove('active'));
  const expBtn = document.querySelector('.value-toggle button[data-type="expense"]');
  if (expBtn) expBtn.classList.add('active');
  const rem = Number(remaining) || 0;
  val.value = safeFmtNumber(-rem, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      val.value = safeFmtNumber(-per, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      parcelasBlock.classList.add('hidden');
      installments.disabled = true;
      recurrence.value = '';
      installments.value = '1';
      // Restore full remaining amount to value field
      const ctx = pendingInvoiceCtx || {};
      const base = Math.abs(Number(ctx.remaining) || 0);
      val.value = safeFmtNumber(-base, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    val.value = safeFmtNumber(-per, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    let newVal = safeParseCurrency(val.value) || 0;
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
            ? transactions.find(tx => sameId(tx.id, t.parentId))
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
    const formattedVal = safeFmtCurrency(safeParseCurrency(val.value));
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
    const rawVal = safeParseCurrency(val.value) || 0;
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

  if (state.startBalance === null) {
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
  let v = safeParseCurrency(val.value) || 0;
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
  // Recupera última transação para mensagem
  let last = transactions[transactions.length - 1];
  const formattedVal = last && typeof last.val === 'number'
    ? safeFmtCurrency(last.val)
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
  return cards.find(c => sameId(c.id, id) || c.name === id) || null;
}

// Função utilitária para formatar data ISO (YYYY-MM-DD)
function formatDateISO(date) {
  if (!(date instanceof Date)) return '';
  return date.toISOString().slice(0,10);
}

// Delete a transaction (with options for recurring rules)
function delTx(id, iso) {
  const t = transactions.find(x => sameId(x.id, id));
  if (!t) return;

  // Se NÃO for recorrente (nem ocorrência destacada), exclui direto
  if (!t.recurrence && !t.parentId) {
    transactions = transactions.filter(x => !sameId(x.id, id));
    save('tx', transactions);
    renderTable();
    if (plannedModal && !plannedModal.classList.contains('hidden')) {
      try { renderPlannedModal(); } catch (err) { console.error('renderPlannedModal failed', err); }
    }
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
    const parent = transactions.find(p => sameId(p.id, tx.parentId));
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
  const tx = transactions.find(t => sameId(t.id, pendingDeleteTxId));
  const iso = pendingDeleteTxIso;
  const refreshPlannedModal = plannedModal && !plannedModal.classList.contains('hidden');
  if (!tx) { closeDeleteModal(); return; }
  const master = findMasterRuleFor(tx, iso);
  if (master) {
    master.exceptions = master.exceptions || [];
    if (!master.exceptions.includes(iso)) master.exceptions.push(iso);
    // Remove any materialized child occurrence for this exact date
    // This covers cases where the occurrence was previously edited/created
    // as a standalone item (with parentId) and would otherwise remain visible.
    transactions = transactions.filter(x => !(sameId(x.parentId, master.id) && x.opDate === iso));
    showToast('Ocorrência excluída!', 'success');
  } else {
    // fallback: not a recurrence → hard delete
    transactions = transactions.filter(x => !sameId(x.id, tx.id));
    showToast('Operação excluída.', 'success');
  }
  save('tx', transactions);
  renderTable();
  if (refreshPlannedModal) {
    try { renderPlannedModal(); } catch (err) { console.error('renderPlannedModal failed', err); }
  }
  closeDeleteModal();
};

deleteFutureBtn.onclick = () => {
  const tx = transactions.find(t => sameId(t.id, pendingDeleteTxId));
  const iso = pendingDeleteTxIso;
  const refreshPlannedModal = plannedModal && !plannedModal.classList.contains('hidden');
  if (!tx) { closeDeleteModal(); return; }
  const master = findMasterRuleFor(tx, iso);
  if (master) {
    master.recurrenceEnd = iso;
  showToast('Esta e futuras excluídas!', 'success');
  } else {
    // fallback: not a recurrence → delete only this occurrence
    transactions = transactions.filter(x => !sameId(x.id, tx.id));
    showToast('Operação excluída.', 'success');
  }
  save('tx', transactions);
  renderTable();
  if (refreshPlannedModal) {
    try { renderPlannedModal(); } catch (err) { console.error('renderPlannedModal failed', err); }
  }
  closeDeleteModal();
};

deleteAllBtn.onclick = () => {
  const tx = transactions.find(t => sameId(t.id, pendingDeleteTxId));
  if (!tx) { closeDeleteModal(); return; }
  const master = findMasterRuleFor(tx, pendingDeleteTxIso) || tx;
  // Remove both master rule and any occurrences with parentId
  transactions = transactions.filter(t => !sameId(t.id, master.id) && !sameId(t.parentId, master.id));
  const refreshPlannedModal = plannedModal && !plannedModal.classList.contains('hidden');
  save('tx', transactions);
  renderTable();
  if (refreshPlannedModal) {
    try { renderPlannedModal(); } catch (err) { console.error('renderPlannedModal failed', err); }
  }
  closeDeleteModal();
  showToast('Todas as recorrências excluídas!', 'success');
};

// Modal Editar Recorrência handlers
function closeEditModal() {
  editRecurrenceModal.classList.add('hidden');
  updateModalOpenState();
  if (reopenPlannedAfterEdit && plannedModal) {
    reopenPlannedAfterEdit = false;
    renderPlannedModal();
    plannedModal.classList.remove('hidden');
    updateModalOpenState();
  }
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
    const signedVal = Number(t.val || 0);
    valInput.value = safeFmtNumber(signedVal, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  document.querySelectorAll('.value-toggle button').forEach(b => b.classList.remove('active'));
  const type = (Number(t.val || 0) < 0) ? 'expense' : 'income';
  const typeBtn = document.querySelector(`.value-toggle button[data-type="${type}"]`);
  if (typeBtn) typeBtn.classList.add('active');
  if (type !== 'expense' && valInput) {
    // Ensure positive numbers don't keep stray negatives
    valInput.value = valInput.value.replace(/^-/, '');
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
  if (isHydrating()) {
    const accSk = document.getElementById('accordion');
    if (accSk) accSk.dataset.state = 'skeleton';
    return;
  }
  clearTableContent();
  const acc = document.getElementById('accordion');
  if (acc) acc.dataset.state = 'skeleton';
  const groups = groupTransactionsByMonth();
  renderTransactionGroups(groups);
  if (acc) delete acc.dataset.state;
  
  // Tenta criar o sticky header após renderizar conteúdo
  setTimeout(() => recalculateHeaderOffset(), 100);
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
// Helper function to get all transactions of a specific ISO date
function txByDate(iso) {
  const list = [];
  const today = todayISO();

  // ================= NON-RECURRING =================
  // Helper to map legacy/invalid methods to a valid card name when possible
  const nrm = s => (s==null?'' : String(s)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const nonCashCards = (cards || []).filter(c => c && c.name !== 'Dinheiro');
  const singleCard = nonCashCards.length === 1 ? nonCashCards[0].name : null;
  const resolveCard = (m) => {
    const mNorm = nrm(m);
    if (!m || mNorm === 'dinheiro') return null;
    const found = (cards || []).find(c => c && nrm(c.name) === mNorm);
    if (found) return found.name;
    // If exactly one card exists, use it as a safe fallback
    if (singleCard) return singleCard;
    return null;
  };
  transactions.forEach(t => {
    if (t.recurrence) return;            // só não-recorrentes aqui
    if (t.opDate !== iso) return;        // renderiza sempre no opDate
    // Oculta movimentos internos da fatura (pagamento/ajuste)
    if (t.invoiceAdjust) return;

    if (t.method !== 'Dinheiro') {
      // CARTÃO
      if (t.planned) {
        // planejada → aparece no dia lançado (opDate)
        const em = resolveCard(t.method) || t.method;
        const pd = post(t.opDate, em);
        list.push({ ...t, method: em, postDate: pd });
      } else {
        // executada → aparece no dia do lançamento E também na fatura (dupla visibilidade)
        const em = resolveCard(t.method) || t.method;
        const pd = post(t.opDate, em);
        list.push({ ...t, method: em, postDate: pd });
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

      const em = resolveCard(master.method) || master.method;
      const pd = post(iso, em);
      const plannedFlag = iso > today;    // futuro → planejada; passado/hoje → executada

      if (master.method !== 'Dinheiro') {
        // CARTÃO recorrente
        if (plannedFlag) {
          // planejada → aparece no opDate
          list.push({
            ...master,
            opDate: iso,
            method: em,
            postDate: pd,
            planned: true,
            recurrence: ''
          });
        } else {
          // executada → aparece no dia do lançamento E também na fatura (dupla visibilidade)
          list.push({
            ...master,
            opDate: iso,
            method: em,
            postDate: pd,
            planned: false,
            recurrence: ''
          });
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
}

// ===================== YEAR SELECTOR =====================

// Detecta anos disponíveis nas transações
function getAvailableYears() {
  // Calendar-like year provider: return a wide, predictable range so user
  // can navigate like a calendar. We avoid generating an extremely large
  // DOM by returning a reasonable window, and the modal provides controls
  // to page earlier/later if needed.
  const currentYear = new Date().getFullYear();
  const MIN_YEAR = 0; // allow going back to year 0 as requested
  const FUTURE_PADDING = 50; // years into the future to allow by default
  const MAX_YEAR = currentYear + FUTURE_PADDING;

  const years = [];
  for (let y = MAX_YEAR; y >= MIN_YEAR; y--) years.push(y);
  return years;
}

// Atualiza o título com o ano atual
function updateYearTitle() {
  const logoText = document.querySelector('.logo-text');
  if (logoText) {
    // Keep visual text identical but expose current year via attributes for accessibility
    logoText.textContent = 'Gastos+';
    // attach data and aria attributes so behavior can be added without changing visuals
    const parentBtn = logoText.closest('#yearSelector');
    if (parentBtn) {
      parentBtn.setAttribute('data-year', String(VIEW_YEAR));
      parentBtn.setAttribute('aria-label', `Gastos mais - ano ${VIEW_YEAR}`);
      // ensure the element is focusable for keyboard handling
      if (!parentBtn.hasAttribute('tabindex')) parentBtn.setAttribute('tabindex', '0');
    }
  }
}

// Abre o modal de seleção de ano
function openYearModal() {
  const modal = document.getElementById('yearModal');
  const yearList = document.getElementById('yearList');
  
  if (!modal || !yearList) return;
  
  // Limpa a lista
  yearList.innerHTML = '';
  
  // Força recálculo dos anos disponíveis
  const availableYears = getAvailableYears();
  
  // Se ainda só tem o ano atual, força a inclusão de anos com transações
  if (availableYears.length === 1 && transactions.length > 0) {
    const extraYears = new Set(availableYears);
    
    // Busca anos em todas as transações de forma mais agressiva
    transactions.forEach(tx => {
      // Verifica todas as propriedades que podem conter data
      Object.values(tx).forEach(value => {
        if (typeof value === 'string') {
          // Regex para encontrar anos de 4 dígitos
          const yearMatch = value.match(/\b(20[2-9][0-9])\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            if (year >= 2020 && year <= 2035) {
              extraYears.add(year);
            }
          }
          
          // Verifica formato de data DD/MM/YYYY
          const dateMatch = value.match(/\b\d{1,2}\/\d{1,2}\/(20[2-9][0-9])\b/);
          if (dateMatch) {
            const year = parseInt(dateMatch[1]);
            extraYears.add(year);
          }
        }
      });
    });
    
    availableYears.length = 0;
    availableYears.push(...Array.from(extraYears).sort((a, b) => b - a));
  }
  
  availableYears.forEach(year => {
    const yearItem = document.createElement('div');
    yearItem.className = 'year-item';
    if (year === VIEW_YEAR) {
      yearItem.classList.add('current');
    }
    yearItem.textContent = year;
    
    yearItem.addEventListener('click', () => {
      selectYear(year);
      closeYearModal();
    });
    
    yearList.appendChild(yearItem);
  });
  
  // Open modal (make visible) before scrolling so measurements work
  modal.classList.remove('hidden');
  updateModalOpenState();

  // After the list is populated, ensure the currently selected year is
  // vertically centered in the scrollable yearList. Use scrollIntoView
  // with block: 'center' for broad browser support.
  // Delay slightly to allow CSS transitions/layout to settle in some browsers.
  requestAnimationFrame(() => {
    const active = yearList.querySelector('.year-item.current');
    if (active) {
      try {
        active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      } catch (e) {
        // Fallback: manual centering
        const container = yearList;
        const containerRect = container.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const offset = (activeRect.top + activeRect.height / 2) - (containerRect.top + container.clientHeight / 2);
        container.scrollTop += offset;
      }
    }
  });
}

// Fecha o modal de seleção de ano
function closeYearModal() {
  const modal = document.getElementById('yearModal');
  if (modal) {
    modal.classList.add('hidden');
    updateModalOpenState();
  }
}

// Seleciona um ano e atualiza a interface
function selectYear(year) {
  VIEW_YEAR = year;
  updateYearTitle();
  renderTable(); // Re-renderiza com o novo ano
}

// Calcula o range real de datas baseado nas transações
function calculateDateRange() {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    // Se não há transações, usa range padrão do ano selecionado (VIEW_YEAR)
    const year = typeof VIEW_YEAR === 'number' ? VIEW_YEAR : new Date().getFullYear();
    return {
      minDate: `${year}-01-01`,
      maxDate: `${year}-12-31`
    };
  }

  let minDate = null;
  let maxDate = null;

  // Analisa todas as transações (incluindo recorrências expandidas)
  const allExpandedTx = [];
  
  transactions.forEach(tx => {
    if (!tx.recurrence) {
      // Transação única - usa opDate e postDate
      allExpandedTx.push({
        opDate: tx.opDate,
        postDate: tx.postDate || tx.opDate
      });
    } else {
      // Transação recorrente - expande para encontrar datas relevantes
      // Vamos expandir para um range amplo para capturar todas as ocorrências
      const startScan = new Date('2024-01-01');
      const endScan = new Date('2026-12-31');
      
      for (let d = new Date(startScan); d <= endScan; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (occursOn(tx, iso)) {
          const postDate = post(iso, tx.method || 'Dinheiro');
          allExpandedTx.push({
            opDate: iso,
            postDate: postDate
          });
        }
      }
    }
  });

  // Encontra min/max considerando tanto opDate quanto postDate
  allExpandedTx.forEach(tx => {
    const dates = [tx.opDate, tx.postDate].filter(Boolean);
    dates.forEach(date => {
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    });
  });

  // Se ainda não encontrou datas, usa range padrão
  if (!minDate || !maxDate) {
    const year = typeof VIEW_YEAR === 'number' ? VIEW_YEAR : new Date().getFullYear();
    return {
      minDate: `${year}-01-01`,
      maxDate: `${year}-12-31`
    };
  }

  // Adiciona uma margem para garantir que cobrimos tudo
  const minDateObj = new Date(minDate);
  const maxDateObj = new Date(maxDate);
  
  // Always expand the range so it at least covers the currently selected VIEW_YEAR
  try {
    const vyStart = new Date(VIEW_YEAR, 0, 1);
    const vyEnd = new Date(VIEW_YEAR, 11, 31);
    if (vyStart < minDateObj) minDateObj.setTime(vyStart.getTime());
    if (vyEnd > maxDateObj) maxDateObj.setTime(vyEnd.getTime());
  } catch (_) {}

  // Margem: início do mês da primeira transação até final do ano da última
  minDateObj.setDate(1); // primeiro dia do mês
  maxDateObj.setMonth(11, 31); // 31 de dezembro do ano
  
  return {
    minDate: minDateObj.toISOString().slice(0, 10),
    maxDate: maxDateObj.toISOString().slice(0, 10)
  };
}

// Constrói um mapa de saldos contínuos dia-a-dia
function buildRunningBalanceMap() {
  const { minDate, maxDate } = calculateDateRange();
  const balanceMap = new Map();
  // Anchor semantics: if startDate is set, balances before that date are treated as 0.
  // The running balance should begin at startDate with startBalance.
  // If no startDate is set, fall back to previous behavior (seed with startBalance || 0 at minDate).
  let runningBalance = 0;
  const hasAnchor = !!state.startDate;
  // use ISO string comparisons (YYYY-MM-DD) to avoid timezone issues
  const anchorISO = hasAnchor ? String(state.startDate) : null;

  // Itera dia-a-dia no range calculado
  const startDateObj = new Date(minDate);
  const endDateObj = new Date(maxDate);

  // If the anchor (startDate) exists but is before the current range's minDate,
  // we should seed the running balance so days in this range start from the anchored value.
  if (hasAnchor && anchorISO && anchorISO < minDate && anchorISO <= maxDate) {
    runningBalance = (state.startBalance != null) ? state.startBalance : 0;
  }
  
  for (let currentDate = new Date(startDateObj); currentDate <= endDateObj; currentDate.setDate(currentDate.getDate() + 1)) {
    const iso = currentDate.toISOString().slice(0, 10);
    // If we have an explicit anchor, ensure days before anchor are zero (and don't start runningBalance until anchor)
    if (hasAnchor && iso < anchorISO) {
      balanceMap.set(iso, 0);
      continue;
    }
    if (hasAnchor && iso === anchorISO) {
      // initialize running balance at anchor date
      runningBalance = (state.startBalance != null) ? state.startBalance : 0;
    }
    // If no anchor and we're at the very first iterated date, seed with startBalance || 0
    if (!hasAnchor && (iso === minDate)) {
      runningBalance = (state.startBalance != null) ? state.startBalance : 0;
    }
    // Calcula o impacto do dia usando a lógica existente
    const dayTx = txByDate(iso);
    
    // 1) Dinheiro impacta no opDate
    const cashImpact = dayTx
      .filter(t => t.method === 'Dinheiro')
      .reduce((s, t) => s + (t.val || 0), 0);

    // 2) Cartões impactam via total da fatura no vencimento, menos ajustes
    const invoicesByCard = {};
    const addToGroup = (cardName, tx) => {
      if (!invoicesByCard[cardName]) invoicesByCard[cardName] = [];
      invoicesByCard[cardName].push(tx);
    };

    // Não-recorrentes de cartão: vencem hoje
    transactions.forEach(t => {
      if (t.method !== 'Dinheiro' && !t.recurrence && t.postDate === iso) {
        const validCard = cards.some(c => c && c.name === t.method && c.name !== 'Dinheiro');
        if (!validCard) return;
        addToGroup(t.method, t);
      }
    });

    // Recorrentes de cartão: varre 60 dias p/ trás por ocorrências cujo postDate == hoje
    const _scanStart = new Date(iso);
    _scanStart.setDate(_scanStart.getDate() - 60);
    for (const master of transactions.filter(t => t.recurrence && t.method !== 'Dinheiro')) {
      const validCard = cards.some(c => c && c.name === master.method && c.name !== 'Dinheiro');
      if (!validCard) continue;
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
      cardImpact += (invoiceTotals[card] + adj);
    });

    const dayTotal = cashImpact + cardImpact;
    runningBalance += dayTotal;

    // Armazena o saldo para este dia
    balanceMap.set(iso, runningBalance);
  }

  return balanceMap;
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Accordion: month ▶ day ▶ invoice
// Shows every month (Jan–Dec) and every day (01–31),
// past months collapsed by default, current & future months open.
// -----------------------------------------------------------------------------
function renderAccordion() {
  const acc = document.getElementById('accordion');
  if (!acc) return;
  
  // Força limpeza total do accordeon para evitar duplicação
  // especialmente quando muda de ano
  
  const hydrating = false; // Sempre force refresh completo
  // Force rendering of months/days even if there's no startBalance or transactions
  const noDataYet = false;
  const keepSkeleton = hydrating && noDataYet; // keep shimmer only during hydrating

  // Constrói o mapa de saldos contínuos uma única vez
  const balanceMap = buildRunningBalanceMap();
  
  // Salva quais <details> estão abertos
  const openKeys = Array.from(acc.querySelectorAll('details[open]'))
                        .map(d => d.dataset.key || '');
  // Preserve which invoice panels are open
  const openInvoices = Array.from(
    acc.querySelectorAll('details.invoice[open]')
  ).map(d => d.dataset.pd);
  if (!keepSkeleton) acc.innerHTML = '';

  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const currency = v => safeFmtCurrency(v);
  const curMonth = new Date().getMonth();   // 0‑based

  // Helper para criar o header da fatura do cartão
  function createCardInvoiceHeader(cardName, cardTotalAmount, dueISO) {
    const invSum = document.createElement('summary');
    invSum.classList.add('invoice-header-line');
    // Formatação do total original da fatura (valor bruto)
    const formattedTotal = safeFmtCurrency(cardTotalAmount, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

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
      const perFmt = safeFmtCurrency(per, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      note = `<small class="note">Parcelada em ${n} vezes de ${perFmt}</small>`;
    } else if (paidAbs >= totalAbs - 0.005) { // tolerância de centavos
      note = `<small class="note">Paga</small>`;
    } else if (paidAbs > 0) {
      const remaining = Math.max(0, totalAbs - paidAbs);
      note = `<small class="note">Restante - ${safeFmtCurrency(remaining, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>`;
    }

    // Usa hífen simples para coincidir com a expectativa do usuário: "Fatura - Nome do Cartão"
    invSum.innerHTML = `
      <span class="invoice-label">Fatura - ${cardName}</span>
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

  // Remove variável runningBalance local - agora usa o mapa precalculado
  for (let mIdx = 0; mIdx < 12; mIdx++) {
    const nomeMes = new Date(VIEW_YEAR, mIdx).toLocaleDateString('pt-BR', { month: 'long' });
    // Build or reuse month container
    let mDet;
    if (keepSkeleton) {
      // If an existing month node exists, reuse it and preserve its open state
      mDet = acc.querySelector(`details.month[data-key="m-${mIdx}"]`) || document.createElement('details');
      mDet.className = 'month';
      mDet.dataset.key = `m-${mIdx}`;
      // Só expande meses futuros no ano corrente
      const currentYear = new Date().getFullYear();
      const isCurrentYear = VIEW_YEAR === currentYear;
      const isOpen = isCurrentYear ? (mIdx >= curMonth) : false;
      // Preserve previous open if element existed, otherwise use persisted openKeys or default
      const prevMonth = acc.querySelector(`details.month[data-key="m-${mIdx}"]`);
      mDet.open = prevMonth ? !!prevMonth.open : (openKeys.includes(mDet.dataset.key) || isOpen);
      if (!mDet.parentElement) acc.appendChild(mDet);
      // Ensure summary exists and is in final structure
      let mSum = mDet.querySelector('summary.month-divider');
      if (!mSum) {
        mSum = document.createElement('summary');
        mSum.className = 'month-divider';
        mDet.prepend(mSum);
      }
      // Update month name without clobbering any pre-seeded skeleton pill
      const hadSkeleton = !!mSum.querySelector('.skeleton');
      if (noDataYet && hadSkeleton) {
        const nameEl = mSum.querySelector('.month-name');
        if (nameEl) nameEl.textContent = nomeMes.toUpperCase();
      } else {
        // Build minimal structure (values filled later below)
        mSum.innerHTML = `
          <div class="month-row">
            <span class="month-name">${nomeMes.toUpperCase()}</span>
          </div>
          <div class="month-meta">
            <span class="meta-label"></span>
            <span class="meta-value"></span>
          </div>`;
      }
    } else {
      mDet = document.createElement('details');
      mDet.className = 'month';
      mDet.dataset.key = `m-${mIdx}`;   // identifica o mês
      // Só expande meses futuros no ano corrente
      const currentYear = new Date().getFullYear();
      const isCurrentYear = VIEW_YEAR === currentYear;
      const isOpen = isCurrentYear ? (mIdx >= curMonth) : false;
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

    // Only render values when we actually have some data
    if (!noDataYet) {
      mSum.innerHTML = `
        <div class="month-row">
          <span class="month-name">${nomeMes.toUpperCase()}</span>
        </div>
        <div class="month-meta">
          <span class="meta-label">${metaLabel}</span>
          <span class="meta-value">${metaValue}</span>
        </div>`;
    }

    if (!hydrating) mDet.appendChild(mSum);

    // Garante o número correto de dias em cada mês
    const daysInMonth = new Date(VIEW_YEAR, mIdx + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(VIEW_YEAR, mIdx, d);
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
    // Garantir que o método refere-se a um cartão existente (evita fatura fantasma)
    const validCard = cards.some(c => c && c.name === t.method && c.name !== 'Dinheiro');
    if (!validCard) return;
    addToGroup(t.method, t);
  }
});

// Recorrentes de cartão: varre 60 dias p/ trás por ocorrências cujo postDate == hoje
const _scanStart = new Date(iso);
_scanStart.setDate(_scanStart.getDate() - 60);
for (const master of transactions.filter(t => t.recurrence && t.method !== 'Dinheiro')) {
  // Pula séries que apontam para um cartão inexistente
  const validCard = cards.some(c => c && c.name === master.method && c.name !== 'Dinheiro');
  if (!validCard) continue;
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
  // Obtém o saldo do dia do mapa precalculado
  // Use balanceMap.has to avoid falling back to startBalance for dates before the anchor
  const dayBalance = balanceMap.has(iso) ? balanceMap.get(iso) : (state.startBalance || 0);
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
        // Attempt to preserve open state from any existing day node with same key
        const prev = mDet.querySelector(`details.day[data-key="d-${iso}"]`);
        dDet = document.createElement('details');
        dDet.dataset.has = String(dayTx.length > 0);
        dDet.className = 'day';
        dDet.dataset.key = `d-${iso}`;    // identifica o dia YYYY‑MM‑DD
        dDet.open = prev ? !!prev.open : openKeys.includes(dDet.dataset.key);
      }
      const today = todayISO();
      if (iso === today) dDet.classList.add('today');
      let dSum = dDet.querySelector('summary.day-summary');
      if (!dSum) { dSum = document.createElement('summary'); dSum.className = 'day-summary'; }
  const saldoFormatado = safeFmtCurrency(dayBalance, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
      const baseLabel = `${String(d).padStart(2,'0')} - ${dow.charAt(0).toUpperCase() + dow.slice(1)}`;
      const hasCardDue = cards.some(card => card.due === d);
      const hasSalary  = dayTx.some(t =>
        SALARY_WORDS.some(w => t.desc.toLowerCase().includes(w))
      );

      const labelParts = [baseLabel];
      if (hasCardDue) labelParts.push('<span class="icon-invoice"></span>');
      if (hasSalary)  labelParts.push('<span class="icon-salary"></span>');

      const labelWithDue = labelParts.join('');
  dSum.innerHTML = `<span>${labelWithDue}</span><span class="day-balance" style="margin-left:auto">${noDataYet ? '' : saldoFormatado}</span>`;
      if (dayBalance < 0) dDet.classList.add('negative');
      // Replace or append summary
      if (!hydrating) dDet.appendChild(dSum); else if (!dDet.contains(dSum)) dDet.prepend(dSum);

      // In hydration mode, clear dynamic day sections to avoid duplication across renders
      if (hydrating) {
        (dDet.querySelectorAll && dDet.querySelectorAll('.planned-cash, .executed-cash'))
          .forEach(n => n.remove());
      }

      // Seção de planejados (apenas se houver planejados)
      const plannedOps = dayTx
        .filter(t => t.planned)
        .sort((a, b) => {
          const dateCmp = a.opDate.localeCompare(b.opDate);
          if (dateCmp !== 0) return dateCmp;
          return (a.ts || '').localeCompare(b.ts || '');
        });

  // === INVOICE UI (vencendo hoje) ===
  // Sempre remover restos anteriores (mesmo em hydrating) para evitar duplicação
  // Limpeza mais robusta das faturas antigas
  try {
    const existingInvoices = dDet.querySelectorAll('details.invoice');
    existingInvoices.forEach(n => {
      if (n && n.parentNode) {
        n.parentNode.removeChild(n);
      }
    });
  } catch (e) {
    // Fallback: remove todos os filhos details que tenham classe invoice
    const children = Array.from(dDet.children || []);
    children.forEach(child => {
      if (child.tagName === 'DETAILS' && child.classList && child.classList.contains('invoice')) {
        try { child.remove(); } catch (ex) {}
      }
    });
  }

  // Renderiza sempre (também em hydrating) para garantir que o header apareça já no primeiro paint
  // Track de faturas já criadas para este dia para evitar duplicação
  const createdInvoicesForDay = new Set();
  
  Object.keys(invoicesByCard).forEach(cardName => {
        // Verifica se já foi criada uma fatura para este cartão neste dia
        const invoiceKey = `${cardName}_${iso}`;
        if (createdInvoicesForDay.has(invoiceKey)) {
          console.warn(`⚠️ Tentativa de criar fatura duplicada para ${cardName} em ${iso} - ignorando`);
          return; // pula esta iteração
        }
        createdInvoicesForDay.add(invoiceKey);
        
        const det = document.createElement('details');
        det.className = 'invoice swipe-wrapper';
        det.dataset.pd = iso; // YYYY-MM-DD (vencimento)
        // id de swipe para localizar ações fora do <details>
        det.dataset.swipeId = `inv_${cardName.replace(/[^a-z0-9]/gi,'')}_${iso.replace(/-/g,'')}_${Math.random().toString(36).slice(2,7)}`;

        // Cabeçalho padrão da fatura
        const invHeader = createCardInvoiceHeader(cardName, invoiceTotals[cardName] || 0, iso);
        det.appendChild(invHeader);
        
        // Log de debug para monitorar criação de faturas
        if (typeof console !== 'undefined' && console.debug) {
          console.debug(`📋 Fatura criada: ${cardName} em ${iso} com ${invoicesByCard[cardName].length} transações`);
        }

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

        // Itens da fatura (visual + swipe), agrupados por dia com divisores
        // Limpa lista anterior, se houver
        const oldList = det.querySelector('ul.executed-list');
        if (oldList) { try { oldList.remove(); } catch(_) {} }
        const execList = document.createElement('ul');
        execList.className = 'executed-list';

        const items = invoicesByCard[cardName]
          .filter(t => !t.planned)
          .slice()
          .sort((a, b) => {
            // Date groups: descending (newest date first)
            const dateCmp = (b.opDate || '').localeCompare(a.opDate || '');
            if (dateCmp !== 0) return dateCmp;
            // Within the same date: sort by timestamp ascending (earliest first)
            const ta = a.ts || '';
            const tb = b.ts || '';
            return (ta).localeCompare(tb);
          });

        // Group by opDate
        let currentDate = null;
        const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
        for (let i = 0; i < items.length; i++) {
          const t = items[i];
          if (t.opDate !== currentDate) {
            currentDate = t.opDate;
            // Header de data
            const headerLi = document.createElement('li');
            const dObj = new Date(currentDate + 'T00:00:00');
            const longLabel = cap(dObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }));
            const h = document.createElement('div');
            h.className = 'invoice-group-date';
            h.textContent = longLabel;
            headerLi.appendChild(h);
            // Hairline sutil logo após o título (mais limpo)
            const thinDiv = document.createElement('div');
            thinDiv.className = 'invoice-divider thin';
            headerLi.appendChild(thinDiv);
            execList.appendChild(headerLi);
          }
          // Linha da operação (mantém swipe)
          const li = document.createElement('li');
          li.appendChild(makeLine(t, false, true));
          execList.appendChild(li);
          // Sem divisores entre itens (visual minimalista)
        }
        det.appendChild(execList);
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


      // Seção de executados (dinheiro E cartão)
      const allExec = dayTx.filter(t => !t.planned);
      if (allExec.length) {
        const executedSection = document.createElement('div');
        executedSection.className = 'executed-cash';
        const execHeader = document.createElement('div');
        execHeader.className = 'executed-header';
        execHeader.textContent = 'Executados:';
        executedSection.appendChild(execHeader);
        const execList = document.createElement('ul');
        execList.className = 'executed-list';

        allExec.forEach(t => {
          const li = document.createElement('li');
          li.appendChild(makeLine(t));
          execList.appendChild(li);
        });

        executedSection.appendChild(execList);
        dDet.appendChild(executedSection);
      }

  // Avoid re-appending existing day nodes during hydration (prevents reordering/reflow)
  if (!hydrating || !dDet.parentElement) mDet.appendChild(dDet);
    }

// --- Atualiza o preview do mês com base no último dia visível ---
// Calcula o saldo do último dia do mês usando o mapa
const lastDayOfMonth = new Date(VIEW_YEAR, mIdx + 1, 0).getDate();
const lastDayISO = formatToISO(new Date(VIEW_YEAR, mIdx, lastDayOfMonth));
  const monthEndBalanceForHeader = balanceMap.has(lastDayISO) ? balanceMap.get(lastDayISO) : (state.startBalance || 0);
const headerPreviewLabel = (mIdx < curMonth) ? 'Saldo final' : 'Saldo planejado';

    // Atualiza o summary do mês (cabeçalho do accordion)
    const labelEl = mSum.querySelector('.meta-label');
    const valueEl = mSum.querySelector('.meta-value');
    if (!noDataYet) {
      if (labelEl) labelEl.textContent = headerPreviewLabel + ':';
      if (valueEl) valueEl.textContent = currency(monthEndBalanceForHeader);
    }

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
  metaLine.innerHTML = noDataYet ? '' : `<span>| ${previewLabel}</span><strong>${currency(monthEndBalanceForHeader)}</strong>`;
    // Clique em "Saldo final" também expande/colapsa o mês
    metaLine.addEventListener('click', () => {
      mDet.open = !mDet.open;
    });

    // Se o mês estiver fechado (collapsed), exibe metaLine abaixo de mDet
    if (!mDet.open) {
      if (!noDataYet && !isMetaLine(mDet.nextSibling)) acc.appendChild(metaLine);
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
  // Avoid showing start UI until we have loaded cached state to prevent flashes
  if (!state.bootHydrated) return;
  // Show start balance input whenever there's no anchored start date.
  // If the persisted startSet flag exists, user already completed the start flow.
  // Otherwise, fall back to presence of startDate/startBalance.
  const showStart = !(state.startSet === true || (state.startDate != null && state.startBalance != null));
  // exibe ou oculta todo o container de saldo inicial
  startContainer.style.display = showStart ? 'block' : 'none';
  dividerSaldo.style.display = showStart ? 'block' : 'none';
  // (mantém linha antiga para compatibilidade)
  startGroup.style.display = showStart ? 'flex' : 'none';
  // mantém o botão habilitado; a função addTx impede lançamentos
  addBtn.classList.toggle('disabled', showStart);
}
setStartBtn.addEventListener('click', async () => {
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
  state.startBalance = numberValue;
  cacheSet('startBal', state.startBalance);
  syncStartInputFromState();
  // If there's no startDate yet, anchor this saved start balance to today
  if (!state.startDate) {
    state.startDate = todayISO();
    cacheSet('startDate', state.startDate);
    try { save('startDate', state.startDate); } catch (_) {}
  }
  // Persist start balance and mark the start flow as completed (startSet=true)
  try {
    await save('startBal', state.startBalance);
  } catch(_) {}
  state.startSet = true;
  try { cacheSet('startSet', true); } catch(_) {}
  try { await save('startSet', true); } catch(_) {}
  initStart();
  renderTable();
});

addCardBtn.onclick=addCard;addBtn.onclick=addTx;
openCardBtn.onclick = () => { cardModal.classList.remove('hidden'); updateModalOpenState(); setTimeout(() => { try { renderCardList(); } catch(_) {} }, 0); };
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
        load('startBal', state.startBalance)
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
      if (liveBal !== state.startBalance) {
        state.startBalance = liveBal;
        cacheSet('startBal', state.startBalance);
        syncStartInputFromState();
        ensureStartSetFromBalance();
        initStart(); renderTable();
      }
    } catch (_) { /* ignore boot fetch when not logged yet */ }
  }
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

  navigator.serviceWorker.register('sw.js?v=1.4.8(a19)').then(reg => {
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
    if (!tx || !tx.opDate) return;
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

      // Respect explicit exceptions on the master rule
      if (master.exceptions && Array.isArray(master.exceptions) && master.exceptions.includes(iso)) continue;
      // Respect recurrenceEnd: occurrences on or after recurrenceEnd should not be projected
      if (master.recurrenceEnd && iso >= master.recurrenceEnd) continue;

      // evita duplicata se já houver planejado nesse dia
      const dup = (plannedByDate[iso] || []).some(t =>
        (t.parentId && sameId(t.parentId, master.id)) ||
        ((t.desc||'')===(master.desc||'') && (t.method||'')===(master.method||'') &&
         Math.abs(Number(t.val||0))===Math.abs(Number(master.val||0)))
      );
      if (dup) continue;

      // If there is already a recorded transaction (planned or executed) for this date
      // that matches this master (by parentId or desc/method/val), skip projection.
      const exists = transactions.some(t =>
        t && t.opDate === iso && (
          (t.parentId && sameId(t.parentId, master.id)) ||
          ((t.desc||'')===(master.desc||'') && (t.method||'')===(master.method||'') &&
           Math.abs(Number(t.val||0))===Math.abs(Number(master.val||0)))
        )
      );
      if (exists) continue;

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

    for (const tx of group) plannedList.appendChild(makeLine(tx, true));
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
// Initialize swipe for card list (card-line) only if the list root exists
if (cardList) initSwipe(cardList, '.swipe-wrapper', '.swipe-actions', '.card-line', 'cardsSwipeInit');
// Initialize swipe for invoice headers (summary)
initSwipe(document.body, '.swipe-wrapper', '.swipe-actions', '.invoice-header-line', 'invoiceSwipeInit');

// Initialize year selector title
updateYearTitle();
