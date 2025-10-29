import { loadBudgets, saveBudgets } from './budgetStorage.js';
import { normalizeISODate, generateBudgetId, isFutureISODate } from '../utils/budgetUtils.js';
import { todayISO } from '../utils/date.js';
import { recomputeBudget } from './budgetCalculations.js';

function sumInitialValue(transactions, tag, startDate, endDate) {
  if (!Array.isArray(transactions) || !tag) return 0;
  const start = normalizeISODate(startDate);
  const end = normalizeISODate(endDate);
  return transactions.reduce((sum, tx) => {
    if (!tx || tx.budgetTag !== tag) return sum;
    const txDate = normalizeISODate(tx.opDate || tx.postDate);
    if (!txDate) return sum;
    if (start && txDate < start) return sum;
    // end is INCLUSIVE for cycle window
    if (end && txDate > end) return sum;
    const planned = Boolean(tx.planned);
    if (!planned && !isFutureISODate(txDate) && (!end || txDate !== end)) {
      return sum;
    }
    const amount = Number(tx.val);
    if (!Number.isFinite(amount)) return sum;
    return sum + Math.abs(amount);
  }, 0);
}

function addDays(iso, days) {
  try {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  } catch (_) {
    return iso;
  }
}

function addMonths(iso, months) {
  try {
    const [y, m, d] = (iso || '').split('-').map(Number);
    const next = new Date(y, (m - 1) + months, d);
    return next.toISOString().slice(0, 10);
  } catch (_) {
    return iso;
  }
}

function computeNextOccurrenceISO(occurrenceISO, recurrence) {
  switch (recurrence) {
    case 'D': return addDays(occurrenceISO, 1);
    case 'W': return addDays(occurrenceISO, 7);
    case 'BW': return addDays(occurrenceISO, 14);
    case 'M': return addMonths(occurrenceISO, 1);
    case 'Q': return addMonths(occurrenceISO, 3);
    case 'S': return addMonths(occurrenceISO, 6);
    case 'Y': {
      try { const d = new Date(`${occurrenceISO}T00:00:00`); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0,10); } catch (_) { return occurrenceISO; }
    }
    default: return occurrenceISO;
  }
}

export function upsertBudgetFromTransaction(transaction, context = {}) {
  if (!transaction || !transaction.budgetTag) {
    return { changed: false, budget: null };
  }

  const tag = transaction.budgetTag;
  const isRecurring = Boolean(transaction.recurrence && String(transaction.recurrence).trim());
  const allTxs = Array.isArray(context.transactions) ? context.transactions : [];
  const nowISO = new Date().toISOString();
  const budgets = loadBudgets();
  let activeExisting = budgets.find((b) => b.tag === tag && b.status === 'active');

  if (isRecurring) {
    const occurrenceISO = normalizeISODate(context.occurrenceISO || transaction.opDate) || todayISO();
    // Prefer provided next occurrence, otherwise derive from recurrence rule
    let nextOccurrenceISO = normalizeISODate(context.nextOccurrenceISO || context.upcomingOccurrenceISO);
    if (!nextOccurrenceISO || nextOccurrenceISO === occurrenceISO) {
      nextOccurrenceISO = computeNextOccurrenceISO(occurrenceISO, String(transaction.recurrence || '').trim());
    }
    const recurrenceId = context.recurrenceId
      || transaction.recurrenceId
      || transaction.parentId
      || transaction.id
      || generateBudgetId();

    // Prepare a mutable copy of current budgets
    const updated = budgets.slice();

    // If there is an active recurring budget but the cycle advanced,
    // close the previous and create a new record (one active cycle per recurrenceId).
    if (activeExisting && activeExisting.budgetType === 'recurring') {
      const prevStart = normalizeISODate(activeExisting.startDate);
      const prevEnd = normalizeISODate(activeExisting.endDate);
      const cycleChanged = (prevStart !== occurrenceISO) || (prevEnd !== nextOccurrenceISO);
      if (cycleChanged) {
        const closedPrev = recomputeBudget({ ...activeExisting }, allTxs) || { ...activeExisting };
        closedPrev.status = 'closed';
        const idx = updated.findIndex(b => b && b.id === activeExisting.id);
        if (idx >= 0) updated[idx] = closedPrev; else updated.push(closedPrev);
        activeExisting = null;
      }
    }

    const target = {
      id: generateBudgetId(),
      tag,
      budgetType: 'recurring',
      status: 'active',
      recurrenceId,
      reservedValue: 0,
      spentValue: 0,
      startDate: occurrenceISO,
      endDate: nextOccurrenceISO,
      lastUpdated: nowISO,
      triggerTxId: transaction && transaction.id != null ? String(transaction.id) : null,
      triggerTxIso: occurrenceISO,
    };
    let initialValue = sumInitialValue(allTxs, tag, target.startDate, target.endDate);
    if (initialValue <= 0) {
      const baseVal = Number(transaction.val);
      if (Number.isFinite(baseVal)) initialValue = Math.abs(baseVal);
    }
    target.initialValue = initialValue;

    const recalculated = recomputeBudget(target, allTxs) || target;
    updated.push(recalculated);
    saveBudgets(updated);
    return { changed: true, budget: recalculated };
  }

  if (!isFutureISODate(transaction.opDate)) {
    return { changed: false, budget: activeExisting || null };
  }

  const startDate = normalizeISODate(context.creationDate) || todayISO();
  const endDate = normalizeISODate(transaction.opDate) || startDate;

  const target = activeExisting && activeExisting.budgetType === 'ad-hoc'
    ? { ...activeExisting }
    : {
        id: generateBudgetId(),
        tag,
        budgetType: 'ad-hoc',
        status: 'active',
        recurrenceId: null,
        reservedValue: 0,
        spentValue: 0,
      };

  target.startDate = startDate;
  target.endDate = endDate;
  let initialValue = sumInitialValue(allTxs, tag, startDate, endDate);
  if (initialValue <= 0) {
    const baseVal = Number(transaction.val);
    if (Number.isFinite(baseVal)) initialValue = Math.abs(baseVal);
  }
  target.initialValue = initialValue;
  target.lastUpdated = nowISO;
  target.triggerTxId = transaction && transaction.id != null ? String(transaction.id) : (target.triggerTxId ? String(target.triggerTxId) : null);
  target.triggerTxIso = startDate;

  const recalculated = recomputeBudget(target, allTxs) || target;
  const updated = budgets.filter((b) => b.id !== recalculated.id).concat(recalculated);
  saveBudgets(updated);
  return { changed: true, budget: recalculated };
}

export function listActiveBudgets() {
  return loadBudgets().filter((b) => b.status === 'active');
}
