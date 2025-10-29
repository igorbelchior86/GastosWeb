// uiEventHandlers.js
//
// This module centralises the wiring of UI event listeners that were
// previously defined inline in main.js. Extracting these bindings
// reduces clutter in the main entrypoint while preserving behaviour.

/**
 * Initialise miscellaneous UI event handlers.
 *
 * The provided context supplies the DOM references and helper
 * functions needed for each listener. Call this once after
 * the relevant elements and APIs have been initialised.
 *
 * @param {Object} ctx
 * @param {?Element} ctx.headerSeg          The element containing the segment toggle buttons.
 * @param {?Element} ctx.openPlannedBtn      Button that triggers the planned modal.
 * @param {?Element} ctx.yearSelector        Year selector input/button.
 * @param {Object}   ctx.yearSelectorApi     API exposed by createYearSelector().
 * @param {?Element} ctx.closeYearModalBtn   Button that closes the year selector modal.
 * @param {?Element} ctx.yearModal           Container for the year selector modal.
 * @param {?Element} ctx.bottomPill          The floating pill navigation element.
 * @param {Function} ctx.renderPlannedModal  Callback to render the planned modal from helpers.
 * @param {Function} ctx.fixPlannedAlignment Ensures planned list alignment.
 * @param {Function} ctx.expandPlannedDayLabels Expands day labels in the planned list.
 * @param {?Element} ctx.plannedModal        The planned modal container.
 * @param {?Element} ctx.plannedBox          The inner box of the planned modal used for transitions.
 * @param {?Element} ctx.plannedList         The list element within the planned modal.
 * @param {?Element} ctx.openTxBtn           Button that opens the transaction modal.
 * @param {?Element} ctx.closeTxModal        Button that closes the transaction modal.
 * @param {?Element} ctx.txModal             The transaction modal container.
 * @param {Function} ctx.toggleTxModal       Toggles the visibility of the transaction modal.
 * @param {?Element} ctx.homeBtn             The button that scrolls to today.
 * @param {Function} ctx.scrollTodayIntoView Callback that scrolls the page to the current day.
 * @param {Function} ctx.openSettings        Opens the settings modal.
 * @param {Function} ctx.closeSettings       Closes the settings modal.
 * @param {Function} ctx.closeAllModals      Closes ALL open modals.
 * @param {?Element} ctx.settingsModalEl     The settings modal container.
 * @param {?Element} ctx.closeSettingsModalBtn Button inside the settings modal to close it.
 * @param {Function} ctx.updateModalOpenState Updates the global modal open state (used to toggle body scroll).
 */
