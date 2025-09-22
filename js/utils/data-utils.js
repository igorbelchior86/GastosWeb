/**
 * Data manipulation and validation utilities
 * Extracted from main.js as part of FASE 1 refactoring
 */

/**
 * Sanitize legacy transactions: ensure required fields exist
 * @param {Array} list - Array of transaction objects
 * @returns {object} Object with sanitized list and changed flag
 */
export function sanitizeTransactions(list) {
  // Import todayISO and post from date-utils
  const todayISO = window.todayISO || (() => new Date().toISOString().slice(0, 10));
  const post = window.post || ((date, method) => date); // Fallback if not available
  
  let changed = false;
  const out = (list || []).map((t) => {
    if (!t) return t;
    const nt = { ...t };
    
    // Ensure opDate exists; fallback to date from ts
    if (!nt.opDate) {
      if (nt.ts) {
        try { 
          nt.opDate = new Date(nt.ts).toISOString().slice(0, 10); 
        } catch { 
          nt.opDate = todayISO(); 
        }
      } else {
        nt.opDate = todayISO();
      }
      changed = true;
    }
    
    // Ensure postDate exists; compute with card rule
    if (!nt.postDate) {
      const method = nt.method || 'Dinheiro';
      try { 
        nt.postDate = post(nt.opDate, method); 
      } catch { 
        nt.postDate = nt.opDate; 
      }
      changed = true;
    }
    
    // Ensure planned flag exists
    if (typeof nt.planned === 'undefined' && nt.opDate) {
      nt.planned = nt.opDate > todayISO();
      changed = true;
    }
    
    return nt;
  });
  
  return { list: out, changed };
}

/**
 * Validate if transaction object has required fields
 * @param {object} tx - Transaction object to validate
 * @returns {object} Validation result with isValid and errors
 */
export function validateTransaction(tx) {
  const errors = [];
  
  if (!tx) {
    errors.push('Transaction object is required');
    return { isValid: false, errors };
  }
  
  if (!tx.desc || typeof tx.desc !== 'string' || tx.desc.trim() === '') {
    errors.push('Description is required');
  }
  
  if (typeof tx.val !== 'number' || isNaN(tx.val)) {
    errors.push('Value must be a valid number');
  }
  
  if (!tx.opDate || !/^\d{4}-\d{2}-\d{2}$/.test(tx.opDate)) {
    errors.push('Operation date must be in YYYY-MM-DD format');
  }
  
  if (!tx.method || typeof tx.method !== 'string') {
    errors.push('Payment method is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check if transaction is a detached occurrence from recurrence
 * @param {object} tx - Transaction object
 * @returns {boolean} True if it's a detached occurrence
 */
export function isDetachedOccurrence(tx) {
  return !!(tx && tx.parentId && !tx.recurrence);
}

/**
 * Check if element is inside a scrollable modal
 * @param {HTMLElement} el - Element to check
 * @returns {boolean} True if inside scrollable modal
 */
export function isInScrollableModal(el) {
  if (!el) return false;
  
  while (el && el !== document.body) {
    const computed = window.getComputedStyle(el);
    const overflowY = computed.overflowY;
    const hasScroll = el.scrollHeight > el.clientHeight;
    
    if ((overflowY === 'auto' || overflowY === 'scroll') && hasScroll) {
      // Check if this is inside a modal
      const modal = el.closest('.modal');
      if (modal) return true;
    }
    
    el = el.parentElement;
  }
  
  return false;
}

/**
 * Generate unique ID for transactions
 * @returns {string} Unique ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Deep clone object (simple implementation for transactions)
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Sort transactions by date (newest first)
 * @param {Array} transactions - Array of transactions
 * @returns {Array} Sorted transactions
 */
export function sortTransactionsByDate(transactions) {
  return [...transactions].sort((a, b) => {
    const dateA = a.opDate || a.postDate || '';
    const dateB = b.opDate || b.postDate || '';
    return dateB.localeCompare(dateA);
  });
}

/**
 * Filter transactions by date range
 * @param {Array} transactions - Array of transactions
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Array} Filtered transactions
 */
export function filterTransactionsByDateRange(transactions, startDate, endDate) {
  return transactions.filter(tx => {
    const txDate = tx.opDate || tx.postDate;
    return txDate && txDate >= startDate && txDate <= endDate;
  });
}

/**
 * Calculate total value of transactions
 * @param {Array} transactions - Array of transactions
 * @returns {number} Total value
 */
export function calculateTotal(transactions) {
  return transactions.reduce((sum, tx) => sum + (tx.val || 0), 0);
}

// Maintain backward compatibility by exposing functions globally
if (typeof window !== 'undefined') {
  window.sanitizeTransactions = sanitizeTransactions;
  window.validateTransaction = validateTransaction;
  window.isDetachedOccurrence = isDetachedOccurrence;
  window.isInScrollableModal = isInScrollableModal;
  window.generateId = generateId;
}