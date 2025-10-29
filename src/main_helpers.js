/*
 * Extracted helper functions from the monolithic main.js file.
 *
 * The goal of this module is to house a number of self‑contained
 * routines which were previously embedded directly in main.js. Moving
 * them out into this module reduces the line count of the main entry
 * point while preserving behaviour. Each helper either accepts a
 * context object containing any dynamic state it needs or exposes a
 * factory function which returns a closure bound to that context.
 */

import { setStartBalance, setStartDate, setStartSet } from './state/appState.js';
import { PROFILE_CACHE_KEYS } from './utils/profile.js';
import { cacheClearProfile } from './utils/cache.js';

/**
 * None of these helpers rely on variables defined in the original
 * module’s lexical scope. Instead, all required dependencies must be
 * provided by the caller when initialising the helper. This design
 * makes the helpers pure with respect to their inputs and facilitates
 * easy testing and reuse.
 */

/**
 * Display a toast message. This function manipulates the DOM directly
 * to show a temporary notification. The caller may pass a specific
 * document reference (useful for testing) but defaults to the global
 * document.
 *
 * @param {string} msg         The text to display in the toast.
 * @param {string} [type]      Either 'success' or 'error' – used for styling.
 * @param {number} [duration]  How long to show the toast (ms).
 * @param {Document} [documentRef] Document object, defaults to global document.
 */
export function showToast(msg, type = 'error', duration = 3000, documentRef = document) {
  try {
    const t = documentRef.getElementById('toast');
    if (!t) return;
    // Update text content and choose an appropriate icon based on type.
    t.textContent = msg;
    t.style.setProperty('--icon', type === 'error' ? '"✕"' : '"✓"');
    t.classList.remove('success', 'error');
    t.classList.add(type === 'success' ? 'success' : 'error');
    // Trigger reflow so that the CSS animation runs correctly.
    void t.offsetWidth;
    t.classList.add('show');
    // Automatically hide the toast after the specified duration.
    setTimeout(() => {
      t.classList.remove('show');
    }, duration);
  } catch (_) {
    /* Swallow any errors to avoid breaking the app during toast rendering. */
  }
}

// Format ISO date (YYYY-MM-DD) to "DD de Mon" (pt-BR, month short, capitalized, no dot)
function formatDayMonthShort(iso) {
  try {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    const dd = String(d.getDate()).padStart(2, '0');
    let mon = d.toLocaleDateString('pt-BR', { month: 'short' }) || '';
    mon = mon.replace('.', '');
    mon = mon ? mon.charAt(0).toUpperCase() + mon.slice(1) : '';
    return `${dd} de ${mon}`;
  } catch (_) { return iso; }
}

/**
 * Compute a human‑friendly message describing where a transaction has
 * been saved. The logic mirrors the original implementation in
 * main.js but accepts all of its dependencies via a context object.
 *
 * @param {Object} tx  A transaction record.
 * @param {Object} deps A dependency bag containing helper functions.
 *   - safeFmtCurrency: function to format currency values.
 *   - post: function (iso, method) => post date string.
 *   - todayISO: function returning today's date in ISO format.
 *   - documentRef: optional Document object.
 * @returns {string} A string describing where the transaction was saved.
 */