export function setupMainEventHandlers(ctx) {
  const {
    headerSeg,
    openPlannedBtn,
    yearSelector,
    yearSelectorApi,
    closeYearModalBtn,
    yearModal,
    bottomPill,
    renderPlannedModal,
    fixPlannedAlignment,
    expandPlannedDayLabels,
    plannedModal,
    plannedBox,
    plannedList,
    openTxBtn,
    closeTxModal,
    txModal,
    toggleTxModal,
    homeBtn,
    scrollTodayIntoView,
    openSettings,
    closeSettings,
    closeAllModals,
    settingsModalEl,
    closeSettingsModalBtn,
    updateModalOpenState
  } = ctx;

  // Segment selector toggles between planned and cards views.
  if (headerSeg) {
    headerSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-option');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'planned' && openPlannedBtn) {
        headerSeg.dataset.selected = 'planned';
        openPlannedBtn.click();
      } else if (action === 'cards') {
        headerSeg.dataset.selected = 'cards';
        // Try open Panorama first; fallback to legacy cards modal
        try {
          const g = window.__gastos || {};
          if (g.openPanorama && typeof g.openPanorama === 'function') {
            const opened = g.openPanorama();
            if (opened) return;
          }
          if (typeof g.showCardModal === 'function') g.showCardModal();
        } catch (_) {}
      }
    });
  }

  // Year selector: open the modal and handle keyboard and wheel navigation.
  if (yearSelector && yearSelectorApi) {
    yearSelector.addEventListener('click', () => {
      yearSelectorApi.openYearModal();
    });
    yearSelector.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        yearSelectorApi.selectYear(yearSelectorApi.getViewYear() - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        yearSelectorApi.selectYear(yearSelectorApi.getViewYear() + 1);
      }
    });
    yearSelector.addEventListener('wheel', (e) => {
      if (e.deltaY === 0 || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        yearSelectorApi.selectYear(yearSelectorApi.getViewYear() + 1);
      } else if (e.deltaY > 0) {
        yearSelectorApi.selectYear(yearSelectorApi.getViewYear() - 1);
      }
    }, { passive: false });
  }
  if (closeYearModalBtn && yearSelectorApi) {
    closeYearModalBtn.addEventListener('click', () => {
      yearSelectorApi.closeYearModal();
    });
  }
  if (yearModal && yearSelectorApi) {
    yearModal.addEventListener('click', (e) => {
      if (e.target === yearModal) yearSelectorApi.closeYearModal();
    });
  }

  // Floating pill navigation: highlight and trigger actions for home and settings.
  if (bottomPill) {
    const highlight = bottomPill.querySelector('.pill-highlight');
    const options = bottomPill.querySelectorAll('.pill-option');
    const setSelected = (key) => {
      bottomPill.dataset.selected = key;
      options.forEach(b => b.setAttribute('aria-selected', b.dataset.action === key ? 'true' : 'false'));
    };
    const updateHighlight = () => {
      const sel = bottomPill.querySelector('.pill-option[aria-selected="true"]');
      if (!sel || !highlight) return;
      const pr = bottomPill.getBoundingClientRect();
      const sr = sel.getBoundingClientRect();
      const x = sr.left - pr.left - 6; // 6px padding left
      highlight.style.transform = `translateX(${Math.max(0, x)}px)`;
      highlight.style.width = `${sr.width}px`;
    };
    options.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        setSelected(action);
        updateHighlight();
        if (action === 'home') {
          // Home button: close ALL modals and scroll to today
          console.log('[uiEventHandlers] Home button clicked, closeAllModals available:', !!closeAllModals);
          if (closeAllModals) {
            closeAllModals();
            console.log('[uiEventHandlers] closeAllModals() called');
          }
          // LÓGICA BINÁRIA: Se config saldo inicial visível = desabilitar auto scroll
          const startContainer = document.getElementById('startGroup') || document.querySelector('.start-container');
          const isStartVisible = startContainer && startContainer.style.display !== 'none';
          
          if (!isStartVisible && scrollTodayIntoView) {
            scrollTodayIntoView();
          }
        } else if (action === 'settings') {
          const settingsModal = document.getElementById('settingsModal');
          const isSettingsOpen = settingsModal && !settingsModal.classList.contains('hidden');
          
          if (isSettingsOpen) {
            // Settings already open: close it
            closeSettings && closeSettings();
          } else {
            // Settings closed: close all others and open settings
            closeAllModals && closeAllModals();
            openSettings && openSettings();
          }
          updateModalOpenState && updateModalOpenState();
        }
      });
    });
    window.addEventListener('resize', updateHighlight);
    // initialise highlight after a small delay so that DOM sizes are stable
    setTimeout(updateHighlight, 60);
  }

  // Planned modal interactions: open the modal and adjust alignment labels.
  if (openPlannedBtn) {
    openPlannedBtn.addEventListener('click', () => setTimeout(() => {
      renderPlannedModal && renderPlannedModal();
      fixPlannedAlignment && fixPlannedAlignment();
      expandPlannedDayLabels && expandPlannedDayLabels();
    }, 0));
  }
  if (plannedBox) {
    plannedBox.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'transform') {
        fixPlannedAlignment && fixPlannedAlignment();
        expandPlannedDayLabels && expandPlannedDayLabels();
      }
    });
  }
  if (plannedList) {
    const mo = new MutationObserver(() => {
      fixPlannedAlignment && fixPlannedAlignment();
      expandPlannedDayLabels && expandPlannedDayLabels();
    });
    mo.observe(plannedList, { childList: true, subtree: true });
  }

  // Transaction modal toggle: open and close handling.
  if (openTxBtn && toggleTxModal) {
    openTxBtn.onclick = () => {
      const txModal = document.getElementById('txModal');
      const isTxOpen = txModal && !txModal.classList.contains('hidden');
      
      if (isTxOpen) {
        // txModal already open: close it
        toggleTxModal();
      } else {
        // txModal is closed: close all others and open txModal
        closeAllModals && closeAllModals();
        toggleTxModal();
      }
      updateModalOpenState && updateModalOpenState();
    };
  }
  if (closeTxModal && toggleTxModal) {
    closeTxModal.onclick = () => toggleTxModal();
  }
  if (txModal && toggleTxModal) {
    txModal.onclick = (e) => {
      if (e.target === txModal) toggleTxModal();
    };
  }

  // Scroll to today shortcut.
  if (homeBtn && scrollTodayIntoView) {
    homeBtn.addEventListener('click', () => {
      // LÓGICA BINÁRIA: Se config saldo inicial visível = desabilitar auto scroll
      const startContainer = document.getElementById('startGroup') || document.querySelector('.start-container');
      const isStartVisible = startContainer && startContainer.style.display !== 'none';
      
      if (!isStartVisible) {
        scrollTodayIntoView();
      }
    });
  }

  // Settings modal interactions.
  if (closeSettingsModalBtn && closeSettings) {
    closeSettingsModalBtn.onclick = () => {
      closeSettings();
    };
  }
  if (settingsModalEl && closeSettings) {
    settingsModalEl.onclick = (e) => {
      if (e.target === settingsModalEl) {
        closeSettings();
      }
    };
  }
}
