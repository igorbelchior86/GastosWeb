/*
 * Year selection UI helpers
 *
 * This module encapsulates the logic for the year selector modal and
 * associated controls. The main entry point is `createYearSelector`,
 * which accepts an options object containing callbacks for reading
 * and updating the current view year, accessing the current list of
 * transactions, and triggering a table re‑render when the year
 * changes. The returned API exposes methods to open/close the year
 * modal, select a year, and update the displayed year title. By
 * delegating state access and side effects to the caller, this module
 * remains free of hard dependencies on global variables or DOM IDs
 * defined in the monolithic main.js.
 */

export function createYearSelector(options = {}) {
  const {
    // Callback to retrieve the current selected year
    getViewYear = () => new Date().getFullYear(),
    // Callback to update the current selected year
    setViewYear = (year) => {},
    // Callback to retrieve the transactions array. Used to discover
    // additional years beyond the default range.
    getTransactions = () => [],
    // Callback invoked after changing the year to refresh the UI
    renderTable = () => {}
  } = options;

  // Define reasonable min/max bounds for the year selector. These
  // constants mirror the original implementation in main.js but can be
  // overridden via options if desired.
  const YEAR_SELECTOR_MIN = options.minYear ?? 1990;
  const YEAR_SELECTOR_MAX = options.maxYear ?? 3000;

  /**
   * Generate a list of candidate years to display in the selector. The
   * default implementation returns a simple inclusive range from
   * YEAR_SELECTOR_MIN to YEAR_SELECTOR_MAX. If there are transactions
   * outside of this range, the list is extended accordingly.
   *
   * @returns {number[]} sorted array of year numbers
   */
  function getAvailableYears() {
    const years = [];
    for (let y = YEAR_SELECTOR_MIN; y <= YEAR_SELECTOR_MAX; y++) {
      years.push(y);
    }

    // If transactions exist, ensure any years referenced in the
    // transaction data are included. We aggressively scan all string
    // fields for 4‑digit years and DD/MM/YYYY formats. This prevents
    // situations where a transaction from a distant year isn't
    // selectable in the modal. See main.js for prior behaviour.
    const txs = getTransactions() || [];
    if (txs.length > 0) {
      const extraYears = new Set(years);
      txs.forEach(tx => {
        Object.values(tx).forEach(value => {
          if (typeof value === 'string') {
            // YYYY or extended year. Accept 1990–2999 plus 3000.
            const yearMatch = value.match(/\b(19[9][0-9]|2\d{3}|3000)\b/);
            if (yearMatch) {
              const yr = parseInt(yearMatch[1]);
              if (yr >= YEAR_SELECTOR_MIN && yr <= YEAR_SELECTOR_MAX) {
                extraYears.add(yr);
              }
            }
            // DD/MM/YYYY format
            const dateMatch = value.match(/\b\d{1,2}\/\d{1,2}\/([1-3]\d{3})\b/);
            if (dateMatch) {
              const yr = parseInt(dateMatch[1]);
              if (yr >= YEAR_SELECTOR_MIN && yr <= YEAR_SELECTOR_MAX) {
                extraYears.add(yr);
              }
            }
          }
        });
      });
      // Replace years array with sorted unique years
      return Array.from(extraYears).sort((a, b) => a - b);
    }
    return years;
  }

  /**
   * Update the text and accessibility labels on the year title button.
   * This does not change the current year; it simply reflects the
   * selected year in the DOM. Call this after changing the year.
   */
  function updateYearTitle() {
    const logoText = document.querySelector('.logo-text');
    if (!logoText) return;
    // Display constant brand text but expose the year via attributes
    logoText.textContent = 'Gastos+';
    const parentBtn = logoText.closest('#yearSelector');
    if (parentBtn) {
      const year = getViewYear();
      parentBtn.setAttribute('data-year', String(year));
      parentBtn.setAttribute('aria-label', `Gastos mais - ano ${year}`);
      if (!parentBtn.hasAttribute('tabindex')) {
        parentBtn.setAttribute('tabindex', '0');
      }
    }
  }

  /**
   * Open the year modal and populate it with the available years. This
   * function builds the list each time to ensure it reflects any
   * changes to the transactions. It also scrolls the list so that
   * the currently selected year is centred in view.
   */
  function openYearModal() {
    const modal = document.getElementById('yearModal');
    const yearList = document.getElementById('yearList');
    if (!modal || !yearList) return;
    yearList.innerHTML = '';
    const availableYears = getAvailableYears();
    availableYears.forEach(year => {
      const div = document.createElement('div');
      div.className = 'year-item';
      if (year === getViewYear()) div.classList.add('current');
      div.textContent = String(year);
      div.addEventListener('click', () => {
        selectYear(year);
        closeYearModal();
      });
      yearList.appendChild(div);
    });
    // Show the modal
    modal.classList.remove('hidden');
    // Update modal open state to control body scroll/keyboard focus
    if (typeof window.updateModalOpenState === 'function') {
      window.updateModalOpenState();
    }
    // Centre the currently selected year after a paint
    requestAnimationFrame(() => {
      const active = yearList.querySelector('.year-item.current');
      if (active) {
        try {
          active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        } catch (e) {
          // Fallback: manually adjust scrollTop
          const containerRect = yearList.getBoundingClientRect();
          const activeRect = active.getBoundingClientRect();
          const offset = (activeRect.top + activeRect.height / 2) - (containerRect.top + yearList.clientHeight / 2);
          yearList.scrollTop += offset;
        }
      }
    });
  }

  /**
   * Hide the year selection modal and restore the page scroll state.
   */
  function closeYearModal() {
    const modal = document.getElementById('yearModal');
    if (!modal) return;
    modal.classList.add('hidden');
    if (typeof window.updateModalOpenState === 'function') {
      window.updateModalOpenState();
    }
  }

  /**
   * Change the current year. This updates internal state via the
   * provided callback and triggers a table re-render. It also updates
   * the year title. Callers may call this directly or indirectly
   * through the click handlers built by openYearModal().
   *
   * @param {number} year the year to select
   */
  function selectYear(year) {
    if (typeof year !== 'number') return;
    setViewYear(year);
    updateYearTitle();
    try {
      renderTable();
    } catch (_) {}
    
    const currentYear = new Date().getFullYear();
    const isCurrentYear = year === currentYear;
    
    // Reset scroll to top when selecting a non-current year
    if (!isCurrentYear) {
      try {
        const wrapperEl = document.querySelector('.wrapper');
        if (wrapperEl) {
          wrapperEl.scrollTop = 0;
        }
      } catch (err) {
        console.warn('selectYear: Failed to reset scroll:', err);
      }
    }
    
    // Auto-scroll to today if selecting current year
    try {
      if (isCurrentYear) {
        // LÓGICA BINÁRIA: Se config saldo inicial visível = desabilitar auto scroll
        const startContainer = document.getElementById('startGroup') || document.querySelector('.start-container');
        const isStartVisible = startContainer && startContainer.style.display !== 'none';
        
        if (!isStartVisible) {
          const g = window.__gastos || {};
          if (typeof g.scrollTodayIntoView === 'function') {
            setTimeout(() => {
              g.scrollTodayIntoView();
            }, 400);
          }
        }
      }
    } catch (err) {
      console.warn('selectYear: auto-scroll failed:', err);
    }
  }

  // Return the public API
  return {
    openYearModal,
    closeYearModal,
    selectYear,
    updateYearTitle,
    getAvailableYears,
    getViewYear
  };
}
