import { loadBudgets, saveBudgets } from '../services/budgetStorage.js';
import { getReservedTotalForDate as calcReservedTotal } from '../services/budgetCalculations.js';
import { formatToISO } from './date.js';

// Compute per-day projected and available balances under the "profeta" model.
// Rules:
// - Cash: projected at opDate; available at opDate only when paid (!planned)
// - Card: projected at postDate (or opDate fallback); available at postDate only when paid
// - Ignore technical invoice meta entries in both totals (invoicePayment, invoiceAdjust,
//   invoiceParcelOf, invoiceRolloverOf) when using the "purchases at postDate" model.

function normISO(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function addDelta(map, iso, val) {
  if (!iso) return;
  const v = Number(val) || 0;
  if (!map[iso]) map[iso] = 0;
  map[iso] += v;
}

function isInvoiceMeta(tx) {
  if (!tx) return false;
  return Boolean(tx.invoicePayment || tx.invoiceAdjust || tx.invoiceParcelOf || tx.invoiceRolloverOf);
}

export function computeDailyBalances(transactions = [], startBalance = 0, startDate = null, options = {}) {
  const ignoreInvoiceMeta = options.ignoreInvoiceMeta !== false; // default true
  const preferTxByDate = options.useTxByDate !== false; // default true when available

  // If txByDate/calculateDateRange are available (exported via window.__gastos),
  // use them to materialize recurring occurrences so balances match what the UI shows.
  const g = (typeof window !== 'undefined' && window.__gastos) ? window.__gastos : null;
  const hasHelpers = !!(g && typeof g.txByDate === 'function' && typeof g.calculateDateRange === 'function');

  const deltasProj = {};
  const deltasConta = {};

  // Build budget trigger lookup so we can ignore budget-reservation launches
  // (they only create reservations; they must not impact cash).
  let triggerIdSet = null;
  let triggerKeySet = null; // key = `${iso}|${tag}`
  try {
    const raw = typeof saveBudgets === 'function' ? saveBudgets(loadBudgets()) : (loadBudgets() || []);
    const active = (raw || []).filter(b => b && b.status === 'active');
    triggerIdSet = new Set(active.map(b => (b && b.triggerTxId != null ? String(b.triggerTxId) : null)).filter(Boolean));
    triggerKeySet = new Set(active.map(b => {
      const iso = b && (b.triggerTxIso || b.startDate);
      const tag = b && b.tag;
      if (!iso || !tag) return null;
      return `${String(iso).slice(0,10)}|${String(tag)}`;
    }).filter(Boolean));
  } catch (_) {
    triggerIdSet = new Set();
    triggerKeySet = new Set();
  }
  const isBudgetTrigger = (t, iso) => {
    try {
      // Never treat budget materialization transactions as triggers; they must impact cash.
      if (t && t.isBudgetMaterialization) return false;
      if (!t || String(t.method || 'Dinheiro') !== 'Dinheiro') return false;
      if (t.id != null && triggerIdSet && triggerIdSet.has(String(t.id))) return true;
      const tag = t.budgetTag || null;
      if (!tag || !iso) return false;
      const key = `${String(iso).slice(0,10)}|${String(tag)}`;
      return triggerKeySet && triggerKeySet.has(key);
    } catch (_) { return false; }
  };

  if (preferTxByDate && hasHelpers) {
    try {
      const range = g.calculateDateRange();
      const minISO = normISO(range?.minDate);
      const maxISO = normISO(range?.maxDate);
      if (minISO && maxISO) {
        // Walk the date range and project/realize deltas based on the "profeta" model
        // Parse date components directly to avoid UTC/timezone issues
        const [minY, minM, minD] = minISO.split('-').map(Number);
        const [maxY, maxM, maxD] = maxISO.split('-').map(Number);
        const startDate = new Date(minY, minM - 1, minD);
        const endDate = new Date(maxY, maxM - 1, maxD);
        
        for (let cur = new Date(startDate); cur <= endDate; cur.setDate(cur.getDate() + 1)) {
          // Use formatToISO to convert to ISO string in local timezone, not UTC
          const iso = formatToISO(cur);
          const dayList = g.txByDate(iso) || [];
          for (const t of dayList) {
            if (!t) continue;
            if (ignoreInvoiceMeta && isInvoiceMeta(t)) continue;
            if (isBudgetTrigger(t, iso)) continue; // ignore budget reservation triggers
            const v = Number(t.val) || 0;
            const isCash = String(t.method || 'Dinheiro') === 'Dinheiro';
            const opISO = normISO(t.opDate) || iso;
            const postISO = normISO(t.postDate) || opISO;
            // Projected: cash at opDate; card at postDate
            addDelta(deltasProj, isCash ? opISO : postISO, v);
            // Available: only when not planned; cash at opDate; card at postDate
            if (!t.planned) addDelta(deltasConta, isCash ? opISO : postISO, v);
          }
        }
      }
    } catch (_) {
      // Silent fallthrough to baseline implementation
    }
  }

  // Baseline: iterate over provided transactions as-is (non-recurring not expanded)
  if (Object.keys(deltasProj).length === 0 && Object.keys(deltasConta).length === 0) {
    (transactions || []).forEach((t) => {
      if (!t) return;
      const v = Number(t.val) || 0;
      // Skip purely visual/technical invoice records
      if (ignoreInvoiceMeta && isInvoiceMeta(t)) return;
      const isoHint = normISO(t.opDate) || normISO(t.postDate);
      if (isBudgetTrigger(t, isoHint)) return; // ignore budget reservation triggers
      const isCash = String(t.method || 'Dinheiro') === 'Dinheiro';
      const opISO = normISO(t.opDate);
      const postISO = normISO(t.postDate) || opISO;
      // Projected
      addDelta(deltasProj, isCash ? opISO : postISO, v);
      // Available (only when paid)
      if (!t.planned) {
        addDelta(deltasConta, isCash ? opISO : postISO, v);
      }
    });
  }

  // Seed with start balance at the earliest date we will report.
  // Prefer explicit startDate; otherwise, use the minimum across ALL impacted days
  // (union of projected and available deltas) so that day 1 starts at the same base
  // for ambos cofres e diferenças se expressem apenas pelos deltas.
  const allKeysForSeed = Array.from(new Set([...(Object.keys(deltasProj)), ...(Object.keys(deltasConta))])).sort();
  const seedISO = normISO(startDate) || (allKeysForSeed.length ? allKeysForSeed[0] : null);
  const base = Number(startBalance) || 0;
  if (seedISO) {
    addDelta(deltasProj, seedISO, base);
    addDelta(deltasConta, seedISO, base);
  }

  // Build running totals per day. Ensure continuity across the visible range
  // if helpers are available; otherwise iterate over existing delta keys.
  let allDays = Array.from(new Set([...(Object.keys(deltasProj)), ...(Object.keys(deltasConta))])).sort();
  if (preferTxByDate && hasHelpers) {
    try {
      const r = g.calculateDateRange();
      const minISO = normISO(r?.minDate);
      const maxISO = normISO(r?.maxDate);
      if (minISO && maxISO) {
        const days = [];
        // Parse date components directly to avoid UTC/timezone issues
        const [minY, minM, minD] = minISO.split('-').map(Number);
        const [maxY, maxM, maxD] = maxISO.split('-').map(Number);
        const startDate = new Date(minY, minM - 1, minD);
        const endDate = new Date(maxY, maxM - 1, maxD);
        
        for (let cur = new Date(startDate); cur <= endDate; cur.setDate(cur.getDate() + 1)) {
          // Use formatToISO to convert to ISO string in local timezone, not UTC
          days.push(formatToISO(cur));
        }
        allDays = days;
      }
    } catch (_) {}
  }

  const byDay = {};
  let accProj = 0;
  let accConta = 0;
  const todayISO = formatToISO(new Date());
  allDays.forEach((iso) => {
    accProj += deltasProj[iso] || 0;
    accConta += deltasConta[iso] || 0;
    let proj = accProj;
    let conta = accConta;
    // Subtract budget reservations for both balances.
    try {
      // For projected and available, do NOT antecipar devoluções futuras.
      // We freeze the return logic at today for dates in the future while
      // still allowing future cycle deductions to accumulate.
      const resvProj = calcReservedTotal ? (calcReservedTotal(iso, transactions, { freezeAtISO: todayISO }) || 0) : 0;
      const resvConta = calcReservedTotal ? (calcReservedTotal(iso, transactions, { freezeAtISO: todayISO }) || 0) : 0;
      if (Number.isFinite(resvProj)) proj -= resvProj;
      if (Number.isFinite(resvConta)) conta -= resvConta;
    } catch (_) {}
    byDay[iso] = { projetado: proj, emConta: conta };
  });
  return { byDay, deltasProj, deltasConta };
}

// Expose for debugging when loaded in a browser
if (typeof window !== 'undefined') {
  window.computeDailyBalances = computeDailyBalances;
}