export function buildSaveToast(tx, deps) {
  const {
    safeFmtCurrency,
    post,
    todayISO,
    documentRef = document
  } = deps || {};
  try {
    // Parse the numeric value of the transaction safely.
    const valueNum = typeof tx.val === 'number'
      ? tx.val
      : Number(String(tx.val || '0').replace(/[^0-9.-]/g, ''));
    const formattedVal = typeof safeFmtCurrency === 'function'
      ? safeFmtCurrency(valueNum)
      : String(valueNum);
    const isCard = tx.method && tx.method !== 'Dinheiro';
    const hasOpDate = !!tx.opDate;
    const renderIso = tx.postDate || (hasOpDate && tx.method && typeof post === 'function'
      ? post(tx.opDate, tx.method)
      : null);
    // If it’s a credit card transaction that posts in a different period
    // than the operation date, mention the invoice month/day.
    if (isCard && renderIso && !tx.planned && (!hasOpDate || renderIso !== tx.opDate)) {
      return `${formattedVal} salva na fatura de ${formatDayMonthShort(renderIso)}`;
    }
    // Ad‑hoc budget creation (planned + budgetTag): show the START day where the card appears
    if (!tx.recurrence && tx.planned && tx.budgetTag) {
      const startIso = typeof todayISO === 'function' ? todayISO() : (new Date()).toISOString().slice(0,10);
      return `${formattedVal} salvo em ${formatDayMonthShort(startIso)}`;
    }
    // Non‑recurring transactions default to the operation date or today.
    if (!tx.recurrence) {
      const iso = hasOpDate ? tx.opDate : (typeof todayISO === 'function' ? todayISO() : '');
      return `${formattedVal} salvo em ${formatDayMonthShort(iso)}`;
    }
    // Recurring transactions get a descriptor based on their recurrence code.
    const recurrenceLabels = {
      D: 'diária',
      W: 'semanal',
      BW: 'quinzenal',
      M: 'mensal',
      Q: 'trimestral',
      S: 'semestral',
      Y: 'anual'
    };
    const recCode = String(tx.recurrence || '').trim().toUpperCase();
    const fallbackLabel = (() => {
      const recSel = documentRef?.getElementById?.('recurrence');
      return recSel
        ? (recSel.options[recSel.selectedIndex]?.text || '').toLowerCase()
        : '';
    })();
    const recText = recurrenceLabels[recCode] || (fallbackLabel || 'recorrente');
    return `${formattedVal} salvo (${recText})`;
  } catch (_) {
    // As a last resort, fall back to a generic message to avoid throwing.
    return 'Transação salva';
  }
}

/**
 * Synchronise the start balance input field with the current state.
 * Accepts the application state and a reference to the input element.
 *
 * @param {Object} context
 *   - state: The reactive state object containing startBalance.
 *   - inputRef: A cached input element (optional). If omitted the
 *               helper will query the DOM by id.
 *   - safeFmtCurrency: Function to format a numeric value as a currency.
 *   - documentRef: Optional Document reference; defaults to global document.
 */
export function syncStartInputFromState(context) {
  const { state, inputRef, safeFmtCurrency, documentRef = document } = context;
  // Locate the input element. Prefer the cached reference if provided.
  const input = inputRef || documentRef.getElementById('startInput');
  if (!input) return;
  // When the balance is absent or invalid, clear the field.
  const val = state?.startBalance;
  if (val == null || Number.isNaN(Number(val))) {
    input.value = '';
    return;
  }
  // Format using the provided formatter, falling back to a simple cast.
  try {
    input.value = typeof safeFmtCurrency === 'function'
      ? safeFmtCurrency(val, { forceNew: true })
      : String(val);
  } catch (_) {
    input.value = String(val);
  }
}

/**
 * Create a reset routine that erases all persisted data. The returned
 * function prompts the user for confirmation and then performs a
 * thorough clean‑up of both local and remote stores. Note that this
 * helper does not interact with any hidden variables – all state
 * mutations and side effects are driven via the provided context.
 *
 * @param {Object} context
 *   - setTransactions: Function to replace the current transactions list.
 *   - setCards: Function to replace the current cards list.
 *   - state: The reactive state object (modified in place).
 *   - cacheSet: Function to persist values to local cache.
 *   - getTransactions: Function returning the current transactions list.
 *   - getCards: Function returning the current cards list.
 *   - save: Function to persist values to remote storage.
 *   - refreshMethods: Function to refresh card methods.
 *   - renderCardList: Function to re‑render the card list.
 *   - initStart: Function to reinitialise start values.
 *   - renderTable: Function to re‑render the main table.
 *   - showToast: Function to show a toast message.
 *   - syncStartInputFromState: Function to sync the start input field.
 * @returns {Function} An async function that when invoked performs the reset.
 */
