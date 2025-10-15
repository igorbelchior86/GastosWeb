// editFlowHelper.js
//
// The openEditFlow function originally lived in main.js. It contains
// non‑trivial logic around determining whether an edit should target a
// single transaction or recur across related transactions. To reduce
// main.js’s footprint, this module exports a factory that binds
// openEditFlow to an external context. The context exposes getters
// and setters for mutable state and references to DOM elements and
// helper functions.

/**
 * Create a bound openEditFlow function.
 *
 * @param {Object} ctx
 * @param {Object} ctx.transactionsRef            Ref with get/set to access the transactions array.
 * @param {Function} ctx.occursOn                Function (tx, iso) => boolean, to check recurrence occurrence.
 * @param {?Element} ctx.plannedModal            The planned transactions modal.
 * @param {?Element} ctx.editRecurrenceModal     Modal shown when editing recurring transactions.
 * @param {Function} ctx.updateModalOpenState    Function to update global modal open state.
 * @param {Object} ctx.reopenPlannedAfterEditRef Ref with get/set for reopenPlannedAfterEdit boolean.
 * @param {Object} ctx.pendingEditModeRef        Ref with get/set for pending edit mode string.
 * @param {Object} ctx.pendingEditTxIdRef        Ref with get/set for pending edit transaction ID.
 * @param {Object} ctx.pendingEditTxIsoRef       Ref with get/set for pending edit transaction ISO date.
 * @param {Function} ctx.isDetachedOccurrence    Determines if a transaction is detached from a recurrence.
 * @param {Function} ctx.editTx                  Callback to trigger the actual edit flow on a transaction.
 * @returns {Function} openEditFlow bound to the provided context.
 */
export function createOpenEditFlow(ctx) {
  const {
    transactionsRef,
    occursOn,
    plannedModal,
    editRecurrenceModal,
    updateModalOpenState,
    reopenPlannedAfterEditRef,
    pendingEditModeRef,
    pendingEditTxIdRef,
    pendingEditTxIsoRef,
    isDetachedOccurrence,
    editTx,
  } = ctx;
  return function openEditFlow(tx, iso) {
    if (!tx) return;

    const txsRaw = transactionsRef ? transactionsRef.get() : null;
    const txs = Array.isArray(txsRaw) ? txsRaw : [];
    const compareIds = typeof sameId === 'function'
      ? (a, b) => {
          try { return sameId(a, b); }
          catch { return String(a) === String(b); }
        }
      : (a, b) => String(a) === String(b);
    const targetIso = iso || tx.opDate || null;

    const ensureModal = () =>
      editRecurrenceModal ||
      (typeof window !== 'undefined' && window.__gastos && window.__gastos.editRecurrenceModal) ||
      document.getElementById('editRecurrenceModal');
    const ensurePlannedModal = () =>
      plannedModal ||
      (typeof window !== 'undefined' && window.__gastos && window.__gastos.plannedModal) ||
      document.getElementById('plannedModal');

    const parent = tx.parentId
      ? txs.find(item => item && compareIds(item.id, tx.parentId))
      : null;

    let heuristicMaster = null;
    if (!tx.recurrence && !parent && targetIso) {
      for (const candidate of txs) {
        if (!candidate || !candidate.recurrence || !candidate.recurrence.trim()) continue;
        const occurs = typeof occursOn === 'function' ? occursOn(candidate, targetIso) : false;
        if (!occurs) continue;
        const sameMethod = (candidate.method || '') === (tx.method || '');
        const sameDesc   = (candidate.desc || '') === (tx.desc || '');
        const sameVal    = Math.abs(Number(candidate.val || 0) - Number(tx.val || 0)) < 0.005;
        if (sameMethod && (sameDesc || sameVal)) {
          heuristicMaster = candidate;
          break;
        }
      }
    }

    const master = (tx.recurrence && String(tx.recurrence).trim())
      ? tx
      : (parent || heuristicMaster);

    const parentForDetach = parent || (tx.parentId ? master : null);
    const parentHasException = parentForDetach && targetIso && Array.isArray(parentForDetach.exceptions)
      ? parentForDetach.exceptions.includes(targetIso)
      : false;
    const basicDetached = typeof isDetachedOccurrence === 'function'
      ? isDetachedOccurrence(tx)
      : (!!tx.parentId && !tx.recurrence);
    const isDetached = !!tx.parentId && parentHasException && basicDetached;

    const hasRecurrence = !!( (tx.recurrence && String(tx.recurrence).trim()) || tx.parentId || heuristicMaster );
    const modalEl = ensureModal();
    const plannedEl = ensurePlannedModal();

    const performEdit = (id) => {
      const reopen = plannedEl && !plannedEl.classList.contains('hidden');
      reopenPlannedAfterEditRef.set(!!reopen);
      if (reopen) {
        plannedEl.classList.add('hidden');
        updateModalOpenState && updateModalOpenState();
      }
      editTx(id);
    };

    if (hasRecurrence && !isDetached && modalEl) {
      const reopen = plannedEl && !plannedEl.classList.contains('hidden');
      reopenPlannedAfterEditRef.set(!!reopen);
      if (reopen) {
        plannedEl.classList.add('hidden');
        updateModalOpenState && updateModalOpenState();
      }
      pendingEditModeRef.set(null);
      pendingEditTxIdRef.set(master ? master.id : tx.id);
      const isoToSet = targetIso || tx.opDate || null;
      pendingEditTxIsoRef.set(isoToSet);
      modalEl.classList.remove('hidden');
      updateModalOpenState && updateModalOpenState();
      
      return;
    }

    pendingEditModeRef.set(null);
    pendingEditTxIdRef.set(null);
    pendingEditTxIsoRef.set(null);
    performEdit(master ? master.id : tx.id);
  };
}
