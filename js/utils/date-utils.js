// ============================================================================
// 📅 DATE UTILITIES
// ============================================================================
// Funções utilitárias para manipulação de datas e cálculos de cartão
// Extraído de main.js durante refatoração FASE 1

/**
 * Formats a Date object to YYYY-MM-DD string in local timezone
 * @param {Date} date
 * @returns {string}
 */
export function formatToISO(date) {
  // Adjust for local timezone before formatting
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

/**
 * Returns today's date in YYYY-MM-DD format (local timezone)
 * @returns {string}
 */
export const todayISO = () => formatToISO(new Date());

/**
 * Calculates the postDate for a card transaction based on card rules
 * @param {string} iso - Operation date in YYYY-MM-DD format
 * @param {string} method - Payment method (card name or 'Dinheiro')
 * @returns {string} Post date in YYYY-MM-DD format
 */
export const post = (iso, method) => {
  // Para dinheiro, postDate = opDate
  if (method === 'Dinheiro') return iso;
  
  // Busca o cartão (assume que 'cards' está disponível globalmente)
  const card = window.cards?.find(x => x.name === method);
  if (!card) return iso;
  
  // Parse da data de operação
  const [year, month, day] = iso.split('-').map(Number);
  const closingDay = card.close;
  const dueDay = card.due;
  const txDay = day;
  
  // Determina em qual fatura a transação entrará
  let invoiceMonth = month - 1; // JS Date/Month é 0-based
  let invoiceYear = year;
  
  if (txDay > closingDay) {
    // Transação após fechamento -> entra na fatura do mês seguinte
    if (invoiceMonth === 11) {
      invoiceMonth = 0;
      invoiceYear += 1;
    } else {
      invoiceMonth += 1;
    }
  }
  
  // Constrói data de vencimento da fatura
  return formatToISO(new Date(invoiceYear, invoiceMonth, dueDay));
};

/**
 * Adds years to an ISO date string
 * @param {string} iso - Date in YYYY-MM-DD format
 * @param {number} years - Number of years to add
 * @returns {string} New date in YYYY-MM-DD format
 */
export const addYearsIso = (iso, years) => {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return formatToISO(d);
};

/**
 * Checks if two dates have the same day of month with a given month interval
 * @param {string} baseIso - Base date in YYYY-MM-DD format
 * @param {string} testIso - Test date in YYYY-MM-DD format
 * @param {number} monthInterval - Interval in months (1=monthly, 3=quarterly, etc.)
 * @returns {boolean}
 */
export function isSameDayOfMonth(baseIso, testIso, monthInterval) {
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
 * @returns {boolean}
 */
export function occursOn(tx, iso) {
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

// Expõe todas as funções globalmente para manter compatibilidade
if (typeof window !== 'undefined') {
  window.formatToISO = formatToISO;
  window.todayISO = todayISO;
  window.post = post;
  window.addYearsIso = addYearsIso;
  window.isSameDayOfMonth = isSameDayOfMonth;
  window.occursOn = occursOn;
}