export function createPerformResetAllData(context) {
  return async function performResetAllData(askConfirm = true) {
    const {
      setTransactions,
      setCards,
      state,
      cacheSet,
      getTransactions,
      getCards,
      save,
      refreshMethods,
      renderCardList,
      initStart,
      renderTable,
      showToast,
      syncStartInputFromState: syncStart,
      saveBudgets,
      resetBudgetCache,
      maybeRefreshBudgetsCache,
      flushQueue,
    } = context;
    if (askConfirm) {
      // Use the global confirm dialogue for user confirmation.
      if (typeof confirm === 'function' && !confirm('Deseja realmente APAGAR TODOS OS DADOS? Esta ação é irreversível.')) {
        return;
      }
    }
    try {
      // Clear in‑memory state.
      setTransactions([]);
      setCards([{ name: 'Dinheiro', close: 0, due: 0 }]);
      
      // Reset start balance properties via appState module
      // CRITICAL: Use setStartBalance/setStartSet from appState to ensure proper state management
      try {
        setStartBalance(null, { emit: false });
        setStartDate(null, { emit: false });
        setStartSet(false, { emit: false });
      } catch (err) {
        // Fallback to direct state mutation if functions not available
        console.warn('Failed to use appState setters, falling back to direct mutation:', err);
        if (state) {
          state.startBalance = null;
          state.startDate = null;
          state.startSet = false;
        }
      }
      
      // Update the UI input reflecting the start balance.
      try { syncStart && syncStart(); } catch (_) {}
      // Limpar completamente o cache do perfil para evitar dados remanescentes
      try { cacheClearProfile && cacheClearProfile(Array.from(PROFILE_CACHE_KEYS)); } catch (_) {
        // Fallback para sobrescrita caso não seja possível
        try { cacheSet && cacheSet('tx', getTransactions()); } catch (_) {}
        try { cacheSet && cacheSet('cards', getCards()); } catch (_) {}
        try { cacheSet && cacheSet('startBal', null); } catch (_) {}
        try { cacheSet && cacheSet('startDate', null); } catch (_) {}
        try { cacheSet && cacheSet('startSet', false); } catch (_) {}
        try { cacheSet && cacheSet('dirtyQueue', []); } catch (_) {}
        try { cacheSet && cacheSet('budgets', []); } catch (_) {}
      }
      // Persist cleared values to the remote database.
      try { await (save && save('tx', getTransactions())); } catch (_) {}
      try { await (save && save('cards', getCards())); } catch (_) {}
      try { await (save && save('startBal', null)); } catch (_) {}
      try { await (save && save('startDate', null)); } catch (_) {}
      try { await (save && save('startSet', false)); } catch (_) {}
      try { await (save && save('budgets', [])); } catch (_) {}
      // Garante que alterações offline sejam enviadas imediatamente
      try { await (flushQueue && flushQueue()); } catch (_) {}
      // Limpa todos os orçamentos localmente e remotamente (com fila offline se necessário)
      try { saveBudgets && saveBudgets([]); resetBudgetCache && resetBudgetCache(); } catch (_) {}
      // Tente novamente a fila após atualizar orçamentos — importante para sincronizar 'budgets'
      try { await (flushQueue && flushQueue()); } catch (_) {}
      try { maybeRefreshBudgetsCache && maybeRefreshBudgetsCache([]); } catch (_) {}
      // Refresh derived views.
      try { refreshMethods && refreshMethods(); } catch (_) {}
      try { renderCardList && renderCardList(); } catch (_) {}
      try { initStart && initStart(); } catch (_) {}
      try { renderTable && renderTable(); } catch (_) {}
      // Notify the user on success.
      try { showToast && showToast('Todos os dados foram apagados.', 'success'); } catch (_) {}
    } catch (err) {
      // Log errors to the console and show a user‑friendly toast.
      console.error('Erro ao limpar dados:', err);
      try { showToast && showToast('Erro ao apagar dados. Veja console.', 'error'); } catch (_) {}
    }
  };
}

