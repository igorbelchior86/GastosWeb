// Utilities for normalising transaction records and ensuring a cash card is present.
// Splitting these helpers into their own module keeps main.js lean.

/**
 * Normalizes a transaction record by providing sensible defaults and coercing
 * values into the expected format. If no record is supplied the original
 * value is returned.
 * @param {Object} t The transaction record to normalize.
 * @returns {Object} A normalized transaction record.
 */
export function normalizeTransactionRecord(t) {
  if (!t) return t;
  return {
    ...t,
    method: (t.method && t.method.toLowerCase() === 'dinheiro') ? 'Dinheiro' : t.method,
    recurrence: t.recurrence ?? '',
    installments: t.installments ?? 1,
    parentId: t.parentId ?? null
  };
}

/**
 * Ensures that the provided list of cards includes a "Dinheiro" entry.
 * If the list is empty or missing the cash card it is added to the front.
 * @param {Array<Object>} list A list of card objects.
 * @returns {Array<Object>} A copy of the cards list including the cash card.
 */
export function ensureCashCard(list) {
  const cardsList = Array.isArray(list) ? list.filter(Boolean).map(c => ({ ...c })) : [];
  if (!cardsList.some(c => c && c.name === 'Dinheiro')) {
    cardsList.unshift({ name: 'Dinheiro', close: 0, due: 0 });
  }
  return cardsList;
}