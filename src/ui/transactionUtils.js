/**
 * Utility functions for filtering transactions by date and calculating date
 * ranges. These functions are configured with the dependencies they need,
 * allowing `main.js` to remain lighter. The original implementations of
 * `txByDate` and `calculateDateRange` from `main.js` have been moved here.
 *
 * Usage:
 *   import { initTxUtils } from './ui/transactionUtils.js';
 *   const { txByDate, calculateDateRange } = initTxUtils({
 *     cards,
 *     getTransactions,
 *     transactions,
 *     post,
 *     occursOn,
 *     todayISO,
 *     VIEW_YEAR
 *   });
 */
export function initTxUtils(config) {
  const {
    cards = [],
    getTransactions,
    transactions = [],
    post,
    occursOn,
    todayISO,
    VIEW_YEAR,
    getViewYear
  } = config || {};
  const resolveViewYear = () => {
    if (typeof getViewYear === 'function') {
      const dynamicYear = Number(getViewYear());
      if (Number.isFinite(dynamicYear)) return dynamicYear;
    }
    const fallbackYear = Number(VIEW_YEAR);
    if (Number.isFinite(fallbackYear)) return fallbackYear;
    return new Date().getFullYear();
  };

  /**
   * Returns a list of transactions (including expanded occurrences) that
   * should appear on a given ISO date. This replicates the logic previously
   * embedded in `main.js`. It handles cash, card and recurring entries.
   *
   * @param {string} iso Date in YYYY‑MM‑DD format.
   * @returns {Array} Array of transaction objects for the given date.
   */
  function txByDate(iso) {
    const list = [];
    const today = typeof todayISO === 'function' ? todayISO() : (new Date()).toISOString().slice(0,10);
    // Normalize helper used to match card names ignoring accents/case
    const nrm = s => (s == null ? '' : String(s))
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    const nonCashCards = (cards || []).filter(c => c && c.name !== 'Dinheiro');
    const singleCard = nonCashCards.length === 1 ? nonCashCards[0].name : null;
    const resolveCard = (m) => {
      const mNorm = nrm(m);
      if (!m || mNorm === 'dinheiro') return null;
      const found = (cards || []).find(c => c && nrm(c.name) === mNorm);
      if (found) return found.name;
      if (singleCard) return singleCard;
      return null;
    };
    const txs = typeof getTransactions === 'function' ? getTransactions() : transactions;
    // Non‑recurring entries
    txs.forEach(t => {
      if (t.recurrence) return;
      if (t.opDate !== iso) return;
      if (t.invoiceAdjust) return;
      if (t.method !== 'Dinheiro') {
        // Card transactions may appear on opDate and also on their invoice
        const em = resolveCard(t.method) || t.method;
        const pd = typeof post === 'function' ? post(t.opDate, em) : t.opDate;
        list.push({ ...t, method: em, postDate: pd });
      } else {
        // Cash always appears on opDate
        list.push(t);
      }
    });
    // Recurring rules: materialize occurrences on this date
    txs
      .filter(t => t.recurrence)
      .forEach(master => {
        if (typeof occursOn === 'function' ? !occursOn(master, iso) : false) return;
        const em = resolveCard(master.method) || master.method;
        const pd = typeof post === 'function' ? post(iso, em) : iso;
        const plannedFlag = iso > today;
        if (master.method !== 'Dinheiro') {
          if (plannedFlag) {
            list.push({
              ...master,
              opDate: iso,
              method: em,
              postDate: pd,
              planned: true,
              recurrence: ''
            });
          } else {
            list.push({
              ...master,
              opDate: iso,
              method: em,
              postDate: pd,
              planned: false,
              recurrence: ''
            });
          }
        } else {
          list.push({
            ...master,
            opDate: iso,
            postDate: typeof post === 'function' ? post(iso, 'Dinheiro') : iso,
            planned: plannedFlag,
            recurrence: ''
          });
        }
      });
    // Stable chronological ordering by opDate and timestamp
    list.sort((a, b) => {
      const dateCmp = String(a.opDate).localeCompare(String(b.opDate));
      if (dateCmp !== 0) return dateCmp;
      return (a.ts || '').localeCompare(b.ts || '');
    });
    return list;
  }

  /**
   * Calculates the minimum and maximum ISO dates across all transactions,
   * expanding recurring entries to ensure the range covers future occurrences.
   * Ensures that the range at least spans the currently selected `VIEW_YEAR`.
   *
   * @returns {{minDate: string, maxDate: string}} Object with minDate and maxDate
   */
  function calculateDateRange() {
    const txs = typeof getTransactions === 'function' ? getTransactions() : transactions;
    if (!Array.isArray(txs) || txs.length === 0) {
      const year = resolveViewYear();
      return {
        minDate: `${year}-01-01`,
        maxDate: `${year}-12-31`
      };
    }
    let minDate = null;
    let maxDate = null;
    const allExpandedTx = [];
    txs.forEach(tx => {
      if (!tx.recurrence) {
        allExpandedTx.push({
          opDate: tx.opDate,
          postDate: tx.postDate || tx.opDate
        });
      } else {
        const startScan = new Date('2024-01-01');
        const endScan = new Date('2026-12-31');
        for (let d = new Date(startScan); d <= endScan; d.setDate(d.getDate() + 1)) {
          const isoDate = d.toISOString().slice(0, 10);
          if (typeof occursOn === 'function' ? occursOn(tx, isoDate) : false) {
            const postDate = typeof post === 'function' ? post(isoDate, tx.method || 'Dinheiro') : isoDate;
            allExpandedTx.push({ opDate: isoDate, postDate: postDate });
          }
        }
      }
    });
    allExpandedTx.forEach(tx => {
      const dates = [tx.opDate, tx.postDate].filter(Boolean);
      dates.forEach(date => {
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      });
    });
    if (!minDate || !maxDate) {
      const year = resolveViewYear();
      return {
        minDate: `${year}-01-01`,
        maxDate: `${year}-12-31`
      };
    }
    const minDateObj = new Date(minDate);
    const maxDateObj = new Date(maxDate);
    const viewYear = resolveViewYear();
    try {
      const vyStart = new Date(viewYear, 0, 1);
      const vyEnd = new Date(viewYear, 11, 31);
      if (vyStart < minDateObj) minDateObj.setTime(vyStart.getTime());
      if (vyEnd > maxDateObj) maxDateObj.setTime(vyEnd.getTime());
    } catch (_) {}
    minDateObj.setDate(1);
    maxDateObj.setMonth(11, 31);
    return {
      minDate: minDateObj.toISOString().slice(0, 10),
      maxDate: maxDateObj.toISOString().slice(0, 10)
    };
  }

  return { txByDate, calculateDateRange };
}
