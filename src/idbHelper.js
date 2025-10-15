// idbHelper.js
//
// The IndexedDB cache setup previously lived inline in main.js. Moving
// this code into its own module reduces the size of the entrypoint and
// encapsulates the logic behind a simple async helper. Consumers call
// setupIdbCache() to initialise the cache and receive accessors.

import { openDB } from 'https://unpkg.com/idb?module';

/**
 * Initialise the IndexedDB cache used for offline persistence.
 *
 * This helper opens (and upgrades) the 'gastos-cache' database, then
 * returns async functions for getting/setting/removing keys. It also
 * attaches these functions to window.APP_CACHE_BACKING when running
 * in a browser context.
 *
 * @returns {Promise<{idbGet: Function, idbSet: Function, idbRemove: Function}>}
 */
export async function setupIdbCache() {
  const cacheDB = await openDB('gastos-cache', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    }
  });
  async function idbGet(k) { try { return await cacheDB.get('kv', k); } catch { return undefined; } }
  async function idbSet(k, v) { try { await cacheDB.put('kv', v, k); } catch {} }
  async function idbRemove(k) { try { await cacheDB.delete('kv', k); } catch {} }
  if (typeof window !== 'undefined') {
    window.APP_CACHE_BACKING = { idbGet, idbSet, idbRemove };
  }
  return { idbGet, idbSet, idbRemove };
}