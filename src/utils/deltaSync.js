/*
 * Delta Sync System
 *
 * Implements incremental synchronization with Firebase, downloading only
 * changes since last sync timestamp. This dramatically reduces data transfer
 * and processing time for large transaction sets.
 */

import { getMonthCache, setMonthCache, getMonthLastSync, getCurrentMonth, filterByMonth } from './monthlyCache.js';

/**
 * Delta sync for a specific month
 * @param {Object} firebase - Firebase references
 * @param {number} year - Target year
 * @param {number} month - Target month (0-11)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} Updated transactions for the month
 */
export async function syncMonth(firebase, year, month, onProgress) {
  const { firebaseDb, ref, get, onValue } = firebase;
  const PATH = firebase.PATH || window.PATH;
  
  if (!firebaseDb || !PATH) {
    console.warn('Firebase not available for delta sync');
    return getMonthCache(year, month);
  }
  
  try {
    onProgress?.({ type: 'start', year, month });
    
    const lastSync = getMonthLastSync(year, month);
    const cachedTransactions = getMonthCache(year, month);
    
    // If never synced or very old cache, do full sync
    const isFirstSync = !lastSync;
    const cacheAge = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;
    const shouldFullSync = isFirstSync || cacheAge > (24 * 60 * 60 * 1000); // 24 hours
    
    if (shouldFullSync) {
      onProgress?.({ type: 'fullSync', year, month });
      return await fullSyncMonth(firebase, year, month, onProgress);
    }
    
    // Delta sync - only get changes since lastSync
    onProgress?.({ type: 'deltaSync', year, month, since: lastSync });
    
    const txRef = ref(firebaseDb, `${PATH}/tx`);
    const snapshot = await get(txRef);
    
    if (!snapshot.exists()) {
      onProgress?.({ type: 'complete', year, month, count: 0 });
      return cachedTransactions;
    }
    
    const allTransactions = Object.values(snapshot.val() || {});
    const monthTransactions = filterByMonth(allTransactions, year, month);
    
    // Filter for transactions modified since lastSync
    const lastSyncTime = new Date(lastSync).getTime();
    const deltaTransactions = monthTransactions.filter(tx => {
      const txTime = new Date(tx.ts || tx.opDate).getTime();
      return txTime > lastSyncTime;
    });
    
    if (deltaTransactions.length === 0) {
      onProgress?.({ type: 'complete', year, month, count: 0, cached: true });
      return cachedTransactions;
    }
    
    // Merge delta with cached data
    const mergedTransactions = mergeDelta(cachedTransactions, deltaTransactions);
    
    // Update cache
    setMonthCache(year, month, mergedTransactions);
    
    onProgress?.({ type: 'complete', year, month, count: deltaTransactions.length, merged: true });
    return mergedTransactions;
    
  } catch (error) {
    console.error(`Delta sync failed for ${year}-${month}:`, error);
    onProgress?.({ type: 'error', year, month, error });
    
    // Fallback to cached data
    return getMonthCache(year, month);
  }
}

/**
 * Full sync for a month (first time or cache rebuild)
 */
async function fullSyncMonth(firebase, year, month, onProgress) {
  const { firebaseDb, ref, get } = firebase;
  const PATH = firebase.PATH || window.PATH;
  
  onProgress?.({ type: 'downloading', year, month });
  
  const txRef = ref(firebaseDb, `${PATH}/tx`);
  const snapshot = await get(txRef);
  
  if (!snapshot.exists()) {
    setMonthCache(year, month, []);
    return [];
  }
  
  const allTransactions = Object.values(snapshot.val() || {});
  const monthTransactions = filterByMonth(allTransactions, year, month);
  
  setMonthCache(year, month, monthTransactions);
  
  onProgress?.({ type: 'complete', year, month, count: monthTransactions.length, full: true });
  return monthTransactions;
}

