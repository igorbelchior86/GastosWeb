/**
 * Wrapped Transaction Getter
 *
 * Provides a wrapped version of getTransactions that automatically
 * injects budget materialization transactions. This ensures that
 * whenever transactions are fetched for display or calculation,
 * they include the materialized budget transactions.
 */

import { injectBudgetMaterializationTransactions } from './materializationInjector.js';

/**
 * Create a wrapped getTransactions function that injects materializations.
 *
 * @param {Function} originalGetTransactions The original getTransactions function
 * @returns {Function} Wrapped function that includes materializations
 */
export function createWrappedGetTransactions(originalGetTransactions) {
  return function getTransactionsWithMaterializations() {
    try {
      const txs = typeof originalGetTransactions === 'function'
        ? originalGetTransactions()
        : [];
      return injectBudgetMaterializationTransactions(txs);
    } catch (err) {
      console.error('[WrappedGetTransactions] Error:', err);
      return typeof originalGetTransactions === 'function' ? originalGetTransactions() : [];
    }
  };
}

export default { createWrappedGetTransactions };