/**
 * Create a floating reset button. If a button with id
 * 'resetDataFloat' already exists the helper does nothing. The
 * returned function should be called after the DOM has loaded.
 *
 * @param {Function} performResetAllData The reset function created by
 *   createPerformResetAllData. When clicked, the button will invoke
 *   this function with askConfirm=true.
 * @param {Document} [documentRef] Optional Document; defaults to global document.
 */
export function createFloatingResetButton(performResetAllData, documentRef = document) {
  try {
    if (documentRef.getElementById('resetDataFloat')) return;
    const btn = documentRef.createElement('button');
    btn.id = 'resetDataFloat';
    btn.type = 'button';
    btn.className = 'danger reset-float';
    btn.title = 'Limpar tudo';
    btn.textContent = 'Limpar tudo';
    // Apply basic styling inline to match the existing UI.
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
    btn.addEventListener('click', () => {
      if (typeof performResetAllData === 'function') {
        performResetAllData(true);
      }
    });
    // Append immediately if the body exists, otherwise defer until
    // window load.
    if (documentRef.body) {
      documentRef.body.appendChild(btn);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        documentRef.body && documentRef.body.appendChild(btn);
      });
    }
  } catch (_) {
    // Fail silently – a missing button is preferable to crashing.
  }
}

/**
 * Factory to produce a togglePlanned function bound to the given
 * context. The returned function implements the original toggle
 * behaviour: switching a transaction between planned and executed
 * states or handling recurrences.
 *
 * @param {Object} context
 *   - transactions: Array of transaction objects (will be mutated).
 *   - sameId: Function comparing two ids (a,b) => boolean.
 *   - plannedModal: DOM element representing the planned modal.
 *   - askMoveToToday: Function prompting the user to move a cash
 *       transaction to today.
 *   - getTransactions: Function returning the current transactions list.
 *   - setTransactions: Function replacing the transactions list.
 *   - post: Function (iso, method) returning a post date.
 *   - todayISO: Function returning current date in ISO format.
 *   - save: Function (key, value) persisting data remotely.
 *   - renderTable: Function re-rendering the main transactions table.
 *   - renderPlannedModal: Function re-rendering the planned modal.
 *   - notify: Function (msg, type) showing a toast notification.
 *   - refreshBudgetsCache: Optional function to refresh budget caches when transactions change.
 */
