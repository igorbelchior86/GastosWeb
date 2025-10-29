import { todayISO } from './date.js';

export function normalizeISODate(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch (_) {
      return null;
    }
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (!str) return null;
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function generateBudgetId() {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
  const suffix = Math.random().toString(36).slice(2, 8);
  return `budget_${stamp}_${suffix}`;
}

export function isFutureISODate(iso) {
  const normalized = normalizeISODate(iso);
  if (!normalized) return false;
  return normalized > todayISO();
}
