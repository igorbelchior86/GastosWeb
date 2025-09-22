/**
 * Utilities for text, number and currency formatting.
 * Extracted from main.js as part of the refactoring effort.
 */

import { DEFAULT_PROFILE, getRuntimeProfile } from './profile-utils.js';

function getActiveProfile() {
  try {
    return getRuntimeProfile() || DEFAULT_PROFILE;
  } catch (_) {
    return DEFAULT_PROFILE;
  }
}

function resolveCurrencyFormatter(options = {}) {
  const profile = getActiveProfile();
  const decimals = options.decimals ?? profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces;
  const minimumFractionDigits = options.minimumFractionDigits ?? decimals;
  const maximumFractionDigits = options.maximumFractionDigits ?? decimals;
  const locale = options.locale || profile.locale || DEFAULT_PROFILE.locale;
  const currency = options.currency || profile.currency || DEFAULT_PROFILE.currency;

  const existing = options.forceNew
    ? null
    : (typeof window !== 'undefined' ? window.APP_FMT : null);
  if (existing && typeof existing.format === 'function') {
    return existing;
  }

  try {
    const nf = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits
    });
    if (typeof window !== 'undefined') {
      window.APP_FMT = nf;
    }
    return nf;
  } catch (_) {
    const fallback = {
      format: (v) => `${currency} ${Number(v ?? 0).toFixed(maximumFractionDigits)}`
    };
    if (typeof window !== 'undefined') {
      window.APP_FMT = fallback;
    }
    return fallback;
  }
}

function resolveNumberFormatter(options = {}) {
  const profile = getActiveProfile();
  const locale = options.locale || profile.locale || DEFAULT_PROFILE.locale;
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? Math.max(minimumFractionDigits, profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
  try {
    const nf = new Intl.NumberFormat(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping: options.useGrouping !== false
    });
    if (typeof window !== 'undefined') {
      window.APP_NUM = nf;
    }
    return nf;
  } catch (_) {
    const fallback = {
      format: (v) => {
        const value = Number(v ?? 0);
        const fixed = Math.max(0, maximumFractionDigits);
        return value.toFixed(fixed);
      }
    };
    if (typeof window !== 'undefined') {
      window.APP_NUM = fallback;
    }
    return fallback;
  }
}

function coerceNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const numeric = Number(trimmed.replace(/[^0-9+\-.,]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return Number(value) || 0;
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {*} s - String to escape
 * @returns {string} HTML-escaped string
 */
export function escHtml(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

/**
 * Format number according to the active currency profile.
 * @param {number|string} value
 * @param {object} [options]
 * @returns {string}
 */
export function fmtCurrency(value, options = {}) {
  const formatter = resolveCurrencyFormatter(options);
  const numericValue = coerceNumber(value);
  let formatted;
  try {
    formatted = formatter.format(numericValue);
  } catch (_) {
    const profile = getActiveProfile();
    const decimals = options.maximumFractionDigits ?? options.minimumFractionDigits ?? (profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
    formatted = `${profile.currency || DEFAULT_PROFILE.currency} ${numericValue.toFixed(decimals)}`;
  }

  if (options.showSign === false) {
    return formatted.replace(/^[-+]/, '').replace(/^-/, '');
  }
  if (options.showSign === 'always' && numericValue > 0 && !formatted.startsWith('+')) {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Aliased helper kept for legacy compatibility.
 */
export function currency(v) {
  return fmtCurrency(v);
}

/**
 * Format plain numbers using the active locale.
 * @param {number|string} value
 * @param {object} [options]
 * @returns {string}
 */
export function fmtNumber(value, options = {}) {
  const formatter = resolveNumberFormatter(options);
  const numericValue = coerceNumber(value);
  try {
    return formatter.format(numericValue);
  } catch (_) {
    const max = options.maximumFractionDigits ?? options.minimumFractionDigits ?? (getActiveProfile().decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
    return numericValue.toFixed(Math.max(0, max));
  }
}

/**
 * Format date for display (responsive: DD/MM or DD/MM/YYYY)
 * @param {Date|string} d - Date to format
 * @returns {string} Formatted date string
 */
export function fmt(d) {
  const date = d instanceof Date ? d : new Date(d);
  const mobile = () => window.innerWidth <= 480;
  return date.toLocaleDateString('pt-BR', mobile()
    ? { day: '2-digit', month: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }
  );
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 * @param {Date} date - Date to format
 * @returns {string} ISO date string or empty string if invalid
 */
export function formatDateISO(date) {
  if (!(date instanceof Date)) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Format number as currency with custom sign control (legacy helper).
 * @param {number} value
 * @param {boolean} showSign
 * @returns {string}
 */
export function formatCurrencyDisplay(value, showSign = true) {
  const signMode = showSign ? 'auto' : false;
  const formatted = fmtCurrency(value, {
    showSign: signMode === false ? false : undefined
  });
  if (showSign && value > 0 && !formatted.startsWith('+')) {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Parse currency input string to number respecting active locale.
 * @param {string|number} str
 * @returns {number}
 */
export function parseCurrency(str) {
  if (typeof str === 'number') {
    return Number.isFinite(str) ? str : 0;
  }
  if (!str) return 0;

  const profile = getActiveProfile();
  const locale = profile.locale || DEFAULT_PROFILE.locale;
  let group = '.';
  let decimal = ',';

  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    group = parts.find(p => p.type === 'group')?.value || group;
    decimal = parts.find(p => p.type === 'decimal')?.value || decimal;
  } catch (_) {
    if (locale.startsWith('en')) {
      group = ',';
      decimal = '.';
    }
  }

  const sanitized = String(str)
    .replace(/\s+/g, '')
    .replace(new RegExp(`[^0-9\${group}\${decimal}\-+]`, 'g'), '')
    .replace(new RegExp(`\${group}`, 'g'), '')
    .replace(new RegExp(`\${decimal}`, 'g'), '.');

  const cleaned = sanitized.replace(/[^0-9+\-.]/g, '');
  const result = parseFloat(cleaned);
  return Number.isFinite(result) ? result : 0;
}

/**
 * Array of month abbreviations in Portuguese
 */
export const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Check if current viewport is mobile
 * @returns {boolean} True if mobile viewport
 */
export function mobile() {
  return window.innerWidth <= 480;
}

// Maintain backward compatibility by exposing functions globally
if (typeof window !== 'undefined') {
  window.escHtml = escHtml;
  window.currency = currency;
  window.fmt = fmt;
  window.fmtCurrency = fmtCurrency;
  window.fmtNumber = fmtNumber;
  window.formatDateISO = formatDateISO;
  window.meses = meses;
  window.mobile = mobile;
}
