/*
 * Forimim */

import { getRuntimeProfile } from './profile.js';

/**
 * Default formatting profile used when no explicit profile is provided.
 * @type {{ id: string, locale: string, currency: string, decimalPlaces: number }}
 */
export const DEFAULT_PROFILE = {timeProfile } from './profile.js';

/**tRuntimeProfile } from './profile.js';

/**tRuntimeProfile } from './profile.js';

/**getRuntimeProfile } from './profile.js';{ getRuntimeProfile } from './profile.js';{ getRuntimeProfile } from './profile.js'; helpers
 *
 * Utilities to format numbers, currencies and dates consistently according
 * to the user's chosen locale and currency. These helpers accept an
 * optional profile parameter to override locale, currency and decimal
 * precision. When omitted, a basic default profile is used.
 */

import { getRuntimeProfile } from './profile.js';
 *
 * Utilities to format numbers, currencies and dates consistently according
 * to the user’s chosen locale and currency. These helpers accept an
 * optional profile parameter to override locale, currency and decimal
 * precision. When omitted, a basic default profile is used.
 */

/**
 * Default formatting profile used when no explicit profile is provided.
 * @type {{ id: string, locale: string, currency: string, decimalPlaces: number }}
 */
export const DEFAULT_PROFILE = {
  id: 'BR',
  locale: 'pt-BR',
  currency: 'BRL',
  decimalPlaces: 2
};

/**
 * Determine the current formatting profile. This implementation uses
 * localStorage to persist the user’s choice and falls back to the default
 * profile if no stored value exists. Pass a map of available profiles to
 * restrict which profiles can be chosen.
 *
 * @param {Record<string, object>} profiles map of available profiles keyed by id
 * @returns {object} active profile
 */
export function getActiveProfile(profiles = {}) {
  // Attempt to read a profile id from localStorage
  if (typeof window !== 'undefined') {
    try {
      const savedId = window.localStorage?.getItem?.('ui:profile');
      if (savedId && profiles[savedId]) return profiles[savedId];
    } catch {
      /* ignore */
    }
  }
  // Fallback to the first profile in the map, or default
  const first = Object.values(profiles)[0];
  return first || DEFAULT_PROFILE;
}

/**
 * Create a number formatter for currency values according to a profile.
 * Uses the built‑in Intl API when available; falls back to a simple
 * formatter on error. The result object has a `format` method that
 * accepts a numeric value and returns a localized currency string.
 *
 * @param {object} profile formatting profile
 * @param {object} [options] override locale/currency/decimal settings
 * @returns {Intl.NumberFormat|{ format: (number) => string }} formatter
 */
function createCurrencyFormatter(profile, options = {}) {
  const locale = options.locale || profile.locale || DEFAULT_PROFILE.locale;
  const currency = options.currency || profile.currency || DEFAULT_PROFILE.currency;
  const decimals = options.decimals ?? profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces;
  const minimumFractionDigits = options.minimumFractionDigits ?? decimals;
  const maximumFractionDigits = options.maximumFractionDigits ?? decimals;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits
    });
  } catch {
    // Fallback that returns a simple string
    return {
      format: (v) => `${currency} ${Number(v ?? 0).toFixed(maximumFractionDigits)}`
    };
  }
}

/**
 * Create a plain number formatter according to a profile. Useful for
 * formatting non‑currency numeric values (e.g. percentages). Falls back
 * to a simple implementation when Intl is unavailable.
 *
 * @param {object} profile formatting profile
 * @param {object} [options] override fraction digits and grouping
 * @returns {Intl.NumberFormat|{ format: (number) => string }} formatter
 */
function createNumberFormatter(profile, options = {}) {
  const locale = options.locale || profile.locale || DEFAULT_PROFILE.locale;
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? Math.max(
    minimumFractionDigits,
    profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces
  );
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping: options.useGrouping !== false
    });
  } catch {
    return {
      format: (v) => {
        const num = Number(v ?? 0);
        return num.toFixed(Math.max(0, maximumFractionDigits));
      }
    };
  }
}

/**
 * Coerce a user input into a numeric value. Accepts both strings and
 * numbers. Ignores non‑numeric characters (except minus sign and decimal
 * separator). Returns 0 when the input cannot be parsed.
 *
 * @param {number|string} value input to convert
 * @returns {number} coerced number
 */
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
 * Escape special HTML characters to prevent injection into the DOM. Always
 * escape user‑provided content before inserting into the page.
 *
 * @param {*} s string or value to escape
 * @returns {string} escaped string
 */
export function escHtml(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c];
  });
}

/**
 * Format a value as currency. Accepts numbers or numeric strings. The
 * returned string will include the appropriate currency symbol and
 * grouping based on the active profile. Optionally hide the sign or
 * force a sign to always be shown on positive values.
 *
 * @param {number|string} value value to format
 * @param {object} [options] formatting options (showSign, minimumFractionDigits, etc.)
 * @param {object} [profileOverride] override the active profile
 * @returns {string} formatted currency string
 */
