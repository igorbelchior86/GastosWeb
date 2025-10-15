// Helper functions for generic modals used across the app.
// This module encapsulates the "move to today" and "confirm logout" flows,
// along with scheduling tasks after the keyboard hides on mobile, and
// flushing deferred tasks. Defining these here keeps main.js minimal.

import { updateModalOpenState } from '../utils/dom.js';

// Maintain a set of deferred tasks that will run after the virtual keyboard
// is dismissed (on iOS). This set is internal to the module.
const keyboardDeferredTasks = new Set();

/**
 * Schedules a function to run after the virtual keyboard is dismissed on iOS.
 * If the keyboard is not active the function is invoked immediately.
 * @param {Function} fn The callback to run.
 */
export function scheduleAfterKeyboard(fn) {
  if (typeof fn !== 'function') return;
  try {
    // When visualViewport.dataset.vvKb is '1', the keyboard is considered active
    if (document.documentElement?.dataset?.vvKb === '1') {
      keyboardDeferredTasks.add(fn);
      return;
    }
  } catch (_) {
    // ignore errors and fall back to immediate execution
  }
  fn();
}

/**
 * Flushes all tasks scheduled via scheduleAfterKeyboard. Should be called
 * once the keyboard has been dismissed.
 */
export function flushKeyboardDeferredTasks() {
  if (!keyboardDeferredTasks.size) return;
  const tasks = Array.from(keyboardDeferredTasks);
  keyboardDeferredTasks.clear();
  tasks.forEach(fn => {
    try { fn(); }
    catch (err) { console.error('Deferred keyboard task failed', err); }
  });
}

/**
 * Prompts the user to move a completed operation's invoice to the current day.
 * Uses a custom modal if available or falls back to window.confirm.
 * @returns {Promise<boolean>} Resolves with true if the user confirms.
 */
export function askMoveToToday() {
  const confirmMoveModal = document.getElementById('confirmMoveModal');
  const confirmMoveYes   = document.getElementById('confirmMoveYes');
  const confirmMoveNo    = document.getElementById('confirmMoveNo');
  const closeConfirmMove = document.getElementById('closeConfirmMove');

  if (!confirmMoveModal || !confirmMoveYes || !confirmMoveNo) {
    return Promise.resolve(window.confirm('Operação concluída. Gostaria de mover para hoje?'));
  }
  return new Promise(resolve => {
    const cleanup = () => {
      confirmMoveModal.classList.add('hidden');
      updateModalOpenState();
      confirmMoveYes.onclick = null;
      confirmMoveNo.onclick = null;
      if (closeConfirmMove) closeConfirmMove.onclick = null;
      confirmMoveModal.onclick = null;
    };
    confirmMoveYes.onclick = () => { cleanup(); resolve(true); };
    confirmMoveNo.onclick  = () => { cleanup(); resolve(false); };
    if (closeConfirmMove) closeConfirmMove.onclick = () => { cleanup(); resolve(false); };
    confirmMoveModal.onclick = (e) => { if (e.target === confirmMoveModal) { cleanup(); resolve(false); } };
    confirmMoveModal.classList.remove('hidden');
    updateModalOpenState();
  });
}

/**
 * Prompts the user to confirm deleting a transaction. Uses a custom modal when 
 * available or falls back to window.confirm. Returns a promise that resolves 
 * with the user's choice.
 * @param {string} transactionDesc Optional description of the transaction being deleted
 * @returns {Promise<boolean>} Resolves with true if the user confirms deletion.
 */
