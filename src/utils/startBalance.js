import { safeParseCurrency } from './safeFormat.js';

/**
 * Normalise any stored start-balance value to a finite number or null.
 * Accepts numbers, numeric strings (including localized formats) and
 * simple objects that carry the value. Returns null when the input
 * cannot be parsed.
 *
 * @param {unknown} raw
 * @returns {number|null}
 */
export function normalizeStartBalance(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (!/[0-9]/.test(trimmed)) return null;
    const parsed = safeParseCurrency(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof raw === 'object') {
    const valueLike = raw.value ?? raw.amount ?? raw.startBalance ?? raw.balance;
    if (valueLike != null && valueLike !== raw) {
      return normalizeStartBalance(valueLike);
    }
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}
