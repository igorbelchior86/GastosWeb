import { cacheGet, cacheSet } from '../utils/cache.js';
import { save as fbSave, load as fbLoad } from './firebaseService.js';
import { scopedCacheKey } from '../utils/profile.js';

const BUDGET_STORAGE_KEY = 'budgets';
const VALID_STATUSES = new Set(['active', 'closed']);
const VALID_TYPES = new Set(['ad-hoc', 'recurring']);

let inMemoryCache = null;

function getScopedKey() {
  return scopedCacheKey(BUDGET_STORAGE_KEY);
}

function safeIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }
  return null;
}

function safeIsoDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return `${trimmed.slice(0, 10)}T00:00:00.000Z`;
    }
  }
  return null;
}

function normalizeNumber(value, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function normalizeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeBudget(rawBudget) {
  if (!rawBudget || typeof rawBudget !== 'object') return null;

  const id = normalizeString(rawBudget.id);
  const tag = normalizeString(rawBudget.tag);
  if (!id || !tag) return null;

  const status = VALID_STATUSES.has(rawBudget.status) ? rawBudget.status : 'active';
  const budgetType = VALID_TYPES.has(rawBudget.budgetType) ? rawBudget.budgetType : 'ad-hoc';
  const startDate = safeIsoDate(rawBudget.startDate);
  const endDate = safeIsoDate(rawBudget.endDate);
  const recurrenceId = normalizeString(rawBudget.recurrenceId) || null;
  const triggerTxId = normalizeString(rawBudget.triggerTxId) || null;
  const triggerTxIso = safeIsoDate(rawBudget.triggerTxIso);

  return {
    id,
    tag,
    budgetType,
    startDate,
    endDate,
    initialValue: normalizeNumber(rawBudget.initialValue),
    reservedValue: normalizeNumber(rawBudget.reservedValue),
    spentValue: normalizeNumber(rawBudget.spentValue),
    status,
    recurrenceId,
    lastUpdated: safeIsoDateTime(rawBudget.lastUpdated) || new Date().toISOString(),
    triggerTxId,
    triggerTxIso,
  };
}

function ensureCache(budgets) {
  inMemoryCache = Array.isArray(budgets) ? budgets.slice() : [];
  return inMemoryCache;
}

export function loadBudgets() {
  if (Array.isArray(inMemoryCache)) {
    return inMemoryCache.slice();
  }
  let stored = [];
  try {
    stored = cacheGet(BUDGET_STORAGE_KEY, []);
    if (!Array.isArray(stored)) stored = [];
  } catch {
    stored = [];
  }
  const normalized = stored
    .map(normalizeBudget)
    .filter(Boolean);
  return ensureCache(normalized).slice();
}

function within(iso, start, end) {
  if (!iso) return false;
  if (start && iso < start) return false;
  if (end && iso > end) return false;
  return true;
}

function enforceSingleActivePerTag(list) {
  const today = new Date().toISOString().slice(0, 10);
  const groups = new Map();
  (list || []).forEach(b => {
    if (!b) return;
    if (!groups.has(b.tag)) groups.set(b.tag, []);
    groups.get(b.tag).push(b);
  });
  const updated = list.slice();
  groups.forEach((items, tag) => {
    const actives = items.filter(b => b.status === 'active');
    if (actives.length <= 1) return;
    // Choose the single winner to remain active
    const containing = actives.filter(b => within(today, (b.startDate||'').slice(0,10), (b.endDate||'').slice(0,10)));
    const pickFrom = containing.length ? containing : actives;
    // Keep the one with the latest startDate
    const winner = pickFrom.reduce((best, cur) => {
      const bs = (best?.startDate || '').slice(0,10);
      const cs = (cur?.startDate || '').slice(0,10);
      return (cs > bs) ? cur : best;
    });
    const idsToClose = new Set(actives.filter(b => b !== winner).map(b => b.id));
    for (let i = 0; i < updated.length; i++) {
      const b = updated[i];
      if (!b || b.tag !== tag) continue;
      if (idsToClose.has(b.id) && b.status === 'active') {
        updated[i] = { ...b, status: 'closed' };
      }
    }
  });
  return updated;
}

export function saveBudgets(nextBudgets) {
  const serialized = Array.isArray(nextBudgets)
    ? nextBudgets.map(normalizeBudget).filter(Boolean)
    : [];
  const deduped = enforceSingleActivePerTag(serialized);
  ensureCache(deduped);
  try {
    cacheSet(BUDGET_STORAGE_KEY, deduped);
  } catch {
    /* ignore storage errors */
  }
  // Best-effort remote sync (no throw): keeps multiple clients in sync
  try { fbSave && fbSave('budgets', deduped); } catch (_) {}
  return inMemoryCache.slice();
}

export function findActiveByTag(tag) {
  const target = normalizeString(tag);
  if (!target) return null;
  const budgets = loadBudgets();
  return budgets.find((budget) => budget.tag === target && budget.status === 'active') || null;
}

export function resetBudgetCache() {
  inMemoryCache = null;
}

export function getBudgetStorageKey() {
  return getScopedKey();
}

/**
 * Reconcile local budgets with the remote store using a stable key per
 * (tag, startDate, endDate, budgetType). Chooses the record with the
 * latest lastUpdated for each logical key, enforces single-active-per-tag,
 * then persists the merged result locally and remotely.
 */
export async function reconcileBudgetsWithRemote() {
  let remote = [];
  try {
    const raw = await fbLoad('budgets', []);
    remote = Array.isArray(raw) ? raw : Object.values(raw || {});
  } catch (_) { remote = []; }
  const local = loadBudgets();
  const all = [...local, ...remote].map(normalizeBudget).filter(Boolean);
  // Merge by semantic key
  const byKey = new Map();
  all.forEach((b) => {
    const key = [b.tag, b.startDate, b.endDate, b.budgetType].join('|');
    const prev = byKey.get(key);
    const prevTs = Date.parse(prev?.lastUpdated || 0);
    const curTs  = Date.parse(b.lastUpdated || 0);
    if (!prev || curTs >= prevTs) byKey.set(key, b);
  });
  const merged = Array.from(byKey.values());
  // Enforce single active per tag and persist
  const deduped = enforceSingleActivePerTag(merged);
  saveBudgets(deduped);
  return deduped;
}
