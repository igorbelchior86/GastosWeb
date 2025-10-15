// Transaction line rendering extracted from main.js.
// This module defines a factory that returns a function capable of rendering
// a single transaction row, handling both regular and planned contexts.

/**
 * Initialise the transaction line creator.
 *
 * The returned `makeLine` function builds a DOM element representing a
 * transaction. All external dependencies (such as data access, handlers and
 * helpers) must be provided via the `deps` object.
 *
 * @param {Object} deps Dependencies required to build a transaction line.
 * @param {Function} deps.getTransactions Function returning the latest transaction list.
 * @param {Array} deps.transactions Fallback transaction list when getTransactions is not provided.
 * @param {Function} deps.togglePlanned Handler to toggle planned status (id, opDate).
 * @param {Function} deps.openEditFlow Handler to open the edit flow (tx, opDate).
 * @param {Function} deps.delTx Handler to delete a transaction (id, opDate).
 * @param {Function} deps.sameId Helper to compare ids (a, b).
 * @param {Function} deps.occursOn Helper to test recurrence occurrence (tx, iso).
 * @param {Function} deps.todayISO Helper returning today's ISO date.
 * @param {Function} deps.safeFmtCurrency Helper to format currency values.
 * @returns {Function} makeLine(tx, disableSwipe, isInvoiceContext)
 */
export function initTransactionLine(deps) {
  const {
    getTransactions,
    transactions,
    openEditFlow,
    delTx,
    sameId,
    occursOn,
    todayISO,
    safeFmtCurrency
  } = deps;

  // Note: togglePlanned is NOT destructured here because it may be reassigned
  // after initialization. Instead, we'll access it via deps or window.__gastos
  // to ensure we always use the latest version.
  const getTogglePlanned = () => {
    // First try deps if it was passed and has togglePlanned
    if (deps?.togglePlanned) return deps.togglePlanned;
    // Fall back to window.__gastos
    return window.__gastos?.togglePlanned;
  };

  // Store reference to deps on the makeLine function so it can be updated externally
  const makeLine = function(tx, disableSwipe = false, isInvoiceContext = false) {
    // Access the latest transaction list on demand
    const txs = getTransactions ? getTransactions() : transactions;
    const wrap = document.createElement('div');
    wrap.className = 'swipe-wrapper';
    const actions = document.createElement('div');
    actions.className = 'swipe-actions';

    const existsInStore = (txs || []).some(item => item && String(item.id) === String(tx.id));
    const actionTargetId = existsInStore ? tx.id : (tx.parentId || tx.id);
    const actionTargetTx = (txs || []).find(item => item && String(item.id) === String(actionTargetId)) || tx;

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

    // Operation line container
    const d = document.createElement('div');
    d.className = 'op-line';
    d.dataset.txId = tx.id;
    d.dataset.date = tx.opDate; // Store the occurrence date for edit operations

    // Build content
    const topRow = document.createElement('div');
    topRow.className = 'op-main';
    const left = document.createElement('div');
    left.className = 'op-left';
    // Helper to append invoice badge when applicable
    const appendInvoiceBadge = (target) => {
      if (!target || !tx.invoicePayment) return;
      const badge = document.createElement('span');
      badge.className = 'invoice-payment-badge';
      badge.textContent = 'Pagamento de fatura';
      target.appendChild(badge);
    };
    // Timestamp container
    const ts = document.createElement('div');
    ts.className = 'timestamp';
    (function buildTimestamp() {
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
        if (tx.ts) {
          const timeOnly = new Date(tx.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
          ts.textContent = `${timeOnly}`;
        } else {
          ts.textContent = `${dateStr}`;
        }
      } else if (tx.opDate === todayISO() && tx.ts) {
        const timeStr = new Date(tx.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
        ts.textContent = `${timeStr} - ${methodLabel}`;
      } else {
        ts.textContent = `${dateStr} - ${methodLabel}`;
      }
    })();

    if (disableSwipe === true) {
      // Planned modal: no swipe actions
      if (tx.planned) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'plan-check';
        checkbox.name = 'planned';
        checkbox.onchange = (ev) => {
          ev.stopPropagation();
          // Get togglePlanned dynamically to ensure latest version
          const togglePlannedFn = getTogglePlanned();
          if (typeof togglePlannedFn === 'function') {
            togglePlannedFn(actionTargetId, tx.opDate);
          }
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
      // Recurrence icon logic
      const t = tx;
      const hasRecurrence = (() => {
        if (typeof t.recurrence === 'string' && t.recurrence.trim() !== '') return true;
        if (t.parentId) {
          const master = (txs || []).find(p => sameId(p.id, t.parentId));
          if (master && typeof master.recurrence === 'string' && master.recurrence.trim() !== '') return true;
        }
        for (const p of (txs || [])) {
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
        const t2 = tx;
        const hasRecurrenceFinal =
          (typeof t2.recurrence === 'string' && t2.recurrence.trim() !== '') ||
          (t2.parentId && (txs || []).some(p => sameId(p.id, t2.parentId) && typeof p.recurrence === 'string' && p.recurrence.trim() !== ''));
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
          // Get togglePlanned dynamically to ensure latest version
          const togglePlannedFn = getTogglePlanned();
          if (typeof togglePlannedFn === 'function') {
            togglePlannedFn(actionTargetId, tx.opDate);
          }
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
      const tRec = tx;
      const hasRecurrence = (() => {
        if (typeof tRec.recurrence === 'string' && tRec.recurrence.trim() !== '') return true;
        if (tRec.parentId) {
          const master = (txs || []).find(p => p.id === tRec.parentId);
          if (master && typeof master.recurrence === 'string' && master.recurrence.trim() !== '') return true;
        }
        for (const p of (txs || [])) {
          if (typeof p.recurrence === 'string' && p.recurrence.trim() !== '') {
            if (occursOn(p, tRec.opDate)) {
              if (p.desc === tRec.desc || p.val === tRec.val) return true;
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
        const t2 = tx;
        const hasRecurrenceFinal =
          (typeof t2.recurrence === 'string' && t2.recurrence.trim() !== '') ||
          (t2.parentId && (txs || []).some(p => p.id === t2.parentId && typeof p.recurrence === 'string' && p.recurrence.trim() !== ''));
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
    value.textContent = safeFmtCurrency(tx.val, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (tx.val < 0) {
      value.classList.add('negative');
    } else {
      value.classList.add('positive');
    }
    right.appendChild(value);
    topRow.appendChild(left);
    topRow.appendChild(right);
    d.appendChild(topRow);
    wrap.appendChild(actions);
    wrap.appendChild(d);
    return wrap;
  };

  // Attach deps reference to makeLine so external code can update it
  makeLine.__deps__ = deps;

  return makeLine;
}