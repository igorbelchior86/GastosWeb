/**
 * Utility modules index
 * Central export point for all utility functions
 * Part of FASE 1 refactoring - extracting utilities from main.js
 */

// Re-export all utilities for easy importing
export * from './date-utils.js';
export * from './format-utils.js';
export * from './dom-utils.js';
export * from './data-utils.js';
export * from './profile-utils.js';
export * from './cache-utils.js';
export * from '../state/app-state.js';

// Named exports for specific imports
export { 
  formatToISO, 
  todayISO, 
  post, 
  addYearsIso, 
  isSameDayOfMonth, 
  occursOn 
} from './date-utils.js';

export { 
  escHtml, 
  currency, 
  fmt, 
  formatDateISO, 
  formatCurrencyDisplay, 
  parseCurrency, 
  meses, 
  mobile 
} from './format-utils.js';

export { 
  toggleModal, 
  showModal, 
  hideModal, 
  focusInput, 
  scrollIntoView, 
  setTheme, 
  addListener, 
  createElement, 
  updateModalOpenState, 
  isElementVisible 
} from './dom-utils.js';

export {
  sanitizeTransactions,
  validateTransaction,
  isDetachedOccurrence,
  isInScrollableModal,
  generateId,
  deepClone,
  sortTransactionsByDate,
  filterTransactionsByDateRange,
  calculateTotal
} from './data-utils.js';

export {
  DEFAULT_PROFILE,
  LEGACY_PROFILE_ID,
  PROFILE_DATA_KEYS,
  PROFILE_CACHE_KEYS,
  getRuntimeProfile,
  getCurrencyName,
  getCurrentProfileId,
  scopedCacheKey,
  scopedDbSegment
} from './profile-utils.js';

export {
  cacheGet,
  cacheSet,
  cacheRemove,
  cacheClearProfile
} from './cache-utils.js';
