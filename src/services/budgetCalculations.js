import { loadBudgets, saveBudgets } from './budgetStorage.js';
import { normalizeISODate } from '../utils/budgetUtils.js';
import { occursOn } from '../utils/date.js';

function isWithinRange(iso, start, end) {
  if (!iso) return false;
  if (start && iso < start) return false;
  // Treat end as INCLUSIVE boundary so the last day of a cycle
  // still contributes to reservations (overlap with next cycle start).
  if (end && iso > end) return false;
  return true;
}

function addDays(iso, days) {
  try { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0,10); } catch (_) { return iso; }
}
function addMonths(iso, months) {
  try { const [y,m,d] = (iso||'').split('-').map(Number); const nx = new Date(y,(m-1)+months,d); return nx.toISOString().slice(0,10);} catch(_) { return iso; }
}
function nextFrom(occurrenceISO, recurrence) {
  switch (String(recurrence||'').trim()) {
    case 'D': return addDays(occurrenceISO, 1);
    case 'W': return addDays(occurrenceISO, 7);
    case 'BW': return addDays(occurrenceISO, 14);
    case 'M': return addMonths(occurrenceISO, 1);
    case 'Q': return addMonths(occurrenceISO, 3);
    case 'S': return addMonths(occurrenceISO, 6);
    case 'Y': { try { const d=new Date(`${occurrenceISO}T00:00:00`); d.setFullYear(d.getFullYear()+1); return d.toISOString().slice(0,10);} catch(_) { return occurrenceISO; } }
    default: return occurrenceISO;
  }
}

function prevFrom(occurrenceISO, recurrence) {
  switch (String(recurrence||'').trim()) {
    case 'D': return addDays(occurrenceISO, -1);
    case 'W': return addDays(occurrenceISO, -7);
    case 'BW': return addDays(occurrenceISO, -14);
    case 'M': return addMonths(occurrenceISO, -1);
    case 'Q': return addMonths(occurrenceISO, -3);
    case 'S': return addMonths(occurrenceISO, -6);
    case 'Y': { try { const d=new Date(`${occurrenceISO}T00:00:00`); d.setFullYear(d.getFullYear()-1); return d.toISOString().slice(0,10);} catch(_) { return occurrenceISO; } }
    default: return occurrenceISO;
  }
}

function computeInitialForRange(transactions, tag, startIso, endIso) {
  if (!Array.isArray(transactions) || !tag) return 0;
  const start = normalizeISODate(startIso);
  const end = normalizeISODate(endIso);
  return transactions.reduce((sum, tx) => {
    if (!tx || tx.budgetTag !== tag) return sum;
    const iso = normalizeISODate(tx.opDate || tx.postDate);
    if (!iso) return sum;
    if (start && iso < start) return sum;
    // end inclusive for cycle window
    if (end && iso > end) return sum;
    const val = Number(tx.val);
    if (!Number.isFinite(val)) return sum;
    return sum + Math.abs(val);
  }, 0);
}

export function spentNoPeriodo(transactions, tag, startDate, endDate, opts = {}) {
  if (!Array.isArray(transactions) || !tag) return 0;
  const start = normalizeISODate(startDate);
  const end = normalizeISODate(endDate);
  const excludeTxId = opts && opts.excludeTxId != null ? String(opts.excludeTxId) : null;
  const excludeISO = opts && typeof opts.excludeISO === 'string' ? normalizeISODate(opts.excludeISO) : null;
  return transactions.reduce((sum, tx) => {
    if (!tx || tx.budgetTag !== tag) return sum;
    if (excludeTxId && String(tx.id) === excludeTxId) return sum; // don't count the trigger transaction
    const baseIso = normalizeISODate(tx.opDate || tx.postDate);
    if (!baseIso || !isWithinRange(baseIso, start, end)) return sum;
    if (excludeISO && baseIso === excludeISO) return sum; // fallback guard by date
    if (tx.planned === true) return sum;
    const val = Number(tx.val);
    if (!Number.isFinite(val)) return sum;
    return sum + Math.abs(val);
  }, 0);
}

export function recomputeBudget(budget, transactions) {
  if (!budget) return null;
  const spentValue = spentNoPeriodo(transactions, budget.tag, budget.startDate, budget.endDate, {
    excludeTxId: budget.triggerTxId != null ? String(budget.triggerTxId) : null,
    excludeISO: budget.triggerTxIso || null,
  });
  const reservedValue = Math.max(Number(budget.initialValue || 0) - spentValue, 0);
  return {
    ...budget,
    spentValue,
    reservedValue,
  };
}

