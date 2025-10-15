// Utility wrappers for formatting currency, numbers and parsing currency safely.
// These helpers delegate to the existing format utilities and include fallbacks
// so that callers do not need to reimplement error handling. By isolating them
// here we remove dozens of lines from main.js.
import { fmtCurrency, fmtNumber, parseCurrency } from './format.js';
import { getRuntimeProfile, DEFAULT_PROFILE } from './profile.js';

/**
 * Safely format a value as currency. Attempts to call the shared fmtCurrency
 * helper first. If that fails (e.g. due to missing profile or invalid input),
 * it falls back to constructing an Intl.NumberFormat with the user's locale
 * and currency. As a last resort it formats the number manually.
 * @param {number|string} value The value to format.
 * @param {Object} options Optional Intl.NumberFormat options.
 * @returns {string} The formatted currency string.
 */
export function safeFmtCurrency(value, options) {
  try {
    return fmtCurrency(value, options);
  } catch (_) {
    // continue to fallback logic
  }
  const profile = getRuntimeProfile();
  const decimals = options?.maximumFractionDigits ??
    options?.minimumFractionDigits ??
    (profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
  try {
    const nf = new Intl.NumberFormat(profile.locale || DEFAULT_PROFILE.locale, {
      style: 'currency',
      currency: profile.currency || DEFAULT_PROFILE.currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return nf.format(Number(value) || 0);
  } catch (_) {
    return `${profile.currency || DEFAULT_PROFILE.currency} ${(Number(value) || 0).toFixed(decimals)}`;
  }
}

/**
 * Safely format a value as a number. Delegates to fmtNumber and falls back
 * to a Intl.NumberFormat instance or a manual toFixed.
 * @param {number|string} value The value to format.
 * @param {Object} options Optional Intl.NumberFormat options.
 * @returns {string} The formatted number string.
 */
export function safeFmtNumber(value, options = {}) {
  try {
    return fmtNumber(value, options);
  } catch (_) {
    // ignore and try fallback below
  }
  const profile = getRuntimeProfile();
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ??
    Math.max(minimumFractionDigits, profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
  try {
    const nf = new Intl.NumberFormat(profile.locale || DEFAULT_PROFILE.locale, {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping: options.useGrouping !== false
    });
    return nf.format(Number(value) || 0);
  } catch (_) {
    return (Number(value) || 0).toFixed(Math.max(0, maximumFractionDigits));
  }
}

/**
 * Safely parse a currency string or number into a numeric value. Attempts to
 * delegate to parseCurrency, and falls back to stripping common punctuation.
 * @param {string|number} raw The raw currency string or number.
 * @returns {number} The numeric value.
 */
export function safeParseCurrency(raw) {
  try {
    return parseCurrency(raw);
  } catch (_) {
    // ignore and try fallback below
  }
  if (typeof raw === 'number') return raw;
  if (!raw) return 0;
  // Remove non-numeric characters and normalize decimal separators
  return Number(String(raw).replace(/[^0-9+\-.,]/g, '').replace(/\./g, '').replace(/,/g, '.')) || 0;
}