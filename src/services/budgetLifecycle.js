import { loadBudgets, saveBudgets } from './budgetStorage.js';
import { recomputeBudget } from './budgetCalculations.js';
import { todayISO as getTodayISO, occursOn } from '../utils/date.js';
import { normalizeISODate, generateBudgetId } from '../utils/budgetUtils.js';

export function closeExpiredBudgets(transactions = [], today = null) {
  const budgets = loadBudgets();
  if (!Array.isArray(budgets) || budgets.length === 0) return { closed: 0 };
  const t = (today || getTodayISO());
  let closed = 0;
  const updated = budgets.map((b) => {
    if (!b || b.status !== 'active') return b;
    const end = (b.endDate || '').slice(0, 10);
    // Close after the end day has passed (end inclusive during the cycle)
    if (end && end < t) {
      const rec = recomputeBudget({ ...b }, transactions) || { ...b };
      rec.status = 'closed';
      closed++;
      return rec;
    }
    return b;
  });
  if (closed > 0) saveBudgets(updated);
  return { closed };
}

export function initDayChangeWatcher(onChange) {
  let last = getTodayISO();
  const tick = () => {
    const now = getTodayISO();
    if (now !== last) {
      last = now;
      try { typeof onChange === 'function' && onChange(now); } catch (_) {}
    }
  };
  const id = setInterval(tick, 60 * 1000);
  return () => clearInterval(id);
}

// ---------- Recurring cycle materialization ----------

function addDays(iso, days) { try { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0,10);} catch(_) { return iso; } }
function addMonths(iso, months){ try { const [y,m,d]=(iso||'').split('-').map(Number); const nx = new Date(y,(m-1)+months,d); return nx.toISOString().slice(0,10);} catch(_) { return iso; } }
function nextFrom(start, rec){ switch(String(rec||'').trim()){ case 'D':return addDays(start,1); case 'W':return addDays(start,7); case 'BW':return addDays(start,14); case 'M':return addMonths(start,1); case 'Q':return addMonths(start,3); case 'S':return addMonths(start,6); case 'Y': { try{ const d=new Date(`${start}T00:00:00`); d.setFullYear(d.getFullYear()+1); return d.toISOString().slice(0,10);}catch(_) { return start; } } default:return start; } }

function findCycleStartFor(master, targetISO){
  try {
    const target = normalizeISODate(targetISO);
    const base = normalizeISODate(master.opDate);
    if (!target || !base) return null;
    const rec = String(master.recurrence || '').trim();
    if (rec === 'D' || rec === 'W' || rec === 'BW') {
      const t = new Date(`${target}T00:00:00`); const b = new Date(`${base}T00:00:00`);
      const diff = Math.floor((t - b) / 864e5); const period = rec==='D'?1:(rec==='W'?7:14);
      const remainder = ((diff % period)+period)%period; const s = new Date(t); s.setDate(s.getDate()-remainder);
      const iso = s.toISOString().slice(0,10); return iso < base ? base : iso;
    }
    // fallback scan up to 365 days
    const limit = 365;
    for (let i=0;i<=limit;i++){
      const d = new Date(`${target}T00:00:00`); d.setDate(d.getDate()-i);
      const iso = d.toISOString().slice(0,10);
      if (!occursOn(master, iso)) continue;
      const prev = new Date(d); prev.setDate(prev.getDate()-1);
      const prevIso = prev.toISOString().slice(0,10);
      if (!occursOn(master, prevIso)) return iso;
    }
    return null;
  } catch(_) { return null; }
}

function computeInitialForRange(transactions, tag, startIso, endIso){
  if (!Array.isArray(transactions) || !tag) return 0;
  const start = normalizeISODate(startIso); const end = normalizeISODate(endIso);
  return transactions.reduce((sum, tx) => {
    if (!tx || tx.budgetTag !== tag) return sum;
    const iso = normalizeISODate(tx.opDate || tx.postDate);
    if (!iso) return sum; if (start && iso < start) return sum; if (end && iso > end) return sum;
    const v = Number(tx.val); if (!Number.isFinite(v)) return sum; return sum + Math.abs(v);
  }, 0);
}

export function ensureRecurringBudgets(transactions = [], todayISO = getTodayISO()){
  const txs = Array.isArray(transactions) ? transactions : [];
  const today = normalizeISODate(todayISO);
  if (!today) return { created: 0 };
  const mastersByTag = new Map();
  txs.forEach((t) => {
    if (!t || !t.recurrence || !t.budgetTag) return;
    const tag = t.budgetTag; if (!tag) return;
    if (!mastersByTag.has(tag)) mastersByTag.set(tag, t);
  });
  const masters = Array.from(mastersByTag.values());
  if (!masters.length) return { created: 0 };
  const budgets = loadBudgets();
  let created = 0; const updatedList = budgets.slice();
  masters.forEach((m) => {
    const tag = m.budgetTag; if (!tag) return;
    const start = findCycleStartFor(m, today); if (!start) return;
    const end = nextFrom(start, m.recurrence) || start;
    const exists = budgets.some(b => b && b.status==='active' && b.budgetType==='recurring' && b.tag===tag && normalizeISODate(b.startDate)===start && normalizeISODate(b.endDate)===end);
    if (exists) return;
    let initial = computeInitialForRange(txs, tag, start, end);
    if (initial <= 0) { const v = Number(m.val); if (Number.isFinite(v)) initial = Math.abs(v); }
    const nowISO = new Date().toISOString();
    updatedList.push({
      id: generateBudgetId(), tag, budgetType: 'recurring', status: 'active',
      recurrenceId: String(m.id || m.parentId || generateBudgetId()),
      startDate: start, endDate: end, initialValue: initial, reservedValue: initial, spentValue: 0,
      lastUpdated: nowISO, triggerTxId: m.id != null ? String(m.id) : null, triggerTxIso: start,
    });
    created++;
  });
  if (created > 0) saveBudgets(updatedList);
  return { created };
}
