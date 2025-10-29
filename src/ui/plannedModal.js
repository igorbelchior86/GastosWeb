/**
 * Module responsible for handling the "Planejados" modal.
 *
 * This module reads all necessary references from the global
 * `window.__gastos` object. It exposes a single function
 * `setupPlannedModal()` which registers event handlers for
 * opening/closing the planned modal and for rendering its contents.
 *
 * The heavy logic for grouping transactions and projecting
 * recurrence occurrences has been moved out of main.js into this
 * module to keep the main file lean. When invoked, the module
 * attaches functions to `window.__gastos` so that other parts of
 * the application can call `renderPlannedModal()` if necessary.
 */

export function setupPlannedModal() {
  // Ensure a single global container exists
  const g = (window.__gastos = window.__gastos || {});
  if (g.__plannedModalInitialized) return;

  const {
    plannedModal,
    openPlannedBtn,
    closePlannedModal,
    plannedList,
    updateModalOpenState,
    sameId,
    occursOn,
    post,
    todayISO,
    getTransactions,
    transactions,
  } = g;

  const getLineFactory = () => {
    const latest = (window.__gastos && window.__gastos.makeLine) || g.makeLine;
    return typeof latest === 'function' ? latest : null;
  };

  /**
   * Updates the header of the planned modal. Ensures the title and
   * close button are visible and correctly labeled.
   */
  function updatePlannedModalHeader() {
    if (!plannedModal) return;
    const h2 = plannedModal.querySelector('h2');
    if (h2) h2.textContent = 'Planejados';
    const closeBtn = plannedModal.querySelector('#closePlannedModal');
    if (closeBtn) closeBtn.style.display = '';
  }

  /**
   * Builds the list of planned transactions grouped by date, using the
   * same expansion logic as the accordion (txByDate). This ensures the
   * modal mirrors the accordion as the single source of truth.
   */
  function preparePlannedList() {
    if (!plannedList) return;
    plannedList.innerHTML = '';

    // Prefer helpers exposed by main.js; fall back to local logic if absent
    const txByDate = (window.__gastos && window.__gastos.txByDate) || null;
    const calcRange = (window.__gastos && window.__gastos.calculateDateRange) || null;

    const today = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
    const startISO = today;
    // Match previous horizon but let it be capped by app range if available
    const daysAhead = 90;
    const plannedByDate = {};
    const add = (iso, tx) => {
      if (!tx) return;
      if (!plannedByDate[iso]) plannedByDate[iso] = [];
      plannedByDate[iso].push(tx);
    };

    if (typeof txByDate === 'function') {
      // Iterate from today to today + daysAhead using the same expansion
      for (let i = 0; i <= daysAhead; i++) {
        const d = new Date(startISO + 'T00:00:00');
        d.setDate(d.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        const list = txByDate(iso) || [];
        list.forEach((t) => {
          // Não listar planejadas que são gatilho/ligadas a orçamentos (possuem budgetTag)
          if (t && t.planned === true && !t.budgetTag) add(iso, t);
        });
      }
    } else {
      // Fallback: approximate using raw txs if txByDate isn't available
      const txs = typeof getTransactions === 'function' ? getTransactions() : transactions || [];
      const todayDate = new Date(startISO + 'T00:00:00');
      const end = new Date(todayDate);
      end.setDate(end.getDate() + daysAhead);
      const between = (iso) => iso >= startISO && iso <= end.toISOString().slice(0, 10);
      txs.forEach((t) => { if (t && t.planned && !t.budgetTag && t.opDate && between(t.opDate)) add(t.opDate, t); });
    }

    const sortedDates = Object.keys(plannedByDate).sort();
    if (!sortedDates.length) {
      const empty = document.createElement('p');
      empty.className = 'planned-empty';
      empty.textContent = 'Nenhuma operação planejada.';
      plannedList.appendChild(empty);
      return;
    }
    const lineFactory = getLineFactory();
    const formatDayMonthShort = (iso) => {
      if (!iso) return '';
      try {
        const d = new Date(`${iso}T00:00:00`);
        const dd = String(d.getDate()).padStart(2, '0');
        let mon = d.toLocaleDateString('pt-BR', { month: 'short' }) || '';
        mon = mon.replace('.', '');
        mon = mon ? mon.charAt(0).toUpperCase() + mon.slice(1) : '';
        return `${dd} de ${mon}`;
      } catch (_) { return iso; }
    };
    for (const date of sortedDates) {
      const group = plannedByDate[date].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
      const groupHeader = document.createElement('h3');
      groupHeader.textContent = formatDayMonthShort(date);
      plannedList.appendChild(groupHeader);
      const list = document.createElement('ul');
      list.className = 'planned-list';
      for (const tx of group) {
        const li = document.createElement('li');
        li.className = 'planned-cash';
        if (lineFactory) {
          const line = lineFactory(tx, true);
          if (line) li.appendChild(line);
        } else {
          const fallback = document.createElement('div');
          fallback.className = 'op-line';
          fallback.textContent = tx.desc || 'Operação planejada';
          li.appendChild(fallback);
        }
        list.appendChild(li);
      }
      plannedList.appendChild(list);
    }
  }

  /**
   * Initialize swipe actions for planned transactions.
   */
  function bindPlannedActions() {
    // Initialize swipe for the planned modal specifically
    const { initSwipe } = g;
    if (typeof initSwipe === 'function' && plannedList) {
      initSwipe(plannedList, '.swipe-wrapper', '.swipe-actions', '.op-line', 'plannedSwipeInit');
    }
  }

  function renderPlannedModal() {
    updatePlannedModalHeader();
    preparePlannedList();
    bindPlannedActions();
  }

  // Register open/close event handlers
  if (openPlannedBtn) {
    openPlannedBtn.onclick = () => {
      if (plannedModal) plannedModal.classList.remove('hidden');
      renderPlannedModal();
      if (typeof updateModalOpenState === 'function') updateModalOpenState();
    };
  }
  if (closePlannedModal) {
    closePlannedModal.onclick = () => {
      if (plannedModal) plannedModal.classList.add('hidden');
      if (typeof updateModalOpenState === 'function') updateModalOpenState();
    };
  }
  if (plannedModal) {
    plannedModal.onclick = (e) => {
      if (e.target === plannedModal) {
        plannedModal.classList.add('hidden');
        if (typeof updateModalOpenState === 'function') updateModalOpenState();
      }
    };
  }

  // Expose the render function and mark initialization
  g.renderPlannedModal = renderPlannedModal;
  g.__plannedModalInitialized = true;
}