function findCycleStartFor(master, targetISO) {
  try {
    const target = normalizeISODate(targetISO);
    const base = normalizeISODate(master.opDate);
    if (!target || !base) return null;
    const rec = String(master.recurrence || '').trim();
    // Fast path for daily/weekly/bi-weekly: compute start by modulo
    if (rec === 'D' || rec === 'W' || rec === 'BW') {
      const t = new Date(`${target}T00:00:00`);
      const b = new Date(`${base}T00:00:00`);
      const diffDays = Math.floor((t - b) / 864e5);
      const period = rec === 'D' ? 1 : (rec === 'W' ? 7 : 14);
      const remainder = ((diffDays % period) + period) % period;
      const start = new Date(t);
      start.setDate(start.getDate() - remainder);
      const startIso = start.toISOString().slice(0,10);
      // Guard against pre-opDate
      return startIso < base ? base : startIso;
    }
    // Fallback scan for monthly/quarterly/semiannual/annual and exotic patterns
    const limit = 365;
    for (let i = 0; i <= limit; i++) {
      const d = new Date(`${target}T00:00:00`);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0,10);
      if (!occursOn(master, iso)) continue;
      const prev = new Date(d); prev.setDate(prev.getDate() - 1);
      const prevIso = prev.toISOString().slice(0,10);
      if (!occursOn(master, prevIso)) return iso; // first day of that occurrence
    }
    return null;
  } catch (_) { return null; }
}

