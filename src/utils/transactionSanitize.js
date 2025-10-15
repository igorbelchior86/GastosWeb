/**
 * Transaction sanitization and validation utilities.
 * This module provides functions to clean, validate, and sort transactions,
 * ensuring data consistency and integrity throughout the app.
 */

/**
 * Initializes transaction sanitization functions with app dependencies.
 * @param {Object} config - Configuration object
 * @param {Function} config.getTransactions - Function to get transactions
 * @param {Function} config.setTransactions - Function to set transactions  
 * @param {Array} config.cards - Array of available cards
 * @param {Function} config.post - Function to calculate post dates
 * @param {string} config.todayISO - Today's date in ISO format
 * @returns {Object} Object containing sanitization functions
 */
export function initTransactionSanitize(config) {
  const {
    getTransactions,
    setTransactions,
    cards,
    post,
    todayISO
  } = config;

  /**
   * Sorts transactions by date in descending order (newest first)
   * @param {Array} transactions - Array of transactions to sort
   * @returns {Array} Sorted array of transactions
   */
  function sortTransactions(transactions) {
    if (!Array.isArray(transactions)) return [];
    
    return [...transactions].sort((a, b) => {
      const dateA = a.iso || a.date || '';
      const dateB = b.iso || b.date || '';
      
      // Sort descending (newest first)
      return dateB.localeCompare(dateA);
    });
  }

  /**
   * Sanitizes a single transaction object
   * @param {Object} tx - Transaction to sanitize
   * @returns {Object} Sanitized transaction
   */
  function sanitizeTransaction(tx) {
    if (!tx || typeof tx !== 'object') return null;

    const sanitized = { ...tx };

    // Ensure required fields exist
    if (!sanitized.id) {
      sanitized.id = generateTransactionId();
    }

    if (!sanitized.iso && !sanitized.date) {
      sanitized.iso = todayISO;
    }

    // Normalize date field
    if (sanitized.date && !sanitized.iso) {
      sanitized.iso = sanitized.date;
    }

    // Ensure numeric value
    if (typeof sanitized.value === 'string') {
      const parsed = parseFloat(sanitized.value);
      if (!isNaN(parsed)) {
        sanitized.value = parsed;
      }
    }

    // Ensure value is a number
    if (typeof sanitized.value !== 'number' || isNaN(sanitized.value)) {
      sanitized.value = 0;
    }

    // Sanitize description
    if (typeof sanitized.desc === 'string') {
      sanitized.desc = sanitized.desc.trim();
    } else {
      sanitized.desc = '';
    }

    // Validate card reference
    if (sanitized.card && cards) {
      const cardExists = cards.some(c => c.id === sanitized.card);
      if (!cardExists) {
        // Reset to default card if invalid
        sanitized.card = cards.length > 0 ? cards[0].id : null;
      }
    }

    // Sanitize invoice data
    if (sanitized.invoice) {
      if (typeof sanitized.invoice.installment === 'string') {
        sanitized.invoice.installment = parseInt(sanitized.invoice.installment, 10);
      }
      if (typeof sanitized.invoice.total === 'string') {
        sanitized.invoice.total = parseInt(sanitized.invoice.total, 10);
      }
    }

    return sanitized;
  }

  /**
   * Sanitizes an array of transactions
   * @param {Array} transactions - Array of transactions to sanitize
   * @returns {Array} Array of sanitized transactions
   */
  function sanitizeTransactions(transactions) {
    if (!Array.isArray(transactions)) return [];
    
    return transactions
      .map(sanitizeTransaction)
      .filter(tx => tx !== null);
  }

  /**
   * Recomputes post dates for all transactions based on current card settings
   * @param {Array} transactions - Array of transactions to update
   * @returns {Array} Transactions with updated post dates
   */
  function recomputePostDates(transactions) {
    if (!Array.isArray(transactions) || !post) return transactions;

    return transactions.map(tx => {
      if (tx.card && tx.iso) {
        try {
          const card = cards.find(c => c.id === tx.card);
          if (card) {
            const postDate = post(tx.iso, card);
            return { ...tx, post: postDate };
          }
        } catch (error) {
          console.warn('Failed to recompute post date for transaction:', tx.id, error);
        }
      }
      return tx;
    });
  }

  /**
   * Generates a unique transaction ID
   * @returns {string} Unique transaction ID
   */
  function generateTransactionId() {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validates a transaction object
   * @param {Object} tx - Transaction to validate
   * @returns {boolean} True if transaction is valid
   */
  function isValidTransaction(tx) {
    if (!tx || typeof tx !== 'object') return false;
    if (typeof tx.value !== 'number' || isNaN(tx.value)) return false;
    if (!tx.desc || typeof tx.desc !== 'string') return false;
    if (!tx.iso && !tx.date) return false;
    return true;
  }

  /**
   * Removes duplicate transactions based on ID
   * @param {Array} transactions - Array of transactions
   * @returns {Array} Deduplicated array of transactions
   */
  function removeDuplicates(transactions) {
    if (!Array.isArray(transactions)) return [];
    
    const seen = new Set();
    return transactions.filter(tx => {
      if (!tx.id) return true; // Keep transactions without ID for now
      if (seen.has(tx.id)) return false;
      seen.add(tx.id);
      return true;
    });
  }

  // Return the API
  return {
    sortTransactions,
    sanitizeTransaction,
    sanitizeTransactions,
    recomputePostDates,
    isValidTransaction,
    removeDuplicates
  };
}