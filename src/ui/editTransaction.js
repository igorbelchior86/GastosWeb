import { isDetachedOccurrence } from '../utils/data.js';

/**
 * Provides a helper to initialize the edit transaction logic. The heavy
 * implementation of `editTx` has been extracted from main.js to reduce
 * its size. This function reads all necessary dependencies from
 * `window.__gastos`, avoiding a long parameter list. After calling
 * `setupEditTransaction()`, the `editTx` function will be attached to
 * `window.__gastos` and can be invoked via g.editTx(id).
 */

export function setupEditTransaction() {
  const g = (window.__gastos = window.__gastos || {});
  // Define editTx only once
  if (g.__editTxInit) return g.editTx;

  const {
    getTransactions,
    transactions,
    resetTxModal,
    desc,
    safeFmtNumber,
    met,
    renderCardSelectorHelper,
    cards,
    date,
    recurrence,
    installments,
    addBtn,
    txModalTitle,
    txModal,
    toggleTxModal
  } = g;

  /**
   * Opens the transaction modal pre-filled for editing the given id. The
   * function mirrors the original implementation from main.js but uses
   * dependencies sourced from the global state.
   * @param {number} id Transaction id to edit
   */
  function editTx(id) {
    const txs = (typeof getTransactions === 'function' ? getTransactions() : transactions) || [];
    let t = txs.find(x => x && x.id === id);
    if (!t) return;
    
    // ALWAYS set the pending ID
    g.pendingEditTxId = id;
    
    // Only set pendingEditTxIso if not already set by openEditFlow
    // (openEditFlow sets the correct occurrence date, t.opDate is always the master's date)
    if (!g.pendingEditTxIso) {
      g.pendingEditTxIso = t.opDate;
    }

    // If we are editing a recurring master but a detached child exists for the
    // selected occurrence date, prefer the detached child so we show its edited values.
    try {
      const iso = g.pendingEditTxIso;
      const compareIds = (a, b) => {
        try { return (typeof sameId === 'function') ? sameId(a, b) : String(a) === String(b); }
        catch { return String(a) === String(b); }
      };
      const isMaster = !!(t && t.recurrence && String(t.recurrence).trim());
      if (isMaster && iso) {
        const child = txs.find(x => x && x.parentId && compareIds(x.parentId, t.id) && !x.recurrence && x.opDate === iso);
        if (child) {
          t = child;
          // Also update the pending ID so subsequent saves/edit reopen target the child
          g.pendingEditTxId = child.id;
        }
      }
    } catch (_) {}
    
    // Check if we already have a pendingEditMode set (user selected an option from the context modal)
    const alreadyScoped = !!g.pendingEditMode;
    
    const recurrenceDetected = (() => {
      if (t.recurrence && String(t.recurrence).trim()) return true;
      if (t.parentId) {
        const parent = txs.find(p => p && String(p.id) === String(t.parentId));
        if (parent && parent.recurrence && String(parent.recurrence).trim()) return true;
      }
      return false;
    })();
    const detachedOccurrence = isDetachedOccurrence ? isDetachedOccurrence(t) : (!!t.parentId && !t.recurrence);
    
    // Only show the scope modal if:
    // 1. We don't already have a scope selected (alreadyScoped is false)
    // 2. There is a recurrence detected
    // 3. It's not a detached occurrence
    if (!alreadyScoped && recurrenceDetected && !detachedOccurrence) {
      const scopeModal = g.editRecurrenceModal || document.getElementById('editRecurrenceModal');
      if (scopeModal) {
        if (g.plannedModal && !g.plannedModal.classList.contains('hidden')) {
          g.reopenPlannedAfterEdit = true;
          g.plannedModal.classList.add('hidden');
          if (typeof g.updateModalOpenState === 'function') g.updateModalOpenState();
        }
        scopeModal.classList.remove('hidden');
        if (typeof g.updateModalOpenState === 'function') g.updateModalOpenState();
        return;
      }
    }
    
    // If we reach here, either:
    // - User already selected a scope (single/future/all)
    // - Or it's not a recurring transaction
    // - Or it's a detached occurrence
    // In all cases, proceed to open the transaction modal for editing
    
    // Hard reset to avoid inheriting previous edit state
    if (typeof resetTxModal === 'function') resetTxModal();
    // 1) Description
    if (desc) desc.value = t.desc || '';
    // 2) Value + toggle expense/income
    const valInput = document.getElementById('value');
    if (valInput) {
      const signedVal = Number(t.val || 0);
      valInput.value = safeFmtNumber ? safeFmtNumber(signedVal, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }) : String(signedVal);
    }
    // Toggle the active button based on sign
    document.querySelectorAll('.value-toggle button').forEach(b => b.classList.remove('active'));
    const type = (Number(t.val || 0) < 0) ? 'expense' : 'income';
    const typeBtn = document.querySelector(`.value-toggle button[data-type="${type}"]`);
    if (typeBtn) typeBtn.classList.add('active');
    if (type !== 'expense' && valInput) {
      // Ensure positive numbers don't keep stray negatives
      valInput.value = valInput.value.replace(/^-/, '');
    }
    // 3) Payment method (pill + select + card radios)
    const methodSwitch  = document.querySelector('.method-switch');
    const cardSelectorEl= document.getElementById('cardSelector');
    document.querySelectorAll('.switch-option').forEach(b => b.classList.remove('active'));
    if (t.method === 'Dinheiro') {
      if (met) met.value = 'Dinheiro';
      if (methodSwitch) methodSwitch.dataset.selected = 'Dinheiro';
      const cashBtn = document.querySelector('.switch-option[data-method="Dinheiro"]');
      if (cashBtn) cashBtn.classList.add('active');
      if (cardSelectorEl) { cardSelectorEl.innerHTML = ''; cardSelectorEl.hidden = true; }
    } else {
      if (met) met.value = t.method;
      if (methodSwitch) methodSwitch.dataset.selected = 'Cartão';
      const cardBtn = document.querySelector('.switch-option[data-method="Cartão"]');
      if (cardBtn) cardBtn.classList.add('active');
      // Render card options and mark the current card. Use helper to rebuild radio inputs.
      try {
        if (renderCardSelectorHelper) {
          renderCardSelectorHelper({ cards, hiddenSelect: document.getElementById('method') });
        }
      } catch (_) {}
      if (cardSelectorEl) {
        const sel = cardSelectorEl.querySelector(`input[name="cardChoice"][value="${CSS.escape(t.method)}"]`);
        if (sel) sel.checked = true;
        cardSelectorEl.hidden = false;
      }
    }
    // 4) Date respects pendingEditMode/pendingEditTxIso stored on g
    if (date) date.value = (g.pendingEditMode && g.pendingEditTxIso) ? g.pendingEditTxIso : t.opDate;
    // 5) Recurrence / installments
    if (recurrence) recurrence.value = t.recurrence || '';
    if (installments) installments.value = String(t.installments || 1);
    // 6) Update state and labels BEFORE opening modal
    g.isEditing = id;
    if (addBtn) addBtn.textContent = 'Salvar';
    if (txModalTitle) txModalTitle.textContent = 'Editar operação';
    // 7) Open modal only if hidden
    if (txModal && txModal.classList.contains('hidden')) {
      if (typeof toggleTxModal === 'function') toggleTxModal();
    }
    const vEl = document.getElementById('value');
    if (vEl && typeof vEl.focus === 'function') {
      vEl.focus();
      if (typeof vEl.select === 'function') vEl.select();
    }
  }
  // expose on global state and return
  g.editTx = editTx;
  g.__editTxInit = true;
  return editTx;
}
