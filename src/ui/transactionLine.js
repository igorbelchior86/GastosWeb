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
    if (tx && tx.planned) d.dataset.planned = '1';

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
    // Helper: indent second line under description text
    const indentUnderDesc = (container) => {
      try {
        const title = container.querySelector('.left-title, .title-row');
        const desc  = container.querySelector('.desc-text');
        const sub   = container.querySelector('.sub-row');
        if (!title || !desc || !sub) return;
        const tl = title.getBoundingClientRect();
        const dl = desc.getBoundingClientRect();
        const px = Math.max(0, Math.round(dl.left - tl.left));
        sub.style.paddingLeft = px + 'px';
      } catch (_) {}
    };
    // Timestamp container (line 2): short date "DD de Mmm"
    const ts = document.createElement('div');
    ts.className = 'timestamp';
    (function buildTimestamp() {
      const [y, mo, da] = (tx.opDate || '').split('-').map(Number);
      const dateObj = (isFinite(y) && isFinite(mo) && isFinite(da)) ? new Date(y, mo - 1, da) : new Date();
      // Format: 10 de Out, 21 de Set
      let mon = dateObj.toLocaleDateString('pt-BR', { month: 'short' }) || '';
      mon = mon.replace('.', '');
      const cap = mon ? (mon.charAt(0).toUpperCase() + mon.slice(1)) : '';
      const dd = String(dateObj.getDate()).padStart(2, '0');
      ts.textContent = `${dd} de ${cap}`;
    })();

    // Helper: if card transaction, append a small invoice indicator (card + due date)
    const maybeAppendInvoiceIndicator = (container) => {
      try {
        if (!container) return;
        const isCash = String(tx.method || 'Dinheiro') === 'Dinheiro';
        const dueISO = tx && tx.postDate;
        if (isCash || !dueISO) return;
        // Format due date
        const [yy, mm, dd] = String(dueISO).split('-').map(Number);
        const dueObj = (isFinite(yy) && isFinite(mm) && isFinite(dd)) ? new Date(yy, mm - 1, dd) : null;
        let dueLabel = dueISO;
        if (dueObj) {
          let m2 = dueObj.toLocaleDateString('pt-BR', { month: 'short' }) || '';
          m2 = m2.replace('.', '');
          const cap2 = m2 ? (m2.charAt(0).toUpperCase() + m2.slice(1)) : '';
          const d2 = String(dueObj.getDate()).padStart(2, '0');
          dueLabel = `${d2} de ${cap2}`;
        }
        const badge = document.createElement('span');
        badge.className = 'invoice-link-badge';
        const cardLabel = (tx.method && tx.method !== 'Dinheiro') ? String(tx.method) : 'Cartão';
        badge.textContent = `${cardLabel} • fatura ${dueLabel}`;
        badge.title = 'Fatura de cartão para esta compra';
        container.appendChild(badge);
      } catch (_) {}
    };

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
        labelWrapper.className = 'desc-text';
        labelWrapper.textContent = tx.desc;
        const leftText = document.createElement('div');
        leftText.className = 'left-text';
        const titleRow = document.createElement('div');
        titleRow.className = 'left-title';
        // Line 1: title + divider + method icon (icon after text)
        titleRow.appendChild(labelWrapper);
        const titleSep = document.createElement('span');
        titleSep.className = 'title-sep';
        titleRow.appendChild(titleSep);
        const methodIcon = document.createElement('span');
        methodIcon.className = `method-icon ${tx.method === 'Dinheiro' ? 'icon-money' : 'icon-card'}`;
        titleRow.appendChild(methodIcon);
        // Line 2: date + optional tag + optional deferred badge
        const subRow = document.createElement('div');
        subRow.className = 'sub-row';
        subRow.appendChild(ts);
        maybeAppendInvoiceIndicator(subRow);
        if (tx.budgetTag) {
          const chip = document.createElement('span');
          chip.className = 'tag-chip';
          chip.textContent = String(tx.budgetTag).replace(/^#+/, '');
          subRow.appendChild(chip);
        }
        const defers = typeof tx.deferCount === 'number' ? tx.deferCount
          : (typeof tx.deferredCount === 'number' ? tx.deferredCount
          : (typeof tx.adiado === 'number' ? tx.adiado : 0));
        if (defers > 0) {
          const badge = document.createElement('span');
          badge.className = 'badge-deferred';
          badge.textContent = `Adiado x${defers}`;
          subRow.appendChild(badge);
        }
        appendInvoiceBadge(titleRow);
        leftText.appendChild(titleRow);
        leftText.appendChild(subRow);
        left.appendChild(checkbox);
        left.appendChild(leftText);
        indentUnderDesc(left);
      } else {
        const descText = (tx.desc || '').trim();
        const leftText = document.createElement('div');
        leftText.className = 'left-text';
        const titleRow = document.createElement('div');
        titleRow.className = 'left-title';
        if (descText) {
          const descNode = document.createElement('span');
          descNode.className = 'desc-text';
          descNode.textContent = descText;
          titleRow.appendChild(descNode);
        }
        // Ensure icon appears after text with a separator
        const titleSep2 = document.createElement('span');
        titleSep2.className = 'title-sep';
        titleRow.appendChild(titleSep2);
        const methodIconA = document.createElement('span');
        methodIconA.className = `method-icon ${tx.method === 'Dinheiro' ? 'icon-money' : 'icon-card'}`;
        titleRow.appendChild(methodIconA);
        // Append budget pill if linked to a budget
        if (tx && tx.budgetTag) {
          const pill = document.createElement('span');
          pill.className = 'budget-pill';
          const label = String(tx.budgetTag).replace(/^#+/, '');
          const cap = label ? (label.charAt(0).toUpperCase() + label.slice(1)) : '';
          pill.textContent = cap;
          pill.title = 'Orçamento';
          titleRow.appendChild(pill);
          if (!descText) titleRow.classList.add('only-pill');
        }
        appendInvoiceBadge(titleRow);
        leftText.appendChild(titleRow);
        leftText.appendChild(ts);
        left.appendChild(leftText);
        indentUnderDesc(left);
      }
      // (No recurrence icons in the compact two-line layout)
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
      const descText2 = (tx.desc || '').trim();
      const leftText = document.createElement('div');
      leftText.className = 'left-text';
      const titleRow = document.createElement('div');
      titleRow.className = 'left-title';
      // Title will be appended after the method icon
      // Line 1: title + divider + method icon (icon after text)
      const descNode2 = document.createElement('span');
      descNode2.className = 'desc-text';
      descNode2.textContent = descText2;
      titleRow.appendChild(descNode2);
      const titleSep3 = document.createElement('span');
      titleSep3.className = 'title-sep';
      titleRow.appendChild(titleSep3);
      const methodIcon2 = document.createElement('span');
      methodIcon2.className = `method-icon ${tx.method === 'Dinheiro' ? 'icon-money' : 'icon-card'}`;
      titleRow.appendChild(methodIcon2);
      // Line 2
      const subRow2 = document.createElement('div');
      subRow2.className = 'sub-row';
      subRow2.appendChild(ts);
      maybeAppendInvoiceIndicator(subRow2);
      if (tx && tx.budgetTag) {
        const chip2 = document.createElement('span');
        chip2.className = 'tag-chip';
        chip2.textContent = String(tx.budgetTag).replace(/^#+/, '');
        subRow2.appendChild(chip2);
      }
      const defers2 = typeof tx.deferCount === 'number' ? tx.deferCount
        : (typeof tx.deferredCount === 'number' ? tx.deferredCount
        : (typeof tx.adiado === 'number' ? tx.adiado : 0));
      if (defers2 > 0) {
        const badge2 = document.createElement('span');
        badge2.className = 'badge-deferred';
        badge2.textContent = `Adiado x${defers2}`;
        subRow2.appendChild(badge2);
      }
      appendInvoiceBadge(titleRow);
      leftText.appendChild(titleRow);
      leftText.appendChild(subRow2);
      left.appendChild(leftText);
      indentUnderDesc(left);
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
    // Align second line exactly under description after insertion in DOM
    try {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          try { (function(){
            const title = left.querySelector('.left-title, .title-row');
            const desc  = left.querySelector('.desc-text');
            const sub   = left.querySelector('.sub-row');
            if (!title || !desc || !sub) return;
            const tl = title.getBoundingClientRect();
            const dl = desc.getBoundingClientRect();
            const px = Math.max(0, Math.round(dl.left - tl.left));
            sub.style.paddingLeft = px + 'px';
          })(); } catch(_) {}
        });
      }
    } catch (_) {}
    return wrap;
  };

  // Attach deps reference to makeLine so external code can update it
  makeLine.__deps__ = deps;

  return makeLine;
}

