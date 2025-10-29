/**
 * Budget Materialization Injector
 *
 * Provides utilities to temporarily apply budget materialization transactions
 * to the transaction stream for the purpose of balance calculations, without
 * persisting them to storage.
 *
 * The materialized transactions are created dynamically and injected into
 * the transaction list only for display purposes. They appear alongside
 * real transactions in the UI but are not saved to Firebase/localStorage.
 */

import { generateBudgetMaterializationTransactions } from '../services/budgetMaterialization.js';

/**
 * Inject budget materialization transactions into a transaction list.
 * Creates a temporary array with materialized budget transactions added.
 * The original list is not modified.
 *
 * @param {Array} transactions Real transaction list
 * @param {string} todayISO Optional today's date (default: today)
 * @returns {Array} Transactions with materialized budget TXs injected
 */
export function injectBudgetMaterializationTransactions(transactions = [], todayISO = null) {
  try {
    const materializations = generateBudgetMaterializationTransactions(transactions, todayISO);
    if (!materializations || materializations.length === 0) {
      try {
        const dbg = !!(window && window.__gastos && window.__gastos.debugBudgetMaterialization);
        if (dbg) console.log('[MaterializationInjector] No materializations generated');
      } catch (_) {}
      return transactions;
    }
    try {
      const dbg = !!(window && window.__gastos && window.__gastos.debugBudgetMaterialization);
      if (dbg) console.log('[MaterializationInjector] Injecting', materializations.length, 'materialization TXs', materializations);
      else console.log('[MaterializationInjector] Injecting', materializations.length, 'materialization TXs');
    } catch (_) {
      console.log('[MaterializationInjector] Injecting', materializations.length, 'materialization TXs');
    }
    // Return combined list: real transactions + materializations
    return [...(transactions || []), ...materializations];
  } catch (err) {
    console.error('[MaterializationInjector] Error:', err);
    return transactions;
  }
}

export default {
  injectBudgetMaterializationTransactions,
};
