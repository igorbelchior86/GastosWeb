// ============================================================================
// 📅 DATE UTILITIES - GLOBAL VERSION
// ============================================================================
// Funções utilitárias para manipulação de datas e cálculos de cartão
// Versão global para compatibilidade com browsers mais antigos

/**
 * Formats a Date object to YYYY-MM-DD string in local timezone
 * @param {Date} date
 * @returns {string}
 */
function formatToISO(date) {
  // Adjust for local timezone before formatting
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

/**
 * Returns today's date in YYYY-MM-DD format (local timezone)
 * @returns {string}
 */
function todayISO() {
  return formatToISO(new Date());
}

/**
 * Calculate card invoice post date based on card rules
 * @param {string} iso - Operation date in YYYY-MM-DD format
 * @param {string} m - Payment method/card name
 * @returns {string} Post date in YYYY-MM-DD format
 */
function post(iso, m) {
  if (m === 'Dinheiro') return iso;
  const c = cards.find(x => x.name === m);
  if (!c) return iso;
  
  const [y, mo, d] = iso.split('-').map(Number);
  const closingDay = c.close;
  const dueDay = c.due;
  const txDay = d;
  let invoiceMonth = mo - 1; // JS Date/Month is 0-based
  let invoiceYear = y;
  
  if (txDay > closingDay) {
    // enters next month's invoice
    if (invoiceMonth === 11) {
      invoiceMonth = 0;
      invoiceYear += 1;
    } else {
      invoiceMonth += 1;
    }
  }
  
  // Build invoice due date (YYYY-MM-DD)
  return formatToISO(new Date(invoiceYear, invoiceMonth, dueDay));
}

/**
 * Add years to an ISO date string
 * @param {string} iso - Date in YYYY-MM-DD format
 * @param {number} n - Number of years to add
 * @returns {string} New date in YYYY-MM-DD format
 */
function addYearsIso(iso, n) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + n);
  return formatToISO(d);
}

/**
 * Check if two dates have the same day of month for recurrence calculation
 * @param {string} baseIso - Base date in YYYY-MM-DD format
 * @param {string} testIso - Test date in YYYY-MM-DD format
 * @param {number} monthInterval - Month interval for recurrence
 * @returns {boolean} True if they match the recurrence pattern
 */
function isSameDayOfMonth(baseIso, testIso, monthInterval) {
  const [by, bm, bd] = baseIso.split('-').map(Number);
  const [ty, tm, td] = testIso.split('-').map(Number);
  
  if (td !== bd) return false;
  
  const monthsDiff = (ty - by) * 12 + (tm - bm);
  return monthsDiff % monthInterval === 0;
}

/**
 * Checks if a recurring transaction occurs on a specific date
 * @param {Object} tx - Transaction object with recurrence rules
 * @param {string} iso - Date to check in YYYY-MM-DD format
 * @returns {boolean} True if transaction occurs on this date
 */
function occursOn(tx, iso) {
  // Exclude single exceptions
  if (tx.exceptions && tx.exceptions.includes(iso)) return false;
  // Exclude dates on or after recurrence end
  if (tx.recurrenceEnd && iso >= tx.recurrenceEnd) return false;
  if (!tx.recurrence) return false;
  if (iso < tx.opDate) return false;
  
  const baseDate = new Date(tx.opDate);
  const testDate = new Date(iso);
  const diffDays = Math.floor((testDate - baseDate) / 864e5);
  
  switch (tx.recurrence) {
    case 'D':  return true;
    case 'W':  return diffDays % 7  === 0;
    case 'BW': return diffDays % 14 === 0;
    case 'M':  return isSameDayOfMonth(tx.opDate, iso, 1);
    case 'Q':  return isSameDayOfMonth(tx.opDate, iso, 3);
    case 'S':  return isSameDayOfMonth(tx.opDate, iso, 6);
    case 'Y': {
      const bd = baseDate;
      const td = testDate;
      return bd.getDate() === td.getDate() && bd.getMonth() === td.getMonth();
    }
    default:   return false;
  }
}

// Expose all functions globally
window.formatToISO = formatToISO;
window.todayISO = todayISO;
window.post = post;
window.addYearsIso = addYearsIso;
window.isSameDayOfMonth = isSameDayOfMonth;
window.occursOn = occursOn;