// Provide minimal styles for the budget pill shown in executed lines
(function ensureBudgetPillStyles(){
  try {
    if (document.getElementById('budget-pill-styles')) return;
    const st = document.createElement('style');
    st.id = 'budget-pill-styles';
    st.textContent = `
      /* Method icon after title (spacing via flex gap, no margins) */
      .method-icon{ display:inline-block; width:18px; height:18px; margin:0; vertical-align:middle; background:#fff; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.35)); }
      html[data-theme="light"] .method-icon{ background:#111; filter:none; }

      /* Second line */
      .sub-row{ display:flex; align-items:center; gap:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#B3B3B3; margin-top:4px; }
      /* Ensure timestamp and tag are vertically centered */
      .sub-row .timestamp{ display:inline-flex; align-items:center; height:20px; line-height:20px; font-size:13px; color:inherit; }
      html[data-theme="light"] .sub-row{ color:#6b7280; }

      /* Round bullet divider between title and icon (spacing via flex gap) */
      .title-sep{ display:inline-block; width:6px; height:6px; border-radius:999px; background:rgba(255,255,255,0.35); margin:0; vertical-align:middle; }
      html[data-theme="light"] .title-sep{ background:rgba(0,0,0,0.28); }

      .sub-row .tag-chip{ display:inline-flex; align-items:center; height:20px; padding:0 10px; border-radius:999px; background:#2a2a2c; color:#5DD39E; border:1px solid #3e3e40; font-size:12px; font-weight:600; }
      html[data-theme="light"] .sub-row .tag-chip{ background:#f2f2f2; color:#2B8B66; border:1px solid rgba(0,0,0,0.12); }

      .sub-row .badge-deferred{ display:inline-flex; align-items:center; height:20px; padding:0 10px; border-radius:999px; background:#3a3a3c; color:#B3B3B3; font-size:12px; font-weight:600; }
      html[data-theme="light"] .sub-row .badge-deferred{ background:#e5e7eb; color:#4b5563; }

      /* Small badge indicating which invoice (card + due date) this purchase belongs to */
      .sub-row .invoice-link-badge{ display:inline-flex; align-items:center; height:20px; padding:0 8px; border-radius:999px; background:rgba(0,0,0,0.18); color:#c9c9c9; font-size:12px; font-weight:600; border:1px solid rgba(255,255,255,0.08); }
      html[data-theme="light"] .sub-row .invoice-link-badge{ background:#f3f4f6; color:#374151; border:1px solid rgba(0,0,0,0.08); }
    `;
    document.head.appendChild(st);
  } catch (_) {}
})();
