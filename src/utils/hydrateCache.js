import { normalizeStartBalance } from './startBalance.js';
import { setBootHydrated } from '../state/appState.js';

/**
 * Provides a helper to hydrate the application state from cached storage. The
 * original implementation lived in main.js but has been extracted to reduce
 * the size of that file. This function reads dependencies from the global
 * `window.__gastos` object, which must contain references to caching
 * helpers, state mutation functions, and renderers. See main.js for how
 * these properties are assigned.
 *
 * @param {Object} options Options controlling hydration. Supported key:
 *   - render: whether to re-render UI after hydrating (default true)
 */
export function hydrateCache(options = {}) {
  const { render = true } = options;
  const g = typeof window !== 'undefined' ? window.__gastos || {} : {};
  const {
    cacheGet,
    cacheSet,
    normalizeTransactionRecord,
    ensureCashCard,
    setTransactions,
    getTransactions,
    setCards,
    getCards,
    state,
    syncStartInputFromState,
    ensureStartSetFromBalance,
    initStart,
    refreshMethods,
    renderCardList,
    renderTable,
    renderPlannedModal,
    fixPlannedAlignment,
    expandPlannedDayLabels,
    updatePendingBadge,
    plannedModal,
    isHydrating,
  } = g;
  if (!cacheGet || !setTransactions || !setCards) return;
  // 1) Transactions
  const cachedTx = cacheGet('tx', []);
  const normalizedTx = (cachedTx || [])
    .filter(Boolean)
    .map((t) => (normalizeTransactionRecord ? normalizeTransactionRecord(t) : t));
  setTransactions(normalizedTx);
  const txs = getTransactions ? getTransactions() : normalizedTx;
  // Sort transactions if sortTransactions exists on g
  try {
    if (g.sortTransactions) g.sortTransactions();
  } catch (_) {}
  // 2) Cards
  const normalizedCards = ensureCashCard
    ? ensureCashCard(cacheGet('cards', [{ name: 'Dinheiro', close: 0, due: 0 }]))
    : cacheGet('cards', [{ name: 'Dinheiro', close: 0, due: 0 }]);
  setCards(normalizedCards);
  const cards = getCards ? getCards() : normalizedCards;
  // 3) Start values
  if (state) {
    state.startBalance = normalizeStartBalance(cacheGet('startBal', null));
    state.startDate = g.normalizeISODate
      ? g.normalizeISODate(cacheGet('startDate', null))
      : cacheGet('startDate', null);
    state.startSet = cacheGet('startSet', false);
    if (state.startDate == null && (state.startBalance === 0 || state.startBalance === '0')) {
      state.startBalance = null;
      try {
        cacheSet && cacheSet('startBal', null);
      } catch (_) {}
    }
  }
  // Keep input in sync
  if (syncStartInputFromState) syncStartInputFromState();
  
  // CRITICAL: Use setBootHydrated to trigger subscribers that monitor bootHydrated changes
  try {
    if (typeof setBootHydrated === 'function') {
      setBootHydrated(true);
    } else if (state) {
      state.bootHydrated = true;
    }
  } catch (_) {
    if (state) {
      state.bootHydrated = true;
    }
  }
  
  if (ensureStartSetFromBalance) ensureStartSetFromBalance({ persist: false });
  if (render && !isHydrating) {
    // Render UI after hydration if allowed
    try {
      if (initStart) initStart();
    } catch (_) {}
    try {
      if (refreshMethods) refreshMethods();
    } catch (_) {}
    try {
      if (renderCardList) renderCardList();
    } catch (_) {}
    try {
      if (renderTable) renderTable();
    } catch (_) {}
    try {
      if (plannedModal && !plannedModal.classList.contains('hidden')) {
        if (renderPlannedModal) renderPlannedModal();
        if (fixPlannedAlignment) fixPlannedAlignment();
        if (expandPlannedDayLabels) expandPlannedDayLabels();
      }
    } catch (_) {}
  }
  if (updatePendingBadge) updatePendingBadge();
}
