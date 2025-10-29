/**
 * Budget Materialization Service
 *
 * Converts active recurring budgets into automatic "reserve" transactions
 * at the start of each budget cycle. This ensures budgets affect the balance
 * in the same way recurring transactions do: they deduce permanently from
 * the saldo until the end of the cycle, at which point any unused amount
 * is recovered via an adjustment transaction.
 *
 * Model:
 * - At cycle START: Create a negative transaction (budget deduction)
 * - During cycle: Balance reflects the deduction
 * - At cycle END: Create a positive transaction (return unused amount)
 *   Example: R$100 budget with R$30 spent = R$70 returned
 *
 * This ensures budgets behave identically to recurring transactions.
 */

import { normalizeISODate, generateBudgetId } from '../utils/budgetUtils.js';
import { todayISO as localTodayISO } from '../utils/date.js';
import { generateId } from '../utils/data.js';
import { loadBudgets } from './budgetStorage.js';
import { spentNoPeriodo } from './budgetCalculations.js';

// Lookup key format: `${budgetId}|${cycleStart}`
// Ensures we create exactly one materialization per cycle
const materializedCache = new Set();

function createReserveTransaction(budget, cycleStart, isReturn = false) {
  if (!budget || !budget.tag) return null;

  const tag = budget.tag;
  const initialValue = Number(budget.initialValue) || 0;

  if (isReturn) {
    // End of cycle: return unused amount
    const spentValue = Number(budget.spentValue) || 0;
    const unusedValue = Math.max(initialValue - spentValue, 0);

    if (unusedValue <= 0) return null; // Nothing to return

    return {
      id: `budget-return-${budget.id}`,
      desc: `[Retorno de Orçamento] ${tag}`,
      val: unusedValue, // Positive = income/return
      opDate: budget.endDate || cycleStart,
      postDate: budget.endDate || cycleStart,
      method: 'Dinheiro',
      planned: false,
      budgetTag: tag,
      isBudgetMaterialization: true,
      budgetReturnFor: budget.id,
      originBudgetId: budget.id,
    };
  } else {
    // Start of cycle: deduct full budget amount
    return {
      id: `budget-reserve-${budget.id}`,
      desc: `[Reserva de Orçamento] ${tag}`,
      val: -initialValue, // Negative = expense
      opDate: cycleStart,
      postDate: cycleStart,
      method: 'Dinheiro',
      planned: false,
      budgetTag: tag,
      isBudgetMaterialization: true,
      budgetReserveFor: budget.id,
      originBudgetId: budget.id,
    };
  }
}

/**
 * Generate materialization transactions for active recurring budgets.
 *
 * Checks each active recurring budget and creates (if not already created):
 * - A reserve transaction at the cycle start (deducts budget amount)
 * - Will later create a return transaction at the cycle end
 *
 * @param {Array} transactions Current transaction list
 * @param {string} todayISO Today's date in ISO format
 * @returns {Array} New transactions to add to the transaction list
 */