export function createTogglePlanned(context) {
  return async function togglePlanned(id, iso) {
    const {
      transactions,
      sameId,
      plannedModal,
      askMoveToToday,
      getTransactions,
      setTransactions,
      post,
      todayISO,
      save,
      renderTable,
      renderPlannedModal,
      notify,
      refreshBudgetsCache,
    } = context;
    
    // Get current transactions list
    const txList = typeof getTransactions === 'function' ? getTransactions() : transactions;
    
    // Find the master record for the given id.
    const master = (txList || []).find((x) => sameId(String(x.id), String(id)));
    
    const shouldRefreshPlannedModal = plannedModal && !plannedModal.classList.contains('hidden');
    // Capture which invoice panels were open so they can be reopened later.
    const openInvoices = Array.from(document.querySelectorAll('details.invoice[open]')).map(el => el.dataset.pd);
    let toastMsg = null;
    if (!master) return;
    
    if (master.recurrence) {
      master.exceptions = master.exceptions || [];
      if (!master.exceptions.includes(iso)) {
        master.exceptions.push(iso);
        const today = typeof todayISO === 'function' ? todayISO() : null;
        let execIso = iso;
        try {
          if (master.method === 'Dinheiro' && iso !== today && typeof askMoveToToday === 'function') {
            const move = await askMoveToToday();
            if (move) execIso = today;
          }
        } catch (_) {}
        const execTx = {
          id: Date.now(),
          parentId: master.id,
          desc: master.desc,
          val: master.val,
          method: master.method,
          opDate: execIso,
          postDate: typeof post === 'function' ? post(execIso, master.method) : execIso,
          recurrence: '',
          installments: 1,
          planned: false,
          ts: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          budgetTag: master.budgetTag,
        };
        // Attempt to use a provided addTransaction; fall back to setTransactions.
        let added = false;
        if (typeof context.addTransaction === 'function') {
          try {
            context.addTransaction(execTx);
            added = true;
          } catch (_) {
            added = false;
          }
        }
        if (!added) {
          const current = typeof getTransactions === 'function' ? getTransactions() : (txList || []);
          setTransactions && setTransactions((current || []).concat([execTx]));
        }
        if (execTx.method !== 'Dinheiro' && execTx.postDate) {
          toastMsg = `Movida para fatura de ${formatDayMonthShort(execTx.postDate)}`;
        }
      }
    } else {
      if (master.planned) {
        const today = typeof todayISO === 'function' ? todayISO() : null;
        if (master.method === 'Dinheiro') {
          try {
            if (iso !== today && typeof askMoveToToday === 'function') {
              const move = await askMoveToToday();
              if (move) {
                master.opDate = today;
                master.postDate = today;
              }
            }
          } catch (_) {}
        }
        master.ts = new Date().toISOString();
      }
      master.planned = !master.planned;
      if (!master.planned && master.method !== 'Dinheiro') {
        master.postDate = typeof post === 'function' ? post(master.opDate, master.method) : master.opDate;
        if (master.postDate) {
          toastMsg = `Movida para fatura de ${formatDayMonthShort(master.postDate)}`;
        }
      }
    }
    // Persist the updated transactions list.
    try { save && save('tx', typeof getTransactions === 'function' ? getTransactions() : transactions); } catch (_) {}
    // Trigger table redraw.
    try { renderTable && renderTable(); } catch (_) {}
    // Optionally refresh the planned modal.
    if (shouldRefreshPlannedModal) {
      try { renderPlannedModal && renderPlannedModal(); } catch (err) { console.error('renderPlannedModal failed', err); }
    }
    // Restore any invoice panels that were open prior to the update.
    for (const pd of openInvoices) {
      const det = document.querySelector(`details.invoice[data-pd="${pd}"]`);
      if (det) det.open = true;
    }
    // Notify the user if applicable.
    if (toastMsg && typeof notify === 'function') {
      try { notify(toastMsg, 'success'); } catch (_) {}
    }
    if (typeof refreshBudgetsCache === 'function') {
      try {
        const latest = typeof getTransactions === 'function' ? getTransactions() : transactions;
        refreshBudgetsCache(latest);
      } catch (err) {
        console.warn('refreshBudgetsCache failed after toggle', err);
      }
    }
  };
}

/**
 * Factory for card modal show handler.
 *
 * @param {Object} context
 *   - cardModal: The modal element.
 *   - updateModalOpenState: Function updating the application’s modal state.
 *   - renderCardList: Function re-rendering the card list.
 * @returns {Function} A function accepting an options object.
 */
export function createShowCardModal(context) {
  return function showCardModal(options = {}) {
    const { cardModal, updateModalOpenState, renderCardList } = context;
    if (!cardModal) return;
    const fromSettings = options.fromSettings === true;
    if (fromSettings) {
      cardModal.dataset.origin = 'settings';
      cardModal.classList.add('from-settings');
      cardModal.classList.remove('from-settings-visible');
      cardModal.classList.remove('card-slide');
      cardModal.classList.remove('card-slide-visible');
      cardModal.classList.remove('hidden');
      // Force reflow before adding visibility class.
      void cardModal.offsetWidth;
      cardModal.classList.add('from-settings-visible');
    } else {
      cardModal.dataset.origin = 'default';
      cardModal.classList.remove('from-settings');
      cardModal.classList.remove('from-settings-visible');
      cardModal.classList.add('card-slide');
      cardModal.classList.remove('card-slide-visible');
      cardModal.classList.remove('hidden');
      void cardModal.offsetWidth;
      cardModal.classList.add('card-slide-visible');
    }
    // Update modal state and asynchronously refresh card contents.
    if (typeof updateModalOpenState === 'function') updateModalOpenState();
    setTimeout(() => {
      try { renderCardList && renderCardList(); } catch (_) {}
    }, 0);
  };
}