/**
 * Merge delta transactions with cached data
 * @param {Array} cached - Existing cached transactions
 * @param {Array} delta - New/updated transactions
 * @returns {Array} Merged transaction list
 */
function mergeDelta(cached, delta) {
  if (!Array.isArray(cached)) cached = [];
  if (!Array.isArray(delta)) return cached;
  
  // Create a map of existing transactions by ID for fast lookup
  const cachedMap = new Map();
  cached.forEach(tx => {
    if (tx.id) cachedMap.set(tx.id, tx);
  });
  
  // Apply delta changes
  delta.forEach(tx => {
    if (tx.id) {
      cachedMap.set(tx.id, tx); // Upsert (update or insert)
    }
  });
  
  // Convert back to array and sort by date
  const merged = Array.from(cachedMap.values());
  merged.sort((a, b) => {
    const dateA = new Date(a.opDate || a.ts).getTime();
    const dateB = new Date(b.opDate || b.ts).getTime();
    return dateB - dateA; // Newest first
  });
  
  return merged;
}

/**
 * Sync current month with priority (always fresh)
 * @param {Object} firebase - Firebase references
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} Current month transactions
 */
export async function syncCurrentMonth(firebase, onProgress) {
  const { year, month } = getCurrentMonth();
  
  // Current month always gets fresh data to ensure accuracy
  onProgress?.({ type: 'priority', year, month });
  
  return await fullSyncMonth(firebase, year, month, onProgress);
}

/**
 * Batch sync multiple months efficiently
 * @param {Object} firebase - Firebase references  
 * @param {Array} months - Array of {year, month} objects
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Map of month keys to transactions
 */
export async function batchSyncMonths(firebase, months, onProgress) {
  const results = {};
  
  onProgress?.({ type: 'batchStart', count: months.length });
  
  // Sync current month first (priority)
  const current = getCurrentMonth();
  const currentKey = `${current.year}-${current.month}`;
  results[currentKey] = await syncCurrentMonth(firebase, onProgress);
  
  // Sync other months in parallel (with concurrency limit)
  const otherMonths = months.filter(m => 
    !(m.year === current.year && m.month === current.month)
  );
  
  const BATCH_SIZE = 3; // Limit concurrent Firebase requests
  for (let i = 0; i < otherMonths.length; i += BATCH_SIZE) {
    const batch = otherMonths.slice(i, i + BATCH_SIZE);
    
    await Promise.all(
      batch.map(async ({ year, month }) => {
        const key = `${year}-${month}`;
        results[key] = await syncMonth(firebase, year, month, onProgress);
      })
    );
  }
  
  onProgress?.({ type: 'batchComplete', results });
  return results;
}

/**
 * Smart sync - automatically determine what months to sync based on view
 * @param {Object} firebase - Firebase references
 * @param {number} viewYear - Currently viewed year  
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} All relevant transactions
 */
export async function smartSync(firebase, viewYear, onProgress) {
  const current = getCurrentMonth();
  const monthsToSync = [];
  
  // Always sync current month
  monthsToSync.push(current);
  
  // Add viewed year months if different from current year
  if (viewYear !== current.year) {
    for (let month = 0; month < 12; month++) {
      monthsToSync.push({ year: viewYear, month });
    }
  } else {
    // Same year: sync relevant months around current
    const startMonth = Math.max(0, current.month - 2);
    const endMonth = Math.min(11, current.month + 2);
    
    for (let month = startMonth; month <= endMonth; month++) {
      if (month !== current.month) { // Current already added
        monthsToSync.push({ year: viewYear, month });
      }
    }
  }
  
  const results = await batchSyncMonths(firebase, monthsToSync, onProgress);
  
  // Combine all transactions
  const allTransactions = [];
  Object.values(results).forEach(monthTxs => {
    if (Array.isArray(monthTxs)) {
      allTransactions.push(...monthTxs);
    }
  });
  
  return allTransactions;
}