export function fmtCurrency(value, options = {}, profileOverride = null) {
  const profile = profileOverride || getRuntimeProfile();
  const formatter = createCurrencyFormatter(profile, options);
  const numericValue = coerceNumber(value);
  let formatted;
  try {
    formatted = formatter.format(numericValue);
  } catch {
    const decimals = options.maximumFractionDigits ?? options.minimumFractionDigits ?? (profile.decimalPlaces || DEFAULT_PROFILE.decimalPlaces);
    formatted = `${profile.currency || DEFAULT_PROFILE.currency} ${numericValue.toFixed(decimals)}`;
  }
  // Manage sign visibility
  if (options.showSign === false) {
    return formatted.replace(/^[-+]/, '').replace(/^-/, '');
  }
  if (options.showSign === 'always' && numericValue > 0 && !formatted.startsWith('+')) {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Convenience alias for fmtCurrency when no customisation is required.
 *
 * @param {number|string} v value to format
 * @returns {string}
 */
export function currency(v) {
  return fmtCurrency(v);
}

/**
 * Format a number according to locale and options. Accepts numbers or
 * numeric strings. Returns a simple string when Intl is unavailable.
 *
 * @param {number|string} value number to format
 * @param {object} [options] optional configuration
 * @param {object} [profileOverride] override the active profile
 * @returns {string}
 */
export function fmtNumber(value, options = {}, profileOverride = null) {
  const profile = profileOverride || getRuntimeProfile();
  const formatter = createNumberFormatter(profile, options);
  const numericValue = coerceNumber(value);
  try {
    return formatter.format(numericValue);
  } catch {
    const max = options.maximumFractionDigits ?? options.minimumFractionDigits ?? (profile.decimalPlaces || DEFAULT_PROFILE.decimalPlaces);
    return numericValue.toFixed(Math.max(0, max));
  }
}

/**
 * Format a Date object for display. On narrow screens, omits the year to
 * save space. Uses the Portuguese (Brazil) locale as a default, which
 * matches the target audience of the Gastos+ application.
 *
 * @param {Date|string} d date to format
 * @param {string} [locale] override locale
 * @returns {string}
 */
export function fmtDate(d, locale = 'pt-BR') {
  const date = d instanceof Date ? d : new Date(d);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 480;
  return date.toLocaleDateString(locale, isMobile
    ? { day: '2-digit', month: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }
  );
}

/**
 * Format a Date object as an ISO date string (YYYY‑MM‑DD). Returns an
 * empty string if the argument is not a Date.
 *
 * @param {Date} date Date instance
 * @returns {string} ISO date or empty string
 */
export function formatDateISO(date) {
  if (!(date instanceof Date)) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Parse a currency input string into a numeric value. Attempts to infer
 * locale-specific grouping and decimal separators based on the current
 * profile. Accepts strings containing digits, optional grouping
 * separators, optional decimal separators, and leading sign. Returns
 * zero on failure.
 *
 * @param {string|number} str input
 * @param {object} [profileOverride] override the active profile
 * @returns {number} parsed value
 */
export function parseCurrency(str, profileOverride = null) {
  if (typeof str === 'number') {
    return Number.isFinite(str) ? str : 0;
  }
  if (!str) return 0;
  const profile = profileOverride || DEFAULT_PROFILE;
  const locale = profile.locale || DEFAULT_PROFILE.locale;
  let group = '.';
  let decimal = ',';
  // Determine separators via Intl API if available
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const groupPart = parts.find((p) => p.type === 'group');
    const decPart = parts.find((p) => p.type === 'decimal');
    group = groupPart?.value || group;
    decimal = decPart?.value || decimal;
  } catch {
    // Provide sensible defaults for English
    if (locale.startsWith('en')) {
      group = ',';
      decimal = '.';
    }
  }
  // Remove whitespace and currency symbols
  const sanitized = String(str)
    .replace(/\s+/g, '')
    .replace(new RegExp(`[^0-9${group}${decimal}\-+]`, 'g'), '')
    .replace(new RegExp(`\${group}`, 'g'), '')
    .replace(new RegExp(`\${decimal}`, 'g'), '.');
  const cleaned = sanitized.replace(/[^0-9+\-.]/g, '');
  const result = parseFloat(cleaned);
  return Number.isFinite(result) ? result : 0;
}

/**
 * Abbreviated month names in Portuguese. Useful for compact date displays.
 */
export const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/**
 * Determine if the current viewport qualifies as “mobile” based on width.
 * This helper is used by other parts of the application to adjust UI
 * behaviour and formatting for small screens.
 *
 * @returns {boolean}
 */
export function isMobile() {
  return typeof window !== 'undefined' && window.innerWidth <= 480;
}