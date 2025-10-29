/*
 * Transaction modal logic extracted from main.js.
 *
 * This module centralizes handling for invoice payment and adding/editing
 * transactions. It relies on a global object `window.__gastos` that holds
 * references to all DOM elements, state variables and helper functions
 * needed by the original code. Before importing this module, main.js
 * should assign the necessary properties to `window.__gastos`. See
 * main.js for the assignment of these properties.
 */

import { extractFirstHashtag } from '../utils/tag.js';
import { upsertBudgetFromTransaction } from '../services/budgetManager.js';

/**
 * Attaches listeners for invoice parcel and installment controls.
 * This function should be called once after `window.__gastos` has been
 * populated. It uses the same logic that was originally inline in
 * main.js to show/hide the parcel controls and update the value field
 * based on the number of installments. The state variables
 * `isPayInvoiceMode` and `pendingInvoiceCtx` are stored on
 * `window.__gastos` so that changes persist between calls.
 */
export function setupInvoiceHandlers() {
  const g = window.__gastos || {};
  // Prevent multiple handler registration
  if (g._invoiceHandlersSetup) return;
  const {
    invoiceParcelCheckbox,
    installments,
    parcelasBlock,
    recurrence,
    pendingInvoiceCtx: pendingInvoiceCtxRef,
    isPayInvoiceMode: isPayInvoiceModeRef,
    val,
    safeFmtNumber,
  } = g;
  if (invoiceParcelCheckbox) {
    invoiceParcelCheckbox.addEventListener('change', () => {
      // Use refs directly from the global object to allow updates
      const ctx = g.pendingInvoiceCtx || {};
      if (!g.isPayInvoiceMode) return;
      if (invoiceParcelCheckbox.checked) {
        // Populate installments select if not yet
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
        // Default to 2x on enable if previous value was 1 or empty
        if (!installments.value || installments.value === '1') installments.value = '2';
        // Set value field to per‑installment amount (negative)
        const base = Math.abs(Number(ctx.remaining) || 0);
        const n = Math.max(2, parseInt(installments.value || '2', 10) || 2);
        installments.value = String(n);
        const per = n > 0 ? base / n : base;
        val.value = safeFmtNumber(-per, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else {
        // Hide parcel block and restore original value
        parcelasBlock.classList.add('hidden');
        installments.disabled = true;
        recurrence.value = '';
        installments.value = '1';
        const base = Math.abs(Number(ctx.remaining) || 0);
        val.value = safeFmtNumber(-base, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    });
  }
  if (installments) {
    installments.addEventListener('change', () => {
      if (!g.isPayInvoiceMode) return;
      if (!invoiceParcelCheckbox || !invoiceParcelCheckbox.checked) return;
      const ctx = g.pendingInvoiceCtx || {};
      const base = Math.abs(Number(ctx.remaining) || 0);
      const n = parseInt(installments.value, 10) || 1;
      const per = n > 0 ? base / n : base;
      val.value = safeFmtNumber(-per, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  }
  g._invoiceHandlersSetup = true;
}

/**
 * Setup the paid/planned status segmented control for the Add Operation modal.
 * - Defaults to Paga for today/past
 * - Forces Planejada and disables the control for future dates
 */
export function setupPaidStatusControl() {
  try {
    const group = document.querySelector('.paid-toggle');
    const date = document.getElementById('opDate');
    if (!group || !date) return;
    const buttons = Array.from(group.querySelectorAll('.seg-option'));
    const setActive = (paid) => {
      buttons.forEach(b => b.classList.remove('active'));
      const target = buttons.find(b => b.dataset.paid === (paid ? '1' : '0'));
      if (target) target.classList.add('active');
      try { group.dataset.state = paid ? 'paid' : 'planned'; } catch (_) {}
      try { window.__gastos.markAsPaid = !!paid; } catch (_) {}
    };
    const todayFn = () => (window.todayISO ? window.todayISO() : new Date().toISOString().slice(0,10));
    const syncForDate = () => {
      const iso = date.value;
      const isFuture = !!(iso && iso > todayFn());
      if (isFuture) { group.classList.add('disabled'); setActive(false); }
      else { group.classList.remove('disabled'); if (!buttons.some(b => b.classList.contains('active'))) setActive(true); }
    };
    buttons.forEach(btn => btn.addEventListener('click', () => { if (!group.classList.contains('disabled')) setActive(btn.dataset.paid === '1'); }));
    date.addEventListener('change', syncForDate);
    // Initial state on load
    syncForDate();
  } catch (_) {}
}

/**
 * Opens the payment modal for credit card invoices. This function mirrors
 * the original `openPayInvoiceModal` from main.js but accesses all
 * dependencies via `window.__gastos`. It sets the global flags
 * `isPayInvoiceMode` and `pendingInvoiceCtx` so that the addTx handler
 * can detect invoice payment mode.
 *
 * @param {string} cardName The name of the card whose invoice is being paid
 * @param {string} dueISO   The ISO date of the invoice due date
 * @param {number} remaining The remaining amount on the invoice
 * @param {number} totalAbs The absolute total of the invoice
 * @param {number} adjustedBefore Amount already adjusted on the invoice
 */
export function openPayInvoiceModal(cardName, dueISO, remaining, totalAbs, adjustedBefore) {
  const g = window.__gastos || {};
  const {
    txModal,
    toggleTxModal,
    desc,
    val,
    safeFmtNumber,
    date,
    hiddenSelect,
    methodButtons,
    invoiceParcelRow,
    invoiceParcelCheckbox,
    installments,
    parcelasBlock,
    recurrence,
    txModalTitle,
    addBtn,
    todayISO,
  } = g;
  // Ensure paid status control is initialised for standard mode as well
  // Open modal first to avoid reset wiping the prefill
  const wasHidden = txModal && txModal.classList.contains('hidden');
  if (wasHidden && typeof toggleTxModal === 'function') toggleTxModal();
  // Set flags on the global object
  g.isPayInvoiceMode = true;
  g.pendingInvoiceCtx = { card: cardName, dueISO, remaining, totalAbs, adjustedBefore };
  if (txModal) txModal.dataset.mode = 'pay-invoice';
  // Prefill form fields
  const today = typeof todayISO === 'function' ? todayISO() : (new Date()).toISOString().slice(0,10);
  if (desc) desc.value = `Pagamento fatura – ${cardName}`;
  // In invoice mode, treat as paid by nature; ensure toggle (if visible) is set to 'Paga'
  try {
    const group = document.querySelector('.paid-toggle');
    if (group) {
      group.classList.remove('disabled');
      const all = Array.from(group.querySelectorAll('.seg-option'));
      all.forEach(b => b.classList.remove('active'));
      const paidBtn = all.find(b => b.dataset.paid === '1');
      if (paidBtn) paidBtn.classList.add('active');
      try { group.dataset.state = 'paid'; } catch (_) {}
    }
  } catch (_) {}
  // Ensure the value toggle reflects expense and keeps the formatted sign
  try {
    document.querySelectorAll('.value-toggle button').forEach(b => b.classList.remove('active'));
    const expBtn = document.querySelector('.value-toggle button[data-type="expense"]');
    if (expBtn) expBtn.classList.add('active');
  } catch (_) {}
  const rem = Number(remaining) || 0;
  if (val) val.value = safeFmtNumber ? safeFmtNumber(-rem, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (-rem).toFixed(2);
  if (date) date.value = today;
  // Lock method to Dinheiro
  if (hiddenSelect) hiddenSelect.value = 'Dinheiro';
  const methodSwitch = document.querySelector('.method-switch');

  // Paid toggle is wired by setupPaidStatusControl() in normal mode
  if (methodSwitch) methodSwitch.dataset.selected = 'Dinheiro';
  if (methodButtons) methodButtons.forEach(b => { b.classList.toggle('active', b.dataset.method === 'Dinheiro'); });
  // Show parcel option (off by default)
  if (invoiceParcelRow) invoiceParcelRow.style.display = '';
  // Fix label content/order: [text span] ..... [checkbox]
  if (invoiceParcelRow && invoiceParcelCheckbox) {
    const cb = invoiceParcelCheckbox;
    invoiceParcelRow.textContent = '';
    const textSpan = document.createElement('span');
    textSpan.textContent = 'Parcelar fatura';
    invoiceParcelRow.appendChild(textSpan);
    invoiceParcelRow.appendChild(cb);
  }
  if (invoiceParcelCheckbox) invoiceParcelCheckbox.checked = false;
  if (installments) installments.disabled = true;
  if (parcelasBlock) parcelasBlock.classList.add('hidden');
  if (recurrence) recurrence.value = '';
  if (txModalTitle) txModalTitle.textContent = 'Pagar fatura';
  if (addBtn) addBtn.textContent = 'Pagar';
  if (txModal) {
    const titleEl = txModal.querySelector('h2');
    if (titleEl) titleEl.textContent = 'Pagar fatura';
  }
  setTimeout(() => {
    try {
      const modalEl = document.getElementById('txModal');
      const titleLate = modalEl ? modalEl.querySelector('h2') : null;
      if (titleLate) titleLate.textContent = 'Pagar fatura';
      const addLate = addBtn || document.getElementById('addBtn');
      if (addLate) addLate.textContent = 'Pagar';
    } catch (_) {}
  }, 0);

}

/**
 * Handler for adding or editing a transaction. This is a port of the
 * original addTx() function from main.js. It destructures all
 * dependencies from `window.__gastos` at the start of the function
 * and writes back mutated state at the end. Any variables that are
 * modified (e.g. isEditing, pendingEditMode, pendingInvoiceCtx) are
 * synchronized back to the global object.
 */
export async function addTx() {
  const g = window.__gastos || {};
  // Destructure dependencies from the global object. Many variables
  // defined in main.js (DOM elements, state flags, helper functions)
  // are exposed on g so they can be accessed here. Local copies are
  // created for readability; updates will be propagated back to g
  let {
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
    todayISO,
    post,
    save,
    renderTable,
    toggleTxModal,
    showToast,
    notify,
    addBtn,
    txModalTitle,
    desc,
    val,
    safeParseCurrency,
    safeFmtCurrency,
    safeFmtNumber,
    met,
    date,
    recurrence,
    installments,
    recurrence: recurrenceRef,
    hiddenSelect,
    parcels: parcelas,
    parcelasBlock,
    invoiceParcelCheckbox,
    askMoveToToday,
    plannedModal,
    plannedList,
    openPlannedBtn,
    closePlannedModal,
    renderPlannedModal,
    cardList,
    initSwipe,
  } = g;

  // Use fallback for functions that may not be defined
  const fmtNumber = safeFmtNumber || ((n, opts) => Number(n).toLocaleString(undefined, { minimumFractionDigits: opts?.minimumFractionDigits || 2, maximumFractionDigits: opts?.maximumFractionDigits || 2 }));
  const parseCurrency = safeParseCurrency || ((s) => parseFloat(String(s).replace(/[^0-9.-]/g, '')));
  const fmtCurrency = safeFmtCurrency || ((n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const getTxs = typeof getTransactions === 'function' ? getTransactions : () => transactions;
  const setTxs = typeof setTransactions === 'function' ? setTransactions : (list) => { g.transactions = list; };
  const addTxInternal = typeof addTransaction === 'function' ? addTransaction : (tx) => { g.transactions = getTxs().concat([tx]); };
  const saveFn = typeof save === 'function' ? save : (() => {});
  const renderFn = typeof renderTable === 'function' ? renderTable : (() => {});
  const toggleModalFn = typeof toggleTxModal === 'function' ? toggleTxModal : () => {
    // Fallback: close modal directly if toggleTxModal is not available
    const modal = document.getElementById('txModal');
    if (modal && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
      // Reset button rotation
      const openBtn = document.getElementById('openTxModal');
      if (openBtn) openBtn.style.transform = 'rotate(0deg)';
      // Update modal state
      if (typeof g.updateModalOpenState === 'function') {
        g.updateModalOpenState();
      }
    }
  };
  const showToastFn = typeof showToast === 'function' ? showToast : ((m,t) => { try { notify && notify(m, t); } catch(_) {} });
  // Helper: ensure todayISO is available
  const todayFn = typeof todayISO === 'function' ? todayISO : (() => (new Date()).toISOString().slice(0,10));
  const norm = (s = '') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const getAvailableCards = () => {
    const local = Array.isArray(g.cards) ? g.cards : null;
    if (local && local.length) return local;
    const globalCards = window.__gastos && Array.isArray(window.__gastos.cards) ? window.__gastos.cards : [];
    return globalCards;
  };
  const resolveSelectedMethod = (candidate, fallbackOriginal) => {
    let method = candidate;
    const methodNorm = norm(method);
    const isCardToggleValue = methodNorm === 'cartao';
    if (!method || method === 'undefined' || isCardToggleValue) {
      const checked = typeof document !== 'undefined'
        ? document.querySelector('#cardSelector input[name="cardChoice"]:checked')
        : null;
      if (checked && checked.value) {
        method = checked.value;
      }
    }
    if ((!method || method === 'undefined' || norm(method) === 'cartao') && fallbackOriginal) {
      method = fallbackOriginal;
    }
    if (!method || method === 'undefined' || norm(method) === 'cartao') {
      const cardsList = getAvailableCards().filter(c => c && c.name && c.name !== 'Dinheiro');
      if (cardsList.length > 0) {
        method = cardsList[0].name;
      }
    }
    if (!method || method === 'undefined' || norm(method) === 'cartao') {
      method = 'Dinheiro';
    }
    if (hiddenSelect && method && hiddenSelect.value !== method) {
      hiddenSelect.value = method;
    }
    return method;
  };
  const computePostDate = (iso, method) => {
    if (typeof post === 'function') {
      try {
        return post(iso, method);
      } catch (err) {
        console.warn('post() failed for method', method, err);
      }
    }
    return iso;
  };
  const budgetsEnabled = typeof g.isBudgetsFeatureEnabled === 'function' ? !!g.isBudgetsFeatureEnabled() : false;
  const refreshBudgetsCache = budgetsEnabled && typeof g.maybeRefreshBudgetsCache === 'function'
    ? (list) => {
        try { g.maybeRefreshBudgetsCache(list); } catch (err) { console.warn('maybeRefreshBudgetsCache failed', err); }
      }
    : () => {};
  const tryUpsertBudget = (tx, extraContext = {}) => {
    if (!budgetsEnabled || !tx || !tx.budgetTag || typeof upsertBudgetFromTransaction !== 'function') return;
    try {
      upsertBudgetFromTransaction(tx, {
        transactions: (typeof getTransactions === 'function' ? getTransactions() : transactions) || [],
        recurrenceId: extraContext.recurrenceId || tx.recurrenceId || tx.parentId || null,
        occurrenceISO: extraContext.occurrenceISO || tx.opDate,
        nextOccurrenceISO: extraContext.nextOccurrenceISO || null,
        creationDate: extraContext.creationDate || todayFn(),
      });
    } catch (err) {
      console.warn('Budget upsert failed', err);
    }
  };
  const findActiveBudgetFn = budgetsEnabled && typeof g.findActiveBudgetByTag === 'function'
    ? g.findActiveBudgetByTag
    : null;
  const hasActiveRecurringBudgetForTag = (tag) => {
    if (!budgetsEnabled || !tag || !findActiveBudgetFn) return false;
    try {
      const record = findActiveBudgetFn(tag);
      return !!(record && record.status === 'active' && record.budgetType === 'recurring');
    } catch (_) {
      return false;
    }
  };
  const isFutureDate = (iso) => iso && iso > todayFn();
  const isRecurrenceActive = (value) => !!(value && String(value).trim());
  const blockMessage = (msg) => {
    if (msg) {
      showToastFn(msg, 'error');
    }
    return Boolean(msg);
  };
  const isWithinCycle = (budget, iso) => {
    if (!budget || !iso) return false;
    const s = (budget.startDate || '').slice(0,10);
    const e = (budget.endDate || '').slice(0,10);
    if (s && iso < s) return false;
    if (e && iso > e) return false;
    return true;
  };
  const validateOccurrenceDateChange = ({ mode, originalTx, newISO, occurrenceISO }) => {
    if (!newISO) return null;
    if ((mode === 'single' || mode === 'future') && occurrenceISO && newISO !== occurrenceISO) {
      return 'A data é controlada pela recorrência e não pode ser alterada.';
    }
    const originalISO = originalTx && originalTx.opDate;
    const isMaster = !!(originalTx && originalTx.recurrence && String(originalTx.recurrence).trim());
    const isChild = !!(originalTx && originalTx.parentId);
    // When in 'single' or 'future' mode, don't validate against originalISO because the user
    // may be editing a specific occurrence whose date differs from the master's opDate
    if (!(mode === 'single' || mode === 'future') && (isMaster || isChild) && originalISO && newISO !== originalISO) {
      return 'A data é controlada pela recorrência e não pode ser alterada.';
    }
    return null;
  };
  // Start of original addTx logic
  try {
    const normalizeTag = (s) => {
      if (s == null) return s;
      try { return String(s).replace(/^#+/, '').trim(); } catch (_) { return s; }
    };
    // Edit mode
    if (isEditing !== null && isEditing !== undefined) {
      // (mantém lógica de edição original)
      const txList = getTxs();
      const t = txList.find(x => x && x.id === isEditing);
      if (!t) {
        console.error('Transaction not found for editing:', isEditing);
        // reset edit state
        pendingEditMode = null;
        isEditing = null;
        if (addBtn) addBtn.textContent = 'Adicionar';
        if (txModalTitle) txModalTitle.textContent = 'Lançar operação';
        toggleModalFn();
        // Write back and exit
        g.isEditing = isEditing;
        g.pendingEditMode = pendingEditMode;
        return;
      }
  const newDesc    = desc && desc.value ? desc.value.trim() : '';
      const newBudgetTag = normalizeTag((window.__gastos?.pendingBudgetTag) || extractFirstHashtag(newDesc));
      let newVal = parseCurrency(val && val.value);
      const activeTypeEl = document.querySelector('.value-toggle button.active');
      const activeType = activeTypeEl && activeTypeEl.dataset ? activeTypeEl.dataset.type : 'expense';
      if (activeType === 'expense') newVal = -Math.abs(newVal);
      // Get method from active button or hidden select
      const fallbackOriginalMethod = t.method || 'Dinheiro';
      let newMethod = met && met.value;
      if (!newMethod || newMethod === 'undefined') {
        const activeMethodBtn = document.querySelector('.switch-option.active');
        newMethod = activeMethodBtn ? activeMethodBtn.dataset.method : fallbackOriginalMethod;
      }
      newMethod = resolveSelectedMethod(newMethod, fallbackOriginalMethod);
      const newOpDate  = date && date.value;
      const newPostDate = computePostDate(newOpDate, newMethod);
      const newRecurrenceRaw  = recurrence && recurrence.value;
      const newRecurrence = newRecurrenceRaw && typeof newRecurrenceRaw === 'string'
        ? newRecurrenceRaw.trim()
        : newRecurrenceRaw;
      const newInstallments = parseInt(installments && installments.value, 10) || 1;
      const originalPlanned = Boolean(t.planned);
      const compareIds = typeof sameId === 'function'
        ? (a, b) => {
            try { return sameId(a, b); }
            catch (_) { return String(a) === String(b); }
          }
        : (a, b) => String(a) === String(b);
      const recurrenceActive = isRecurrenceActive(newRecurrence);
      // Only validate future date with recurrence if NOT in edit-mode for an existing recurring transaction
      // When editing via single/future/all mode, the user is editing a specific occurrence, not the master
      if (recurrenceActive && isFutureDate(newOpDate) && !g.pendingEditMode) {
        const msg = !isRecurrenceActive(t.recurrence)
          ? 'Um orçamento com data futura não pode ser recorrente. Escolha apenas uma das opções.'
          : 'A data selecionada é incompatível com recorrências. Use a data de hoje ou desative a recorrência.';
        if (blockMessage(msg)) {
          return;
        }
      }
      const findMaster = (tx) => {
        if (!tx) return null;
        if (tx.recurrence && String(tx.recurrence).trim()) return tx;
        if (!tx.parentId) return null;
        return txList.find(candidate => candidate && compareIds(candidate.id, tx.parentId) && candidate.recurrence && String(candidate.recurrence).trim()) || null;
      };
      const masterForTx = findMaster(t);

      // Read the current pendingEditMode from global state (not the local copy)
      // because it may have been updated by the edit recurrence modal buttons
      const currentEditMode = g.pendingEditMode;
      const currentEditTxIso = g.pendingEditTxIso;

      // Helper available to all edit modes: read paid/planned toggle
      const readMarkAsPaid = () => {
        try {
          const group = document.querySelector('.paid-toggle');
          const active = group ? group.querySelector('.seg-option.active') : null;
          // Prefer current occurrence ISO when available; fallback to newOpDate
          const refISO = currentEditTxIso || newOpDate;
          // Default heuristic: past/today => paid
          const defaultPaid = !(refISO && refISO > todayFn());
          return active ? (active.dataset.paid === '1') : defaultPaid;
        } catch (_) {
          const refISO = currentEditTxIso || newOpDate;
          return !(refISO && refISO > todayFn());
        }
      };

      if (!isRecurrenceActive(t.recurrence) && recurrenceActive && newBudgetTag && hasActiveRecurringBudgetForTag(newBudgetTag)) {
        if (blockMessage(`Já existe um orçamento recorrente ativo para ${newBudgetTag}.`)) {
          return;
        }
      }

      const dateBlockMsg = validateOccurrenceDateChange({ mode: currentEditMode, originalTx: t, newISO: newOpDate, occurrenceISO: currentEditTxIso || t.opDate });
      if (blockMessage(dateBlockMsg)) {
        return;
      }

      switch (currentEditMode) {
        case 'single': {
          // For 'single' mode, we:
          // 1. Add this date to the master's exceptions list
          // 2. Create a NEW standalone transaction for this specific date with the edited values
          
          const targetMaster = masterForTx || t;
          
          // Add exception to master
          if (targetMaster) {
            targetMaster.exceptions = Array.isArray(targetMaster.exceptions) ? targetMaster.exceptions : [];
            if (!targetMaster.exceptions.includes(currentEditTxIso)) {
              targetMaster.exceptions.push(currentEditTxIso);
            }
            targetMaster.modifiedAt = new Date().toISOString();
          }
          
          // Check if a detached transaction already exists for this date
          const existingDetached = txList.find(tx => 
            tx && 
            tx.parentId === targetMaster.id && 
            tx.opDate === currentEditTxIso &&
            !tx.recurrence
          );
          
          if (existingDetached) {
            // Update existing detached transaction
            existingDetached.desc = newDesc;
            existingDetached.val = newVal;
            existingDetached.method = newMethod;
            existingDetached.opDate = newOpDate;
            existingDetached.postDate = computePostDate(newOpDate, newMethod);
            existingDetached.planned = !readMarkAsPaid();
            existingDetached.modifiedAt = new Date().toISOString();
            existingDetached.budgetTag = newBudgetTag;
            tryUpsertBudget(existingDetached, {
              occurrenceISO: existingDetached.opDate,
              nextOccurrenceISO: existingDetached.postDate,
              recurrenceId: existingDetached.recurrenceId || existingDetached.parentId || null,
            });
          } else {
            // Create new standalone edited transaction
            const txObj = {
              id: Date.now(),
              parentId: targetMaster.id,
              desc: newDesc,
              val: newVal,
              method: newMethod,
              opDate: newOpDate,
              postDate: computePostDate(newOpDate, newMethod),
              recurrence: '',
              installments: 1,
              planned: !readMarkAsPaid(),
              ts: new Date().toISOString(),
              modifiedAt: new Date().toISOString(),
              budgetTag: newBudgetTag
            };
            try { addTxInternal(txObj); } catch (_) { setTxs(getTxs().concat([txObj])); }
            tryUpsertBudget(txObj, {
              occurrenceISO: txObj.opDate,
              nextOccurrenceISO: txObj.postDate,
              recurrenceId: txObj.recurrenceId || txObj.parentId || null,
            });
          }
          break;
        }
        case 'future': {
          // End original series at this occurrence
          const targetMaster = masterForTx || t;
          if (targetMaster) {
            targetMaster.recurrenceEnd = currentEditTxIso;
            targetMaster.modifiedAt = new Date().toISOString();
          }
          // Create new series starting from this occurrence
          const recurrenceValue = newRecurrence || (targetMaster && targetMaster.recurrence) || (t && t.recurrence) || '';
          const installmentsValue = Number.isInteger(newInstallments) && newInstallments > 0
            ? newInstallments
            : ((targetMaster && targetMaster.installments) || (t && t.installments) || 1);
          const txObj = {
            id: Date.now(),
            parentId: null,
            desc: newDesc,
            val: newVal,
            method: newMethod,
            opDate: currentEditTxIso,
            postDate: computePostDate(currentEditTxIso, newMethod),
            recurrence: recurrenceValue,
            installments: installmentsValue,
            planned: !readMarkAsPaid(),
            ts: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            budgetTag: newBudgetTag
          };
          try { addTxInternal(txObj); } catch (_) { setTxs(getTxs().concat([txObj])); }
          tryUpsertBudget(txObj, {
            occurrenceISO: txObj.opDate,
            nextOccurrenceISO: txObj.postDate,
            recurrenceId: txObj.recurrence ? (txObj.recurrenceId || txObj.id) : null,
          });
          break;
        }
        case 'all': {
          // EDITAR TODAS — Apenas altera a REGRA‑MESTRE, preservando ocorrências
          const master = t.parentId
            ? getTxs().find(tx => tx && sameId && sameId(tx.id, t.parentId))
            : t;
          if (master) {
            master.desc         = newDesc;
            master.val          = newVal;
            master.method       = newMethod;
            // Mantém opDate original; só recalculamos postDate conforme novo método
            master.postDate     = computePostDate(master.opDate, newMethod);
            master.recurrence   = recurrence ? recurrence.value : '';
            master.installments = parseInt(installments && installments.value, 10) || 1;
            master.modifiedAt   = new Date().toISOString();
            master.budgetTag    = newBudgetTag;
            tryUpsertBudget(master, {
              occurrenceISO: master.opDate,
              nextOccurrenceISO: master.postDate,
              recurrenceId: master.recurrenceId || master.id || null,
            });
          }
          break;
        }
        default: {
          // Fallback: modify just this entry
          t.desc       = newDesc;
          t.val        = newVal;
          t.method     = newMethod;
          t.opDate     = newOpDate;
          t.postDate   = computePostDate(newOpDate, newMethod);
          if (recurrence) t.recurrence   = newRecurrence;
          if (installments) t.installments = newInstallments;
          // Ajusta flag planned respeitando o toggle de status do modal
          try {
            const group = document.querySelector('.paid-toggle');
            const active = group ? group.querySelector('.seg-option.active') : null;
            const markAsPaid = active ? (active.dataset.paid === '1') : true;
            t.planned = !markAsPaid;
          } catch (_) {
            // Fallback: se não houver controle, considerar futura como planejada
            t.planned = (t.opDate > todayFn());
          }
          t.modifiedAt   = new Date().toISOString();
          t.budgetTag    = newBudgetTag;
          tryUpsertBudget(t, {
            occurrenceISO: t.opDate,
            nextOccurrenceISO: t.postDate,
            recurrenceId: t.recurrenceId || t.parentId || null,
          });
          break;
        }
      }
      // Force state update so UI observers pick up changes to master/occurrences
      try {
        const snap = (getTxs && Array.isArray(getTxs())) ? getTxs().slice() : [];
        if (typeof setTxs === 'function') setTxs(snap);
      } catch (_) {}
      // Reset editing state - update BOTH local variables AND global state
      refreshBudgetsCache(getTxs());
      pendingEditMode    = null;
      pendingEditTxId    = null;
      pendingEditTxIso   = null;
      isEditing          = null;
      g.pendingEditMode  = null;
      g.pendingEditTxId  = null;
      g.pendingEditTxIso = null;
      g.isEditing        = null;
      if (addBtn) addBtn.textContent = 'Adicionar';
      if (txModalTitle) txModalTitle.textContent = 'Lançar operação';
      try {
        const snap = (getTxs && Array.isArray(getTxs())) ? getTxs().slice() : [];
        saveFn('tx', snap);
      } catch (_) { try { saveFn('tx', getTxs()); } catch(_) {} }
      toggleModalFn();
      // Immediately refresh UI to reflect changes (especially on iOS PWA without realtime)
      try { if (typeof renderTable === 'function') renderTable(); } catch (_) {}
      // Custom edit confirmation toast
      const formattedVal = fmtCurrency(parseCurrency(val && val.value));
      const recValue = recurrence ? recurrence.value : '';
      let toastMsg;
      if (!recValue) {
        const opDateVal = date && date.value;
        const fmtDM = (() => {
          try {
            const d = new Date(`${opDateVal}T00:00:00`);
            const dd = String(d.getDate()).padStart(2, '0');
            let mon = d.toLocaleDateString('pt-BR', { month: 'short' }) || '';
            mon = mon.replace('.', '');
            mon = mon ? mon.charAt(0).toUpperCase() + mon.slice(1) : '';
            return `${dd} de ${mon}`;
          } catch (_) { return `${opDateVal?.slice(8,10)}/${opDateVal?.slice(5,7)}`; }
        })();
        toastMsg = `Edição: ${formattedVal} em ${fmtDM}`;
      } else {
        const recText = recurrence && recurrence.options ? recurrence.options[recurrence.selectedIndex].text.toLowerCase() : '';
        toastMsg = `Edição: ${formattedVal} (${recText})`;
      }
      showToastFn(toastMsg, 'success');
      // Write back state
      g.isEditing = isEditing;
      g.pendingEditMode = pendingEditMode;
      g.pendingEditTxId = pendingEditTxId;
      g.pendingEditTxIso = pendingEditTxIso;
      return;
    }
    // Adição normal
    // Modo especial: pagamento/parcelamento de fatura
    if (isPayInvoiceMode && pendingInvoiceCtx) {
      const ctx = pendingInvoiceCtx;
      const rawVal = parseCurrency(val && val.value);
      const amount = Math.abs(rawVal);
      if (amount <= 0) { showToastFn('Informe um valor válido.'); return; }
      const remaining = Math.max(0, Number(ctx.remaining) || 0);
      const payDate = date && date.value ? date.value : todayFn();
      const nowIso = new Date().toISOString();
      // If parceling is enabled, the UI shows the per-installment value in the
      // input field. In that case interpret `amount` as one installment and
      // compute the total to be paid as amount * n. Otherwise `amount` is the
      // intended total payment.
      if (invoiceParcelCheckbox && invoiceParcelCheckbox.checked && (parseInt(installments && installments.value,10) || 1) > 1) {
        // Parcelamento: criar ajuste no dueISO e parcelas futuras (recorrência mensal)
        const n = Math.min(24, Math.max(2, parseInt(installments && installments.value, 10) || 2));
        const totalPayVal = Math.min(amount * n, remaining || amount * n);
        const perParcel = +(totalPayVal / n).toFixed(2);
        // 1) Ajuste que neutraliza parte da fatura no vencimento (somente o valor pago)
        const adjustTx = {
          id: Date.now(),
          desc: `Ajuste fatura – ${ctx.card}`,
          val: 0,
          method: 'Dinheiro',
          opDate: ctx.dueISO,
          postDate: ctx.dueISO,
          planned: false,
          invoiceAdjust: { card: ctx.card, dueISO: ctx.dueISO, amount: totalPayVal },
          ts: nowIso,
          modifiedAt: nowIso
        };
        try { addTxInternal(adjustTx); } catch (_) { setTxs(getTxs().concat([adjustTx])); }
        // 2) Série mensal de parcelas (Dinheiro) que impactam o saldo nas datas das parcelas
        {
          const baseDue = new Date(ctx.dueISO + 'T00:00:00');
          const by = baseDue.getFullYear();
          const bm = baseDue.getMonth();
          const bd = baseDue.getDate();
          const lastMonthIndex = bm + (n - 1);
          const lastDayOfTarget = new Date(by, lastMonthIndex + 1, 0).getDate();
          const lastInstDate = new Date(by, lastMonthIndex, Math.min(bd, lastDayOfTarget));
          const recurrenceEndDate = new Date(lastInstDate);
          recurrenceEndDate.setDate(recurrenceEndDate.getDate() + 1);
          const recurrenceEndISO = recurrenceEndDate.toISOString().slice(0,10);
          const firstInstISO = ctx.dueISO;
          const totalCents = Math.round(totalPayVal * 100);
          const perBaseCents = Math.floor(totalCents / n);
          const remainderCents = totalCents - (perBaseCents * n);
          const perBase = perBaseCents / 100;
          const remainder = remainderCents / 100;
          const masterId = Date.now() + 1;
          const masterTx = {
            id: masterId,
            desc: `Parcela fatura – ${ctx.card}`,
            val: -perBase,
            method: 'Dinheiro',
            opDate: firstInstISO,
            postDate: firstInstISO,
            recurrence: 'M',
            installments: n,
            planned: firstInstISO > todayFn(),
            recurrenceEnd: recurrenceEndISO,
            invoiceParcelOf: { card: ctx.card, dueISO: ctx.dueISO },
            ts: nowIso,
            modifiedAt: nowIso
          };
          if (remainderCents > 0) {
            masterTx.exceptions = masterTx.exceptions || [];
            if (!masterTx.exceptions.includes(firstInstISO)) masterTx.exceptions.push(firstInstISO);
            try { addTxInternal(masterTx); } catch (_) { setTxs(getTxs().concat([masterTx])); }
            const childTx = {
              id: masterId + 1,
              parentId: masterId,
              desc: masterTx.desc,
              val: -(perBase + remainder),
              method: masterTx.method,
              opDate: firstInstISO,
              postDate: firstInstISO,
              recurrence: '',
              installments: 1,
              planned: masterTx.planned,
              ts: nowIso,
              modifiedAt: nowIso
            };
            try { addTxInternal(childTx); } catch (_) { setTxs(getTxs().concat([childTx])); }
          } else {
            try { addTxInternal(masterTx); } catch (_) { setTxs(getTxs().concat([masterTx])); }
          }
        }
      } else {
        // Pagamento sem parcelar
        const payVal = Math.min(amount, remaining || amount);
        const totalAbs = Number(ctx.totalAbs) || 0;
        const adjustedBefore = Number(ctx.adjustedBefore) || 0;
        const adjustAmount = Math.max(0, totalAbs - adjustedBefore);
        const adjustTx = {
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
        };
        try { addTxInternal(adjustTx); } catch (_) { setTxs(getTxs().concat([adjustTx])); }
        // Registro do pagamento (Dinheiro) no dia do pagamento
        const paymentTx = {
          id: Date.now() + 1,
          desc: `Pagamento fatura – ${ctx.card}`,
          val: -payVal,
          method: 'Dinheiro',
          opDate: payDate,
          postDate: payDate,
          planned: payDate > todayFn(),
          invoicePayment: { card: ctx.card, dueISO: ctx.dueISO },
          ts: nowIso,
          modifiedAt: nowIso
        };
        try { addTxInternal(paymentTx); } catch (_) { setTxs(getTxs().concat([paymentTx])); }
        const remainingAfter = Math.max(0, remaining - payVal);
        if (remainingAfter > 0) {
          const baseDue = new Date(ctx.dueISO + 'T00:00:00');
          const prevMonthName = baseDue.toLocaleDateString('pt-BR', { month: 'long' });
          const labelMonth = prevMonthName.charAt(0).toUpperCase() + prevMonthName.slice(1);
          const currentDay = baseDue.getDate();
          const nextDueCandidate = new Date(baseDue);
          nextDueCandidate.setMonth(nextDueCandidate.getMonth() + 1);
          const lastDayNextMonth = new Date(nextDueCandidate.getFullYear(), nextDueCandidate.getMonth() + 1, 0).getDate();
          const nextDueDate = new Date(nextDueCandidate.getFullYear(), nextDueCandidate.getMonth(), Math.min(currentDay, lastDayNextMonth));
          const nextDueISO = nextDueDate.toISOString().slice(0, 10);
          const rolloverTx = {
            id: Date.now() + 2,
            desc: `Pendente da fatura de ${labelMonth}`,
            val: -remainingAfter,
            method: ctx.card,
            opDate: ctx.dueISO,
            postDate: nextDueISO,
            planned: false,
            invoiceRolloverOf: { card: ctx.card, fromDueISO: ctx.dueISO },
            ts: nowIso,
            modifiedAt: nowIso
          };
          try { addTxInternal(rolloverTx); } catch (_) { setTxs(getTxs().concat([rolloverTx])); }
        }
      }
      // Exit invoice mode
      g.isPayInvoiceMode = false;
      g.pendingInvoiceCtx = null;
      // Persist and rerender
      saveFn('tx', getTxs());
      toggleModalFn();
      // No need to manually render - Firebase listener will trigger renderTable automatically
      showToastFn('Pagamento de fatura lançado', 'success');
      // Write back state
      g.isEditing = isEditing;
      g.pendingEditMode = pendingEditMode;
      g.pendingEditTxId = pendingEditTxId;
      g.pendingEditTxIso = pendingEditTxIso;
      return;
    }
    // Adição normal (não em invoice mode)
    {
      const newDesc    = desc && desc.value ? desc.value.trim() : '';
      let newVal = parseCurrency(val && val.value);
      const activeTypeEl = document.querySelector('.value-toggle button.active');
      const activeType = activeTypeEl && activeTypeEl.dataset ? activeTypeEl.dataset.type : 'expense';
      if (activeType === 'expense') newVal = -Math.abs(newVal);
      // Get method from active button or hidden select
      let newMethod = met && met.value;
      if (!newMethod || newMethod === 'undefined') {
        const activeMethodBtn = document.querySelector('.switch-option.active');
        newMethod = activeMethodBtn ? activeMethodBtn.dataset.method : 'Dinheiro';
      }
      newMethod = resolveSelectedMethod(newMethod);
      const newOpDate  = date && date.value;
      const newPostDate = computePostDate(newOpDate, newMethod);
      const newRecurrence  = recurrence && recurrence.value;
      const newInstallments = parseInt(installments && installments.value, 10) || 1;
      const newBudgetTag = normalizeTag((window.__gastos?.pendingBudgetTag) || extractFirstHashtag(newDesc));
      const recurrenceActive = isRecurrenceActive(newRecurrence);
      // Only validate future date with recurrence if NOT in edit-mode for an existing recurring transaction
      // When editing via single/future/all mode, the user is editing a specific occurrence, not the master
      if (recurrenceActive && isFutureDate(newOpDate) && !g.pendingEditMode) {
        if (blockMessage('A data selecionada é incompatível com recorrências. Use a data de hoje ou desative a recorrência.')) {
          return;
        }
      }
      if (recurrenceActive && hasActiveRecurringBudgetForTag(newBudgetTag)) {
        if (blockMessage(`Já existe um orçamento recorrente ativo para ${newBudgetTag}.`)) {
          return;
        }
      }
      // Anti-duplicidade (ad-hoc): impedir criar novo orçamento futuro
      // quando já existe ciclo ativo para a mesma tag abrangendo a data.
      // Allow future planned launches tied to an EXISTING active budget cycle.
      // Only prevent creating a NEW ad‑hoc budget if a cycle already covers the date.
      let budgetCoversOpDate = false;
      if (!recurrenceActive && isFutureDate(newOpDate) && budgetsEnabled && newBudgetTag && findActiveBudgetFn) {
        try {
          const activeBudget = findActiveBudgetFn(newBudgetTag);
          if (activeBudget && activeBudget.status === 'active' && isWithinCycle(activeBudget, newOpDate)) {
            budgetCoversOpDate = true; // ok to add planned tx; just don't create budget
          }
        } catch (_) { /* ignore */ }
      }
      // Determine planned/paga using the new status toggle
      function isMarkAsPaid() {
        try {
          if (newOpDate && newOpDate > todayFn()) return false;
          const group = document.querySelector('.paid-toggle');
          const active = group ? group.querySelector('.seg-option.active') : null;
          return active ? active.dataset.paid === '1' : true;
        } catch (_) { return !(newOpDate > todayFn()); }
      }
      const newTx = {
        id: Date.now(),
        desc: newDesc,
        val: newVal,
        method: newMethod,
        opDate: newOpDate,
        postDate: newPostDate,
        recurrence: newRecurrence || '',
        installments: newInstallments,
        planned: !isMarkAsPaid(),
        ts: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        budgetTag: newBudgetTag
      };
      // Force add transaction to state immediately
      const currentTxs = getTxs() || [];
      const updatedTxs = [...currentTxs, newTx];
      setTxs(updatedTxs);
      
      // Update ALL global references to transactions
      g.transactions = updatedTxs;
      if (window.__gastos) window.__gastos.transactions = updatedTxs;
      
      // Force update the module-level transactions variable
      if (typeof window.setTransactions === 'function') {
        window.setTransactions(updatedTxs);
      }
      // If a budget already covers the future date, do NOT attempt to create another
      // ad‑hoc budget; otherwise upsert will materialize the reservation for that tag/date.
      if (!(budgetCoversOpDate && isFutureDate(newOpDate))) {
        tryUpsertBudget(newTx, {
          occurrenceISO: newTx.opDate,
          nextOccurrenceISO: newTx.postDate,
          recurrenceId: newTx.recurrence ? newTx.id : null,
          creationDate: todayFn(),
        });
      }
      
      // Persist to storage
      console.log(`💾 Transaction: Saving "${newTx.desc}" (${newTx.val > 0 ? '+' : ''}${newTx.val}) on ${newTx.opDate}`);
      saveFn('tx', updatedTxs);
      refreshBudgetsCache(updatedTxs);
      
      // Reset form before closing
      if (desc) desc.value = '';
      if (val) val.value = '';
      if (date) date.value = todayFn();
      // Clear pending budget pill/state
      try {
        if (window.__gastos) window.__gastos.pendingBudgetTag = null;
        const chip = document.getElementById('budgetTagChip');
        if (chip && chip.parentElement) chip.parentElement.removeChild(chip);
      } catch (_) {}
      
      // Close modal
      toggleModalFn();
      try { g.__lastAddSucceeded = true; } catch (_) {}
      
      // No need to manually render - Firebase listener will trigger renderTable automatically
      
      showToastFn(newTx.planned ? 'Operação salva (planejada)' : 'Operação adicionada', 'success');
      // Write back state
      g.isEditing = isEditing;
      g.pendingEditMode = pendingEditMode;
      g.pendingEditTxId = pendingEditTxId;
      g.pendingEditTxIso = pendingEditTxIso;
      return;
    }
  } finally {
    // Ensure state variables are synced back even if an error occurs
    g.isEditing = isEditing;
    g.pendingEditMode = pendingEditMode;
    g.pendingEditTxId = pendingEditTxId;
    g.pendingEditTxIso = pendingEditTxIso;
    g.isPayInvoiceMode = isPayInvoiceMode;
    g.pendingInvoiceCtx = pendingInvoiceCtx;
    g.transactions = transactions;
  }
}

// ----- Budget tag pill (chip) selection API -----
(function attachBudgetTagChip(){
  try {
    const g = (window.__gastos = window.__gastos || {});
    if (g.setPendingBudgetTag) return; // don't re-register

    const ensureStyles = () => {
      if (document.getElementById('budget-chip-styles')) return;
      const st = document.createElement('style');
      st.id = 'budget-chip-styles';
      st.textContent = `
        #budgetTagChip{position:absolute;z-index:10000;display:inline-flex;gap:8px;align-items:center;padding:5px 10px;border-radius:999px;background:rgba(93,211,158,0.18);color:#EDEDEF;border:1px solid #5DD39E;box-shadow:0 4px 14px rgba(0,0,0,0.25);font-size:12.5px;font-weight:700; height:24px;}
        #budgetTagChip .x{cursor:pointer;opacity:.9; font-weight:700}
        #budgetTagChip .x:hover{opacity:1}
        html[data-theme="light"] #budgetTagChip{background:rgba(46,191,140,0.12);color:#111;border:1px solid #2B8B66}
      `;
      document.head.appendChild(st);
    };

    const capitalise = (tag) => {
      const t = String(tag || '').replace(/^#+/, '').trim();
      if (!t) return '';
      return t.charAt(0).toUpperCase() + t.slice(1);
    };

    const positionChip = () => {
      const chip = document.getElementById('budgetTagChip');
      const modal = document.getElementById('txModal');
      const descInput = document.getElementById('desc');
      if (!chip || !modal || !descInput) return;
      const r = descInput.getBoundingClientRect();
      const host = modal.getBoundingClientRect();
      // center the chip vertically inside the input and add left padding
      const chipH = chip.getBoundingClientRect().height || 28;
      const top = r.top - host.top + Math.max(0, (r.height - chipH) / 2);
      const left = r.left - host.left + 8;
      chip.style.top = `${top}px`;
      chip.style.left = `${left}px`;
    };

    const setInputPaddingForChip = () => {
      try {
        const descInput = document.getElementById('desc');
        const chip = document.getElementById('budgetTagChip');
        if (!descInput || !chip) return;
        const chipRect = chip.getBoundingClientRect();
        const inputRect = descInput.getBoundingClientRect();
        // padding-left equals chip width plus spacing to start typing after the chip
        const leftPad = Math.max(0, (chipRect.width + 16));
        // Keep right padding intact
        descInput.style.paddingLeft = `${leftPad}px`;
      } catch (_) {}
    };

    const clearInputPaddingForChip = () => {
      try { const descInput = document.getElementById('desc'); if (descInput) descInput.style.paddingLeft = ''; } catch (_) {}
    };

    const showChip = (tag) => {
      ensureStyles();
      const modal = document.getElementById('txModal');
      if (!modal) return;
      let chip = document.getElementById('budgetTagChip');
      if (!chip) {
        chip = document.createElement('div');
        chip.id = 'budgetTagChip';
        chip.innerHTML = `<span class="label"></span><span class="x" aria-label="Remover">✕</span>`;
        modal.appendChild(chip);
        chip.querySelector('.x').onclick = () => {
          try { g.pendingBudgetTag = null; } catch (_) {}
          if (chip && chip.parentElement) chip.parentElement.removeChild(chip);
          try {
            const input = document.getElementById('desc');
            if (input) {
              input.style.paddingLeft = '';
              input.focus();
              if (typeof input.setSelectionRange === 'function') input.setSelectionRange(0, 0);
            }
          } catch (_) {}
        };
      }
      const lbl = chip.querySelector('.label');
      if (lbl) lbl.textContent = capitalise(tag);
      positionChip();
      // After layout, adjust input padding so typing starts after the pill
      requestAnimationFrame(() => { positionChip(); setInputPaddingForChip(); });
    };

    g.setPendingBudgetTag = (tag /*, budget */) => {
      g.pendingBudgetTag = tag;
      showChip(tag);
      try { document.getElementById('desc')?.focus(); } catch (_) {}
    };

    const reflow = () => { positionChip(); setInputPaddingForChip(); };
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    // When modal closes or form resets elsewhere, ensure padding is cleared
    document.addEventListener('txModalResetPadding', clearInputPaddingForChip);
  } catch (_) {}
})();