export function askConfirmDelete(transactionDesc = '') {
  const confirmDeleteModal = document.getElementById('confirmDeleteModal');
  const confirmDeleteYes   = document.getElementById('confirmDeleteYes');
  const confirmDeleteNo    = document.getElementById('confirmDeleteNo');
  const closeConfirmDelete = document.getElementById('closeConfirmDelete');
  const deleteMessage      = document.getElementById('deleteMessage');

  if (!confirmDeleteModal || !confirmDeleteYes || !confirmDeleteNo) {
    const msg = transactionDesc 
      ? `Deseja realmente excluir "${transactionDesc}"?`
      : 'Deseja realmente excluir esta transação?';
    return Promise.resolve(window.confirm(msg));
  }
  
  return new Promise(resolve => {
    // Update message if element exists
    if (deleteMessage && transactionDesc) {
      deleteMessage.textContent = `Deseja realmente excluir "${transactionDesc}"?`;
    } else if (deleteMessage) {
      deleteMessage.textContent = 'Deseja realmente excluir esta transação?';
    }
    
    const cleanup = () => {
      confirmDeleteModal.classList.add('hidden');
      updateModalOpenState();
      confirmDeleteYes.onclick = null;
      confirmDeleteNo.onclick = null;
      if (closeConfirmDelete) closeConfirmDelete.onclick = null;
      confirmDeleteModal.onclick = null;
    };
    
    confirmDeleteYes.onclick = () => { cleanup(); resolve(true); };
    confirmDeleteNo.onclick = () => { cleanup(); resolve(false); };
    if (closeConfirmDelete) closeConfirmDelete.onclick = () => { cleanup(); resolve(false); };
    confirmDeleteModal.onclick = (e) => { if (e.target === confirmDeleteModal) { cleanup(); resolve(false); } };
    
    confirmDeleteModal.classList.remove('hidden');
    updateModalOpenState();
  });
}

/**
 * Prompts the user to confirm logout. Uses a custom modal when available
 * or falls back to window.confirm. Returns a promise that resolves with
 * the user's choice.
 * @returns {Promise<boolean>} Resolves with true if the user confirms logout.
 */
export function askConfirmLogout() {
  const confirmLogoutModal = document.getElementById('confirmLogoutModal');
  const confirmLogoutYes   = document.getElementById('confirmLogoutYes');
  const confirmLogoutNo    = document.getElementById('confirmLogoutNo');
  const closeConfirmLogout = document.getElementById('closeConfirmLogout');

  if (!confirmLogoutModal || !confirmLogoutYes || !confirmLogoutNo) {
    return Promise.resolve(window.confirm('Deseja mesmo desconectar?'));
  }
  return new Promise(resolve => {
    const cleanup = () => {
      confirmLogoutModal.classList.add('hidden');
      updateModalOpenState();
      confirmLogoutYes.onclick = null;
      confirmLogoutNo.onclick = null;
      if (closeConfirmLogout) closeConfirmLogout.onclick = null;
      confirmLogoutModal.onclick = null;
    };
    confirmLogoutYes.onclick = () => { cleanup(); resolve(true); };
    confirmLogoutNo.onclick  = () => { cleanup(); resolve(false); };
    if (closeConfirmLogout) closeConfirmLogout.onclick = () => { cleanup(); resolve(false); };
    confirmLogoutModal.onclick = (e) => { if (e.target === confirmLogoutModal) { cleanup(); resolve(false); } };
    confirmLogoutModal.classList.remove('hidden');
    updateModalOpenState();
  });
}

/**
 * Prompts the user to confirm resetting all data. Uses a custom modal when 
 * available or falls back to window.confirm. Returns a promise that resolves 
 * with the user's choice.
 * @returns {Promise<boolean>} Resolves with true if the user confirms reset.
 */
export function askConfirmReset() {
  const confirmResetModal = document.getElementById('confirmResetModal');
  const confirmResetYes   = document.getElementById('confirmResetYes');
  const confirmResetNo    = document.getElementById('confirmResetNo');
  const closeConfirmReset = document.getElementById('closeConfirmReset');

  if (!confirmResetModal || !confirmResetYes || !confirmResetNo) {
    return Promise.resolve(window.confirm('⚠️ Esta ação apagará permanentemente todas as suas transações, cartões e configurações. Não poderá ser desfeita. Deseja continuar?'));
  }
  
  return new Promise(resolve => {
    const cleanup = () => {
      confirmResetModal.classList.add('hidden');
      updateModalOpenState();
      confirmResetYes.onclick = null;
      confirmResetNo.onclick = null;
      if (closeConfirmReset) closeConfirmReset.onclick = null;
      confirmResetModal.onclick = null;
    };
    
    confirmResetYes.onclick = () => { cleanup(); resolve(true); };
    confirmResetNo.onclick = () => { cleanup(); resolve(false); };
    if (closeConfirmReset) closeConfirmReset.onclick = () => { cleanup(); resolve(false); };
    confirmResetModal.onclick = (e) => { if (e.target === confirmResetModal) { cleanup(); resolve(false); } };
    
    confirmResetModal.classList.remove('hidden');
    updateModalOpenState();
  });
}