export function getReservedTotalForDate(dateISO, transactions, opts = {}) {
  const target = normalizeISODate(dateISO);
  if (!target) return 0;
  const budgets = loadBudgets();
  const freezeAtISO = opts && opts.freezeAtISO ? normalizeISODate(opts.freezeAtISO) : null;
  const shouldDebug = (typeof window !== 'undefined') && !!(window.__gastos && window.__gastos.debugBudgetReserve);
  const dbg = shouldDebug ? { date: target, persisted: [], synthetic: [], total: 0, skipped: [], materializedStarts: [] } : null;
  const allTxs = Array.isArray(transactions) ? transactions : [];
  
  // Detect budgets that are already materialized as transactions for this cycle.
  // If a budget cycle has a synthetic "reserve" transaction injected (budget materialization),
  // we must NOT subtract its reservation again, otherwise the balance is double‑deducted.
  // Key format: `${tag}|${start}` where start is the reserve opDate (cycle start).
  const materializedStarts = new Set();
  allTxs.forEach((t) => {
    if (!t || !t.isBudgetMaterialization) return;
    if (!t.budgetReserveFor) return; // only mark reserve entries; return entries do not matter for reservation calc
    const tag = t.budgetTag || null;
    const startIso = normalizeISODate(t.opDate || t.postDate);
    if (!tag || !startIso) return;
    materializedStarts.add(`${tag}|${startIso}`);
  });
  if (shouldDebug && dbg) {
    dbg.materializedStarts = Array.from(materializedStarts.values());
  }
  // Helper: compute reserved value AS OF an arbitrary date (defaults to target)
  const computeReservedAsOf = (tag, startIso, endIso, initialValue, localOpts = {}) => {
    const start = normalizeISODate(startIso);
    const end = normalizeISODate(endIso);
    const asOf = (freezeAtISO && target > freezeAtISO) ? freezeAtISO : target;
    const cutoff = (!end || asOf < end) ? asOf : end;
    const spent = spentNoPeriodo(transactions, tag, start, cutoff, {
      excludeTxId: localOpts.excludeTxId || null,
      excludeISO: localOpts.excludeISO || null,
    });
    const initial = Number(initialValue) || 0;
    return Math.max(initial - spent, 0);
  };

  // Sum persisted budgets (ad-hoc AND recurring) whose window includes target.
  // Track counted starts to avoid double counting when also walking recurring masters.
  const countedStarts = new Set(); // key = `${tag}|${start}`
  
  let total = budgets.reduce((acc, budget) => {
    if (!budget || budget.status !== 'active') return acc;

    // SKIP budgets whose cycle is already materialized as transactions
    // (transactions are counted directly in balances; subtracting reservations would double count)
    const start = normalizeISODate(budget.startDate);
    const end = normalizeISODate(budget.endDate);
    if (start && materializedStarts.has(`${budget.tag}|${start}`)) {
      if (shouldDebug) dbg.skipped.push({ reason: 'materialized', tag: budget.tag, start, end });
      return acc;
    }
    // When freezing returns at a date (today), include cycles that have started
    // even if target is past the cycle end, as long as the cycle hasn't ended
    // relative to the freeze reference.
    if (freezeAtISO && target > freezeAtISO) {
      const startedByTarget = !!(start && start <= target);
      const notEndedByFreeze = !!(!end || end > freezeAtISO);
      if (!startedByTarget || !notEndedByFreeze) {
        if (shouldDebug) dbg.skipped.push({ reason: 'frozen-out-of-range', tag: budget.tag, start, end, target, freezeAtISO });
        return acc;
      }
    } else {
      if (!isWithinRange(target, start, end)) {
        if (shouldDebug) dbg.skipped.push({ reason: 'out-of-range', tag: budget.tag, start, end, target });
        return acc;
      }
    }
    const reservedAsOf = computeReservedAsOf(budget.tag, start, end, budget.initialValue, {
      excludeTxId: budget.triggerTxId != null ? String(budget.triggerTxId) : null,
      excludeISO: budget.triggerTxIso || null,
    });
    if (shouldDebug) {
      dbg.persisted.push({ tag: budget.tag, start, end, type: budget.budgetType || 'ad-hoc', initial: budget.initialValue, reservedAsOf });
    }
    const key = `${budget.tag}|${start}`;
    countedStarts.add(key);
    return acc + reservedAsOf;
  }, 0);

  // Include synthetic reservations for recurring masters (future/past cycles) so
  // that recurring budgets behave like recurring transactions across the whole
  // projected range. Skip cycles that already have a persisted budget record or
  // that were materialized as transactions to avoid double counting.
  try {
    // Determine conservative lower bounds per tag to avoid retroactive synthesis
    const earliestStartByTag = new Map();
    try {
      (loadBudgets() || []).forEach((b) => {
        if (!b || b.status !== 'active' || !b.tag) return;
        const s = normalizeISODate(b.startDate);
        if (!s) return;
        const prev = earliestStartByTag.get(b.tag);
        if (!prev || s < prev) earliestStartByTag.set(b.tag, s);
      });
    } catch (_) {}
    const masterStartByTag = new Map();
    try {
      (allTxs || []).forEach((t) => {
        if (!t || !t.recurrence || !t.budgetTag) return;
        const tStart = normalizeISODate(t.opDate);
        if (!tStart) return;
        const prev = masterStartByTag.get(t.budgetTag);
        if (!prev || tStart < prev) masterStartByTag.set(t.budgetTag, tStart);
      });
    } catch (_) {}

    allTxs.forEach((master) => {
      if (!master || !master.recurrence || !master.budgetTag) return;
      const tag = master.budgetTag;
      const rec = String(master.recurrence || '').trim();
      const startOfTarget = findCycleStartFor(master, target);
      if (!startOfTarget) return;
      // Walk cycles from target's cycle backwards, accumulating until the freeze boundary.
      let cursor = startOfTarget;
      // Base lower bound: do not walk past the evaluation cutoff (today for future dates)
      let lowerBound = (freezeAtISO && target > freezeAtISO) ? freezeAtISO : target;
      // Tighten bound to the earliest persisted active budget start for this tag
      const b1 = earliestStartByTag.get(tag);
      if (b1 && b1 > lowerBound) lowerBound = b1;
      // Tighten further using the master first configured opDate
      const b2 = masterStartByTag.get(tag);
      if (b2 && b2 > lowerBound) lowerBound = b2;
      while (cursor && cursor > lowerBound) {
        const start = cursor;
        const end = nextFrom(start, rec) || start;
        const k = `${tag}|${start}`;
        if (!countedStarts.has(k) && !materializedStarts.has(k)) {
          let initial = computeInitialForRange(allTxs, tag, start, end);
          if (initial <= 0) {
            const v = Number(master.val);
            if (Number.isFinite(v)) initial = Math.abs(v);
          }
          const reservedAsOf = computeReservedAsOf(tag, start, end, initial);
          if (shouldDebug && dbg) dbg.synthetic.push({ tag, start, end, initial, reservedAsOf, rec });
          total += reservedAsOf;
        }
        // step to previous cycle
        const prev = prevFrom(start, rec);
        if (!prev || prev === start) break;
        cursor = prev;
      }
    });
  } catch (_) {}

  if (shouldDebug && dbg) {
    dbg.total = total;
    const hasGroup = (typeof console !== 'undefined') && typeof console.groupCollapsed === 'function';
    if (hasGroup) console.groupCollapsed(`[reserve] ${target} total=${total}`);
    if (typeof console !== 'undefined') {
      console.log('materializedStarts', dbg.materializedStarts);
      if (dbg.skipped.length) console.log('skipped', dbg.skipped);
      if (dbg.persisted.length) console.log('persisted', dbg.persisted);
      if (dbg.synthetic.length) console.log('synthetic', dbg.synthetic);
    }
    if (hasGroup) console.groupEnd();
  }
  return total;
}

export function refreshBudgetCache(transactions) {
  const budgets = loadBudgets();
  const updated = budgets.map((budget) => {
    if (!budget || budget.status !== 'active') return budget;
    return recomputeBudget(budget, transactions) || budget;
  });
  saveBudgets(updated);
  return updated;
}