/**
 * Factory for card modal hide handler.
 *
 * @param {Object} context
 *   - cardModal: The modal element.
 *   - updateModalOpenState: Function updating the modal state.
 * @returns {Function} A function with no arguments.
 */
export function createHideCardModal(context) {
  return function hideCardModal() {
    const { cardModal, updateModalOpenState } = context;
    if (!cardModal) return;
    
    const wasFromSettings = cardModal.dataset.origin === 'settings';
    
    cardModal.classList.add('hidden');
    cardModal.classList.remove('from-settings-visible');
    cardModal.classList.remove('card-slide-visible');
    
    if (!cardModal.dataset.origin || cardModal.dataset.origin !== 'settings') {
      cardModal.classList.remove('from-settings');
      setTimeout(() => {
        if (cardModal.classList.contains('hidden')) {
          cardModal.classList.remove('card-slide');
        }
      }, 320);
    } else {
      setTimeout(() => {
        if (cardModal.classList.contains('hidden')) {
          cardModal.classList.remove('from-settings');
        }
      }, 320);
    }
    
    delete cardModal.dataset.origin;
    if (typeof updateModalOpenState === 'function') updateModalOpenState();
    
    // Se veio do modal de settings, reabrir o settings após o fechamento
    if (wasFromSettings) {
      setTimeout(() => {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
          settingsModal.classList.remove('hidden');
          if (typeof updateModalOpenState === 'function') updateModalOpenState();
        }
      }, 100); // Pequeno delay para garantir que o card modal fechou completamente
    }
  };
}

/**
 * Factory for refreshing card methods. Wraps cardRefreshMethods with
 * prebound arguments.
 *
 * @param {Object} context
 *   - cardRefreshMethods: Original refresh function.
 *   - met: DOM element representing the payment method selector.
 *   - cards: Array of card objects.
 * @returns {Function} A function invoking cardRefreshMethods with the
 *     provided met and cards.
 */
export function createRefreshMethods(context) {
  return function refreshMethods() {
    const { cardRefreshMethods, met, cards } = context;
    if (typeof cardRefreshMethods === 'function') {
      cardRefreshMethods(met, cards);
    }
  };
}

/**
 * Dummy factory for swipe actions on cards. Currently returns a null
 * handler; extracted to facilitate future enhancements without
 * cluttering the main module.
 */
export function createCardSwipeActions() {
  return function createCardSwipeActions() {
    return null;
  };
}

/**
 * Dummy factory for card content generation. Returns null. Can be
 * expanded later to render dynamic card details.
 */
export function createCardContent() {
  return function createCardContent() {
    return null;
  };
}

/**
 * Dummy factory for card list items. Returns null. Separated for
 * symmetry with other factories.
 */
export function createCardListItem() {
  return function createCardListItem() {
    return null;
  };
}

/**
 * Factory for rendering the card list. Binds cardRenderList and all
 * necessary inputs. The returned function is recursive in the sense
 * that it passes itself back into cardRenderList for re-use when
 * internal events request a refresh.
 *
 * @param {Object} context
 *   - cardRenderList: The rendering function from ./ui/cards.js.
 *   - cards: Current array of card objects.
 *   - cardModal: Modal element for cards.
 *   - cardList: UL/OL element where card items are appended.
 *   - initSwipe: Function to initialise swipe behaviour.
 *   - getTransactions: Function returning current transactions.
 *   - setTransactions: Function updating transactions.
 *   - transactions: Array of current transactions.
 *   - save: Function persisting data.
 *   - refreshMethods: Function refreshing card methods (prebound).
 *   - met: DOM element representing the payment method selector.
 *   - post: Function (iso, method) => post date string.
 * @returns {Function} A function with no arguments.
 */
