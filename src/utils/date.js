/*
 * Date utility helpers
 *
 * These functions provide convenient abstractions around common date
 * manipulations used throughout the Gastos+ application. They are
 * intentionally decoupled from the global `window` object and must be
 * explicitly imported when needed. Card due date calculations are passed
 * card data rather than pulled from a global variable, making the logic
 * easier to test.
 */

/**
 * Convert a Date object into an ISO string (YYYY-MM-DD) adjusted for the
 * local timezone. Without the timezone adjustment, the resulting ISO
 * string would be in UTC, which causes off‑by‑one errors when the local
 * timezone is behind UTC.
 *
 * @param {Date} date native Date object
 * @returns {string} ISO date string in local time
 */
export function formatToISO(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

/**
 * Return today's date formatted as YYYY‑MM‑DD using the local timezone.
 *
 * @returns {string} ISO date string representing the current day
 */
export function todayISO() {
  return formatToISO(new Date());
}

/**
 * Calculate the posting date (invoice due date) for a card transaction.
 * For cash transactions (`method === 'Dinheiro'`), the posting date is
 * identical to the operation date.
 *
 * @param {string} iso operation date in YYYY‑MM‑DD format
 * @param {string} method card name or `'Dinheiro'`
 * @param {Array<{name: string, close: number, due: number}>} cards list of cards
 * @returns {string} posting date in YYYY‑MM‑DD format
 */
export function postDateForCard(iso, method, cards = []) {
  if (method === 'Dinheiro') return iso;
  const card = cards.find((c) => c && c.name === method);
  if (!card) return iso;

  const [year, month, day] = iso.split('-').map(Number);
  let invoiceMonth = month - 1; // JavaScript months are 0‑based
  let invoiceYear = year;
  // If the transaction happens after the closing day, it goes on the next invoice
  if (day > card.close) {
    if (invoiceMonth === 11) {
      invoiceMonth = 0;
      invoiceYear += 1;
    } else {
      invoiceMonth += 1;
    }
  }
  return formatToISO(new Date(invoiceYear, invoiceMonth, card.due));
}

/**
 * Add a number of years to an ISO date string.
 *
 * @param {string} iso date in YYYY‑MM‑DD format
 * @param {number} years number of years to add (can be negative)
 * @returns {string} ISO date string after adding years
 */
export function addYearsIso(iso, years) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return formatToISO(d);
}

/**
 * Determine if two dates share the same day of month given a recurrence
 * interval. For example, to determine if two dates represent the same
 * monthly recurring instance, pass a monthInterval of 1. For quarterly
 * recurrences, pass 3.
 *
 * @param {string} baseIso base date in YYYY‑MM‑DD
 * @param {string} testIso test date in YYYY‑MM‑DD
 * @param {number} monthInterval interval in months
 * @returns {boolean} true if the two dates align under the recurrence interval
 */
export function isSameDayOfMonth(baseIso, testIso, monthInterval) {
  const [by, bm, bd] = baseIso.split('-').map(Number);
  const [ty, tm, td] = testIso.split('-').map(Number);
  if (td !== bd) return false;
  const monthsDiff = (ty - by) * 12 + (tm - bm);
  return monthsDiff % monthInterval === 0;
}

/**
 * Determine whether a recurring transaction occurs on a particular date.
 *
 * A transaction object may contain the following fields:
 *   - opDate: string ISO date when the recurrence begins
 *   - recurrence: string indicating the pattern ('D','W','BW','M','Q','S','Y')
 *   - recurrenceEnd: optional ISO date string specifying when the recurrence ends
 *   - exceptions: optional array of ISO date strings that should be skipped
 *
 * @param {object} tx transaction object
 * @param {string} iso ISO date to test (YYYY‑MM‑DD)
 * @returns {boolean} true if the transaction occurs on the given date
 */
export function occursOn(tx, iso) {
  if (!tx || !iso) return false;
  // Skip if explicitly excluded
  if (Array.isArray(tx.exceptions) && tx.exceptions.includes(iso)) return false;
  // Stop recurring on or after the specified end date
  if (tx.recurrenceEnd && iso >= tx.recurrenceEnd) return false;
  if (!tx.recurrence) return false;
  if (iso < tx.opDate) return false;

  const baseDate = new Date(tx.opDate);
  const testDate = new Date(iso);
  const diffDays = Math.floor((testDate - baseDate) / 864e5);
  switch (tx.recurrence) {
    case 'D': // daily
      return true;
    case 'W': // weekly
      return diffDays % 7 === 0;
    case 'BW': // bi‑weekly
      return diffDays % 14 === 0;
    case 'M': // monthly
      return isSameDayOfMonth(tx.opDate, iso, 1);
    case 'Q': // quarterly
      return isSameDayOfMonth(tx.opDate, iso, 3);
    case 'S': // semiannual
      return isSameDayOfMonth(tx.opDate, iso, 6);
    case 'Y': { // annual
      const bd = baseDate;
      const td = testDate;
      return bd.getDate() === td.getDate() && bd.getMonth() === td.getMonth();
    }
    default:
      return false;
  }
}