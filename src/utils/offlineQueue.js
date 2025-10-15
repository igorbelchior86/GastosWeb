/**
 * Offline queue functionality for handling operations when the app is offline.
 * This module manages a queue of operations that need to be synced when the app
 * comes back online, providing resilience against network interruptions.
 */

/**
 * Initializes the offline queue system.
 * @param {Object} config - Configuration object
 * @param {Function} config.cacheGet - Function to get data from cache
 * @param {Function} config.cacheSet - Function to set data in cache
 * @param {Function} config.save - Function to save transactions
 * @param {Object} config.state - Application state object
 * @param {Function} config.getTransactions - Function to get transactions
 * @param {Function} config.setTransactions - Function to set transactions
 * @returns {Object} API object with queue management functions
 */
export function initOfflineQueue(config) {
  const {
    cacheGet,
    cacheSet,
    save,
    state,
    getTransactions,
    setTransactions
  } = config;

  // Queue for offline operations
  let offlineQueue = [];
  let isProcessing = false;

  /**
   * Adds an operation to the offline queue
   * @param {Object} operation - The operation to queue
   */
  function addToQueue(operation) {
    offlineQueue.push({
      ...operation,
      timestamp: Date.now(),
      id: generateOperationId()
    });
    saveQueueToStorage();
  }

  /**
   * Processes all queued operations
   */
  async function processQueue() {
    if (isProcessing || offlineQueue.length === 0) return;
    
    isProcessing = true;
    
    try {
      const operations = [...offlineQueue];
      offlineQueue = [];
      
      for (const operation of operations) {
        try {
          await executeOperation(operation);
        } catch (error) {
          console.warn('Failed to execute queued operation:', error);
          // Re-add failed operation to queue
          offlineQueue.push(operation);
        }
      }
      
      saveQueueToStorage();
    } finally {
      isProcessing = false;
    }
  }

  /**
   * Executes a single queued operation
   * @param {Object} operation - The operation to execute
   */
  async function executeOperation(operation) {
    switch (operation.type) {
      case 'save_transaction':
        await save(operation.data);
        break;
      case 'update_transactions':
        if (setTransactions && operation.transactions) {
          setTransactions(operation.transactions);
        }
        break;
      default:
        console.warn('Unknown operation type:', operation.type);
    }
  }

  /**
   * Saves the current queue to local storage
   */
  function saveQueueToStorage() {
    try {
      localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    } catch (error) {
      console.warn('Failed to save offline queue to storage:', error);
    }
  }

  /**
   * Loads the queue from local storage
   */
  function loadQueueFromStorage() {
    try {
      const stored = localStorage.getItem('offlineQueue');
      if (stored) {
        offlineQueue = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load offline queue from storage:', error);
      offlineQueue = [];
    }
  }

  /**
   * Generates a unique ID for operations
   */
  function generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Checks if the app is online
   */
  function isOnline() {
    return navigator.onLine !== false;
  }

  // Initialize queue from storage
  loadQueueFromStorage();

  // Set up online/offline event listeners
  if (typeof window !== 'undefined') {
    window.addEventListener('online', processQueue);
    window.addEventListener('offline', () => {
      // Operations will be queued when offline
    });
  }

  // Return API
  return {
    addToQueue,
    processQueue,
    isOnline,
    getQueueSize: () => offlineQueue.length,
    clearQueue: () => {
      offlineQueue = [];
      saveQueueToStorage();
    }
  };
}