export function createRenderCardList(context) {
  const {
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
    post,
  } = context;
  function renderCardList() {
    // Get current cards array dynamically from window.__gastos or global scope
    const currentCards = (typeof window !== 'undefined' && window.__gastos && window.__gastos.cards) || cards;
    cardRenderList({
      cards: currentCards,
      cardModal,
      cardListEl: cardList,
      initSwipe,
      getTransactions,
      setTransactions,
      transactions,
      save,
      refreshMethodsFn: refreshMethods,
      renderCardList,
      met,
      post: (iso, method) => (typeof post === 'function' ? post(iso, method) : undefined),
    });
  }
  return renderCardList;
}

/**
 * Factory for a safe table renderer. Retries rendering up to three
 * times if an exception is thrown. Uses a provided renderTable
 * function and showToast for reporting errors.
 *
 * @param {Object} context
 *   - renderTable: Function to render the transactions table.
 *   - showToast: Function to display toast messages.
 * @returns {Function} A function with an optional attempt counter.
 */
export function createSafeRenderTable(context) {
  return function safeRenderTable(attempt = 1) {
    const { renderTable, showToast } = context;
    try {
      if (typeof renderTable === 'function') renderTable();
    } catch (err) {
      console.error(`renderTable failed (attempt ${attempt}):`, err);
      try {
        if (typeof showToast === 'function') {
          showToast('Erro ao renderizar. Tentando novamente…', 'error', 2500);
        }
      } catch (_) {}
      if (attempt < 3) {
        setTimeout(() => safeRenderTable(attempt + 1), 300);
      }
    }
  };
}

/**
 * Group transactions by their posting month. Returns a Map keyed
 * by 'YYYY-MM' strings with arrays of transactions as values.
 *
 * @param {Object} context
 *   - sortTransactions: Function sorting the transactions list in place.
 *   - getTransactions: Function returning current transactions.
 *   - transactions: Array of transactions (fallback if getTransactions is absent).
 *   - post: Function (iso, method) => post date string.
 * @returns {Map<string,Array>} Map from month to transactions.
 */
export function groupTransactionsByMonth(context) {
  const { sortTransactions, getTransactions, transactions, post } = context;
  const groups = new Map();
  if (typeof sortTransactions === 'function') {
    try { sortTransactions(); } catch (_) {}
  }
  const txs = typeof getTransactions === 'function' ? getTransactions() : (transactions || []);
  for (const tx of txs) {
    const pd = tx.postDate || (tx.opDate && tx.method ? (typeof post === 'function' ? post(tx.opDate, tx.method) : tx.opDate) : tx.opDate);
    if (!pd || typeof pd.slice !== 'function') continue;
    const key = pd.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }
  return new Map([...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}

/**
 * Factory producing an animated scroll helper. Smoothly scrolls a
 * wrapper element to a target position. Updates context properties
 * wrapperScrollAnimation and wrapperTodayAnchor as the animation
 * progresses.
 *
 * @param {Object} context
 *   - wrapperEl: Scrollable container element.
 *   - wrapperScrollAnimation: Reference to an existing animation (null if none).
 *   - wrapperTodayAnchor: Stores the last anchor position.
 * @returns {Function} A function accepting the target scrollTop value.
 */
export function createAnimateWrapperScroll(context) {
  return function animateWrapperScroll(targetTop) {
    const { wrapperEl } = context;
    if (!wrapperEl) return;
    try { if (window.__gastos && window.__gastos.__lockAutoScroll) return; } catch (_) {}
    if (context.wrapperScrollAnimation) return;
    const startTop = wrapperEl.scrollTop || 0;
    const distance = targetTop - startTop;
    if (Math.abs(distance) < 1) {
      wrapperEl.scrollTop = targetTop;
      context.wrapperTodayAnchor = targetTop;
      return;
    }
    const duration = 600;
    const startTime = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      wrapperEl.scrollTop = startTop + distance * easeOutCubic(progress);
      if (progress < 1) {
        context.wrapperScrollAnimation = requestAnimationFrame(step);
      } else {
        context.wrapperScrollAnimation = null;
        wrapperEl.scrollTop = targetTop;
        context.wrapperTodayAnchor = targetTop;
      }
    };
    context.wrapperScrollAnimation = requestAnimationFrame(step);
  };
}