export function generateBudgetMaterializationTransactions(transactions = [], todayISO = null) {
  // Use local‑timezone "today" to avoid UTC off‑by‑one skipping the cycle start
  const today = normalizeISODate(todayISO) || localTodayISO();
  const budgets = loadBudgets() || [];
  const newTransactions = [];
  const dbg = (() => { try { return !!(window && window.__gastos && window.__gastos.debugBudgetMaterialization); } catch (_) { return false; } })();
  if (dbg) {
    try { console.groupCollapsed('[BudgetMaterialization] Generate start'); console.log('today', today, 'budgets', budgets.length); } catch (_) {}
  }

  budgets.forEach((budget) => {
    // Support BOTH 'recurring' and 'ad-hoc' budget types
    if (!budget || budget.status !== 'active' || (budget.budgetType !== 'recurring' && budget.budgetType !== 'ad-hoc')) {
      if (dbg) console.log('skip: inactive/unsupported', budget && budget.tag, budget && budget.status, budget && budget.budgetType);
      return;
    }

    const cycleStart = normalizeISODate(budget.startDate);
    const cycleEnd = normalizeISODate(budget.endDate);
    if (!cycleStart) return;

    // Check if we've already materialized this budget cycle
    const cacheKey = `${budget.id}|${cycleStart}`;
    if (materializedCache.has(cacheKey)) {
      if (dbg) console.log('skip: cache-hit', budget.tag, cacheKey);
      return;
    }

    // Only create reserve transaction if cycle has started and hasn't ended yet
    if (today >= cycleStart) {
      // Create reserve transaction for this cycle
      const reserveTx = createReserveTransaction(budget, cycleStart, false);
      const exists = reserveTx && transactions.some((t) => t && t.id === reserveTx.id);
      if (reserveTx && !exists) {
        if (dbg) console.log('[BudgetMaterialization] Creating reserve TX:', reserveTx);
        newTransactions.push(reserveTx);
        materializedCache.add(cacheKey);
      } else if (dbg) {
        console.log('skip: reserve exists', budget.tag, reserveTx && reserveTx.id);
      }
    }

    // If cycle has ended, create return transaction
    if (cycleEnd && today > cycleEnd) {
      const returnCacheKey = `return|${budget.id}|${cycleEnd}`;
      if (!materializedCache.has(returnCacheKey)) {
        const returnTx = createReserveTransaction(budget, cycleEnd, true);
        if (returnTx && !transactions.some((t) => t && t.id === returnTx.id)) {
          if (dbg) console.log('[BudgetMaterialization] Creating return TX:', returnTx);
          newTransactions.push(returnTx);
          materializedCache.add(returnCacheKey);
        }
      }
    }
  });

  if (newTransactions.length > 0) {
    try {
      if (dbg) console.log('[BudgetMaterialization] Total materialized TXs:', newTransactions.length, newTransactions);
      else console.log('[BudgetMaterialization] Total materialized TXs:', newTransactions.length);
    } catch (_) {}
  }
  if (dbg) { try { console.groupEnd(); } catch (_) {} }
  return newTransactions;
}

/**
 * Filter out materialization transactions from a transaction list.
 * Used to display only "real" transactions in the UI, excluding auto-generated ones.
 *
 * @param {Array} transactions Transaction list
 * @returns {Array} Filtered list without materialization transactions
 */
export function filterOutMaterializationTransactions(transactions = []) {
  return (transactions || []).filter(
    (t) => !t || !t.isBudgetMaterialization
  );
}

/**
 * Extract only materialization transactions from a list.
 * Useful for debugging or auditing.
 *
 * @param {Array} transactions Transaction list
 * @returns {Array} Only materialization transactions
 */
export function extractMaterializationTransactions(transactions = []) {
  return (transactions || []).filter((t) => t && t.isBudgetMaterialization);
}

/**
 * Rebuild the materialization cache based on existing transactions.
 * Call this when rehydrating the app to ensure consistency.
 *
 * @param {Array} transactions Current transaction list
 */
export function rebuildMaterializationCache(transactions = []) {
  materializedCache.clear();
  (transactions || []).forEach((t) => {
    if (!t || !t.isBudgetMaterialization) return;
    if (t.budgetReserveFor) {
      const budgetId = t.budgetReserveFor;
      const cycleStart = (t.opDate || '').slice(0, 10);
      if (budgetId && cycleStart) {
        materializedCache.add(`${budgetId}|${cycleStart}`);
      }
    }
    if (t.budgetReturnFor) {
      const budgetId = t.budgetReturnFor;
      const cycleEnd = (t.opDate || '').slice(0, 10);
      if (budgetId && cycleEnd) {
        materializedCache.add(`return|${budgetId}|${cycleEnd}`);
      }
    }
  });
}

/**
 * Reset the materialization cache completely.
 * Use with caution - typically only on app reset.
 */
export function resetMaterializationCache() {
  materializedCache.clear();
}

export default {
  generateBudgetMaterializationTransactions,
  filterOutMaterializationTransactions,
  extractMaterializationTransactions,
  rebuildMaterializationCache,
  resetMaterializationCache,
};
