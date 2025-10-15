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
   * Builds the list of planned transactions grouped by date.
   * It includes both explicitly planned transactions (future-dated
   * operations) and projected occurrences for recurring master
   * transactions up to 90 days ahead. Duplicate occurrences are
   * filtered out to avoid showing the same planned item twice.
   */
  function preparePlannedList() {
    if (!plannedList) return;
    plannedList.innerHTML = '';
    const plannedByDate = {};
    const add = (tx) => {
      if (!tx || !tx.opDate) return;
      const key = tx.opDate;
      if (!plannedByDate[key]) plannedByDate[key] = [];
      plannedByDate[key].push(tx);
    };
    const today = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
    const todayDate = new Date(today + 'T00:00');
    const txs = typeof getTransactions === 'function' ? getTransactions() : transactions || [];
    
    const matchesActual = (candidate) => {
      return txs.some((other) => {
        if (!other || other === candidate) return false;
        if (other.planned) return false;
        if (other.opDate !== candidate.opDate) return false;
        const sameDesc = (other.desc || '').trim() === (candidate.desc || '').trim();
        const sameVal = Math.abs(Number(other.val || 0)) === Math.abs(Number(candidate.val || 0));
        const sameMethod = (other.method || '') === (candidate.method || '');
        return sameDesc && sameVal && sameMethod;
      });
    };
    for (const tx of txs) {
      if (!tx || !tx.opDate) continue;
      
      // Include explicitly planned transactions (planned: true)
      if (tx.planned) {
        const txDate = new Date(tx.opDate + 'T00:00');
        const isFuture = tx.opDate >= today;
        const isToday = tx.opDate === today;
        const pendingPast = txDate < todayDate && !matchesActual(tx);
        if (isFuture || isToday || pendingPast) {
          add(tx);
        }
        continue;
      }
      
      // Include child transactions of recurring series that are in the future
      // (but NOT the master transaction itself, even if it's in the future)
      if (tx.parentId && tx.opDate >= today) {
        add(tx);
      }
    }
    // Project recurring master transactions for the next 90 days
    const DAYS_AHEAD = 90;
    for (const master of txs) {
      if (!master || !master.recurrence) continue;
      for (let i = 1; i <= DAYS_AHEAD; i++) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        const occurs = typeof occursOn === 'function' ? occursOn(master, iso)
          : (typeof g.occursOn === 'function' ? g.occursOn(master, iso) : false);
        if (!occurs) continue;
        if (master.exceptions && Array.isArray(master.exceptions) && master.exceptions.includes(iso)) {
          continue;
        }
        if (master.recurrenceEnd && iso >= master.recurrenceEnd) {
          continue;
        }
        // Avoid duplicate planned occurrences for the same day
        const dup = (plannedByDate[iso] || []).some(t =>
          (t.parentId && (sameId ? sameId(t.parentId, master.id) : (g.sameId && g.sameId(t.parentId, master.id)))) ||
          ((t.desc || '') === (master.desc || '') && (t.method || '') === (master.method || '') &&
            Math.abs(Number(t.val || 0)) === Math.abs(Number(master.val || 0)))
        );
        if (dup) {
          continue;
        }
        // Skip if an actual transaction exists for this date that matches the master
        const exists = txs.some(t =>
          t && t.opDate === iso && (
            (t.parentId && (sameId ? sameId(t.parentId, master.id) : (g.sameId && g.sameId(t.parentId, master.id)))) ||
            ((t.desc || '') === (master.desc || '') && (t.method || '') === (master.method || '') &&
              Math.abs(Number(t.val || 0)) === Math.abs(Number(master.val || 0)))
          )
        );
        if (exists) {
          continue;
        }
        add({
          ...master,
          id: `${master.id || 'r'}_${iso}`,
          parentId: master.id || null,
          opDate: iso,
          postDate: typeof post === 'function' ? post(iso, master.method) : (g.post && g.post(iso, master.method)),
          planned: true,
          recurrence: master.recurrence,
        });
      }
    }
    // Render grouped planned transactions
    const sortedDates = Object.keys(plannedByDate).sort();
    if (!sortedDates.length) {
      const empty = document.createElement('p');
      empty.className = 'planned-empty';
      empty.textContent = 'Nenhuma operação planejada.';
      plannedList.appendChild(empty);
      return;
    }
    const lineFactory = getLineFactory();
    for (const date of sortedDates) {
      const group = plannedByDate[date].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
      const dateObj = new Date(date + 'T00:00');
      const dateLabel = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
      const groupHeader = document.createElement('h3');
      groupHeader.textContent = `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)}`;
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
