// ============================================================================
// 🗃️ DATA UTILITIES - GLOBAL VERSION
// ============================================================================
// Funções utilitárias para manipulação e validação de dados
// Versão global para compatibilidade com browsers mais antigos

/**
 * Sanitize legacy transactions: ensure required fields exist
 * @param {Array} list - Array of transaction objects
 * @returns {object} Object with sanitized list and changed flag
 */
function sanitizeTransactions(list) {
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
 * Check if transaction is a detached occurrence from recurrence
 * @param {object} tx - Transaction object
 * @returns {boolean} True if it's a detached occurrence
 */
function isDetachedOccurrence(tx) {
  return !!(tx && tx.parentId && !tx.recurrence);
}

/**
 * Generate unique ID for transactions
 * @returns {string} Unique ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Expose all functions globally
window.sanitizeTransactions = sanitizeTransactions;
window.isDetachedOccurrence = isDetachedOccurrence;
window.generateId = generateId;