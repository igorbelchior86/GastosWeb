// ============================================================================
// 🎨 FORMAT UTILITIES - GLOBAL VERSION  
// ============================================================================
// Funções utilitárias para formatação de texto e moeda
// Versão global para compatibilidade com browsers mais antigos

const DEFAULT_PROFILE = {
  id: 'BR',
  locale: 'pt-BR',
  currency: 'BRL',
  decimalPlaces: 2
};

function getActiveProfile() {
  const profiles = window.CURRENCY_PROFILES || {};
  if (window.APP_PROFILE) return window.APP_PROFILE;
  try {
    const savedId = window.localStorage?.getItem?.('ui:profile');
    if (savedId && profiles[savedId]) return profiles[savedId];
  } catch (_) {}
  const first = Object.values(profiles)[0];
  return first || DEFAULT_PROFILE;
}

function resolveCurrencyFormatter(options) {
  const profile = getActiveProfile();
  const locale = options?.locale || profile.locale || DEFAULT_PROFILE.locale;
  const currency = options?.currency || profile.currency || DEFAULT_PROFILE.currency;
  const decimals = options?.decimals ?? profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces;
  const minimumFractionDigits = options?.minimumFractionDigits ?? decimals;
  const maximumFractionDigits = options?.maximumFractionDigits ?? decimals;

  if (!options?.forceNew && window.APP_FMT && typeof window.APP_FMT.format === 'function') {
    return window.APP_FMT;
  }
  try {
    const nf = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits
    });
    if (!options?.forceNew) window.APP_FMT = nf;
    return nf;
  } catch (_) {
    const fallback = { format: (v) => `${currency} ${Number(v ?? 0).toFixed(maximumFractionDigits)}` };
    if (!options?.forceNew) window.APP_FMT = fallback;
    return fallback;
  }
}

function resolveNumberFormatter(options) {
  const profile = getActiveProfile();
  const locale = options?.locale || profile.locale || DEFAULT_PROFILE.locale;
  const minimumFractionDigits = options?.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options?.maximumFractionDigits ?? Math.max(minimumFractionDigits, profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
  try {
    const nf = new Intl.NumberFormat(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping: options?.useGrouping !== false
    });
    if (!options?.forceNew) window.APP_NUM = nf;
    return nf;
  } catch (_) {
    const fallback = { format: (v) => {
      const value = Number(v ?? 0);
      const fixed = Math.max(0, maximumFractionDigits);
      return value.toFixed(fixed);
    } };
    if (!options?.forceNew) window.APP_NUM = fallback;
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

function escHtml(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function fmtCurrency(value, options) {
  const formatter = resolveCurrencyFormatter(options);
  const numericValue = coerceNumber(value);
  let formatted;
  try {
    formatted = formatter.format(numericValue);
  } catch (_) {
    const profile = getActiveProfile();
    const decimals = options?.maximumFractionDigits ?? options?.minimumFractionDigits ?? (profile.decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
    formatted = `${profile.currency || DEFAULT_PROFILE.currency} ${numericValue.toFixed(decimals)}`;
  }

  if (options && options.showSign === false) {
    return formatted.replace(/^[-+]/, '').replace(/^-/, '');
  }
  if (options && options.showSign === 'always' && numericValue > 0 && !formatted.startsWith('+')) {
    return `+${formatted}`;
  }
  return formatted;
}

function currency(v) {
  return fmtCurrency(v);
}

function fmtNumber(value, options) {
  const formatter = resolveNumberFormatter(options);
  const numericValue = coerceNumber(value);
  try {
    return formatter.format(numericValue);
  } catch (_) {
    const max = options?.maximumFractionDigits ?? options?.minimumFractionDigits ?? (getActiveProfile().decimalPlaces ?? DEFAULT_PROFILE.decimalPlaces);
    return numericValue.toFixed(Math.max(0, max));
  }
}

function fmt(d) {
  const date = d instanceof Date ? d : new Date(d);
  const mobile = () => window.innerWidth <= 480;
  return date.toLocaleDateString('pt-BR', mobile()
    ? { day: '2-digit', month: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }
  );
}

function formatDateISO(date) {
  if (!(date instanceof Date)) return '';
  return date.toISOString().slice(0, 10);
}

function formatCurrencyDisplay(value, showSign) {
  const formatted = fmtCurrency(value, { showSign: showSign ? undefined : false });
  if (showSign && value > 0 && !formatted.startsWith('+')) {
    return `+${formatted}`;
  }
  return formatted;
}

function parseCurrency(str) {
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

function mobile() {
  return window.innerWidth <= 480;
}

const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

window.escHtml = escHtml;
window.currency = currency;
window.fmt = fmt;
window.fmtCurrency = fmtCurrency;
window.fmtNumber = fmtNumber;
window.formatDateISO = formatDateISO;
window.formatCurrencyDisplay = formatCurrencyDisplay;
window.parseCurrency = parseCurrency;
window.mobile = mobile;
window.meses = meses;
