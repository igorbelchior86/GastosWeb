/*
 * Monthly Cache System
 *
 * Implements granular caching by month for efficient transaction management.
 * This system reduces Firebase reads and enables delta updates for better performance.
 */

import { cacheGet, cacheSet } from './cache.js';

/**
 * Monthly cache key generator
 * @param {number} year - Year (e.g., 2025)
 * @param {number} month - Month 0-11 (e.g., 9 for October)
 * @returns {string} Cache key for the month
 */
function monthKey(year, month) {
  return `month_${year}_${String(month).padStart(2, '0')}`;
}

/**
 * Get transactions for a specific month from cache
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @returns {Array} Cached transactions for the month
 */
export function getMonthCache(year, month) {
  const key = monthKey(year, month);
  return cacheGet(key, []);
}

/**
 * Set transactions for a specific month in cache
 * @param {number} year - Year
 * @param {number} month - Month (0-11)  
 * @param {Array} transactions - Transactions for the month
 * @param {string} lastSync - ISO timestamp of last sync
 */
export function setMonthCache(year, month, transactions, lastSync = new Date().toISOString()) {
  const key = monthKey(year, month);
  const monthData = {
    transactions,
    lastSync,
    version: 1
  };
  cacheSet(key, monthData);
}

/**
 * Get last sync timestamp for a month
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @returns {string|null} ISO timestamp or null if never synced
 */
export function getMonthLastSync(year, month) {
  const key = monthKey(year, month);
  const data = cacheGet(key, null);
  return data ? data.lastSync : null;
}

/**
 * Check if month needs refresh (older than threshold)
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {number} maxAgeMs - Max age in milliseconds (default: 5 minutes)
 * @returns {boolean} True if needs refresh
 */
export function isMonthStale(year, month, maxAgeMs = 5 * 60 * 1000) {
  const lastSync = getMonthLastSync(year, month);
  if (!lastSync) return true;
  
  const age = Date.now() - new Date(lastSync).getTime();
  return age > maxAgeMs;
}

/**
 * Get current month key
 * @returns {Object} Current year and month
 */
export function getCurrentMonth() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth()
  };
}

/**
 * Filter transactions by month
 * @param {Array} transactions - All transactions
 * @param {number} year - Target year
 * @param {number} month - Target month (0-11)
 * @returns {Array} Transactions for the specific month
 */
export function filterByMonth(transactions, year, month) {
  if (!Array.isArray(transactions)) return [];
  
  return transactions.filter(tx => {
    if (!tx.opDate && !tx.postDate) return false;
    
    const date = new Date(tx.postDate || tx.opDate);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

/**
 * Invalidate all month caches (useful for major data changes)
 */
export function clearAllMonthCaches() {
  const keys = [];
  
  // Get all cache keys that match month pattern
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('month_')) {
        keys.push(key);
      }
    }
    
    // Remove all month cache entries
    keys.forEach(key => {
      localStorage.removeItem(key);
    });
    
    console.log(`Cleared ${keys.length} month caches`);
  } catch (error) {
    console.warn('Failed to clear month caches:', error);
  }
}

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  const stats = {
    monthsCached: 0,
    totalTransactions: 0,
    totalSize: 0,
    oldestCache: null,
    newestCache: null
  };
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('month_')) {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (data.transactions) {
          stats.monthsCached++;
          stats.totalTransactions += data.transactions.length;
          stats.totalSize += JSON.stringify(data).length;
          
          if (data.lastSync) {
            const syncDate = new Date(data.lastSync);
            if (!stats.oldestCache || syncDate < new Date(stats.oldestCache)) {
              stats.oldestCache = data.lastSync;
            }
            if (!stats.newestCache || syncDate > new Date(stats.newestCache)) {
              stats.newestCache = data.lastSync;
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to calculate cache stats:', error);
  }
  
  return stats;
}