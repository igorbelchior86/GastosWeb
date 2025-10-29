/**
 * Transaction modal utilities.
 * This module provides helper functions for managing the transaction modal state,
 * focusing fields, and resetting modal content.
 */
import { updateModalOpenState as syncRootModalState } from '../utils/dom.js';

/**
 * Resets the transaction modal to its default state
 */
export function resetTxModal() {
  try {
    const modal = document.getElementById('txModal');
    // Get modal elements
    const val = document.getElementById('value');
    const desc = document.getElementById('desc');
    const method = document.getElementById('method');
    const installments = document.getElementById('installments');
    const invoiceParcelCheckbox = document.getElementById('invoiceParcel');
    const parcelasBlock = document.getElementById('parcelasBlock');
    const recurrence = document.getElementById('recurrence');

    // Reset form fields
    if (val) val.value = '';
    if (desc) desc.value = '';
    const date = document.getElementById('opDate');
    if (date) date.value = new Date().toISOString().split('T')[0]; // Reset to today
    if (method && method.options.length > 0) method.selectedIndex = 0;
    if (recurrence) recurrence.value = '';

    // Reset invoice parcel settings
    if (invoiceParcelCheckbox) {
      invoiceParcelCheckbox.checked = false;
    }
    if (parcelasBlock) {
      parcelasBlock.classList.add('hidden');
    }
    if (installments) {
      installments.value = '1';
    }

    // Reset any edit mode indicators
    if (modal) {
      modal.classList.remove('editing');
      modal.removeAttribute('data-editing-id');
      if (modal.dataset) delete modal.dataset.mode;
    }

    // Reset modal title
    const modalTitle = modal?.querySelector('h2');
    if (modalTitle) {
      modalTitle.textContent = 'Lançar operação';
    }
    const addBtn = document.getElementById('addBtn');
    if (addBtn) addBtn.textContent = 'Adicionar';

    // Reset value toggle to expense
    const valueToggleButtons = document.querySelectorAll('.value-toggle button');
    valueToggleButtons.forEach((btn) => btn.classList.remove('active'));
    const defaultToggle = Array.from(valueToggleButtons).find((btn) => btn.dataset?.type === 'expense');
    if (defaultToggle) defaultToggle.classList.add('active');

    // Reset method buttons to Dinheiro
    const methodButtons = document.querySelectorAll('.method-switch .switch-option');
    methodButtons.forEach((btn) => btn.classList.remove('active'));
    const cashBtn = Array.from(methodButtons).find((btn) => btn.dataset?.method === 'Dinheiro');
    if (cashBtn) cashBtn.classList.add('active');
    const methodSwitch = document.querySelector('.method-switch');
    if (methodSwitch) methodSwitch.dataset.selected = 'Dinheiro';
    if (method) method.value = 'Dinheiro';

    // Hide card selector
    const cardSelector = document.getElementById('cardSelector');
    if (cardSelector) {
      cardSelector.innerHTML = '';
      cardSelector.hidden = true;
    }
    // Ensure invoice parcel controls hidden
    const invoiceRow = document.getElementById('invoiceParcelRow');
    const invoiceCheckbox = document.getElementById('invoiceParcel');
    if (invoiceRow) invoiceRow.style.display = 'none';
    if (invoiceCheckbox) invoiceCheckbox.checked = false;
    if (parcelasBlock) parcelasBlock.classList.add('hidden');
    if (installments) installments.disabled = true;

    // Reset paid/planned toggle to default (Paga) and enable control
    try {
      const group = document.querySelector('.paid-toggle');
      if (group) {
        group.classList.remove('disabled');
        const btns = Array.from(group.querySelectorAll('.seg-option'));
        btns.forEach(b => b.classList.remove('active'));
        const paidBtn = btns.find(b => b.dataset && b.dataset.paid === '1');
        if (paidBtn) paidBtn.classList.add('active');
        group.dataset.state = 'paid';
      }
    } catch (_) {}

    // Reset modal scroll position and content layout height
    try {
      const content = modal ? modal.querySelector('.modal-content') : null;
      if (content) {
        content.scrollTop = 0;
      }
      const box = modal ? modal.querySelector('.bottom-modal-box') : null;
      if (box) {
        box.style.height = '';
        box.style.maxHeight = '';
      }
    } catch (_) {}

    // Clear budget pill/state
    try {
      const chip = document.getElementById('budgetTagChip');
      if (chip && chip.parentElement) chip.parentElement.removeChild(chip);
      if (window.__gastos) window.__gastos.pendingBudgetTag = null;
      // Inform any listeners to clear input padding adjustments
      document.dispatchEvent(new Event('txModalResetPadding'));
    } catch (_) {}

    // Clear any error states
    clearFieldErrors();

    // Reset global flags for pay-invoice mode
    // IMPORTANT: Only reset pendingEditMode if it's not currently set
    // because it may have been set by the edit recurrence modal
    try {
      const g = window.__gastos || {};
      g.isPayInvoiceMode = false;
      g.pendingInvoiceCtx = null;
      g.isEditing = null;
      
      // Only clear pending edit state if:
      // 1. pendingEditMode is not set, AND
      // 2. pendingEditTxIso is not set (indicating we're NOT in the middle of an edit flow)
      const shouldClearPendingEdit = !g.pendingEditMode && !g.pendingEditTxIso;
      
      if (shouldClearPendingEdit) {
        g.pendingEditMode = null;
        g.pendingEditTxId = null;
        g.pendingEditTxIso = null;
      }
    } catch (_) {}

  } catch (error) {
    console.warn('Error resetting transaction modal:', error);
  }
}

/**
 * Updates the modal open state and manages related UI elements
 */
export function updateModalOpenState() {
  try {
    const txModal = document.getElementById('txModal');
    const openTxBtn = document.getElementById('openTxModal') || document.getElementById('openTxBtn');
    
    if (!txModal) return;

    const isOpen = !txModal.classList.contains('hidden');
    
    // Sync modal-open class with the root element so scroll locking stays consistent.
    if (typeof syncRootModalState === 'function') {
      syncRootModalState();
    } else {
      const root = document.documentElement || document.body;
      root?.classList.toggle('modal-open', isOpen);
    }

    // Update button rotation
    if (openTxBtn) {
      openTxBtn.style.transform = isOpen ? 'rotate(45deg)' : 'rotate(0deg)';
      openTxBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    // Dispatch custom event for other components
    const event = new CustomEvent('modalStateChange', { 
      detail: { isOpen, modalType: 'transaction' }
    });
    window.dispatchEvent(event);

  } catch (error) {
    console.warn('Error updating modal open state:', error);
  }
}

/**
 * Focuses the value field in the transaction modal
 */
export function focusValueField() {
  try {
    const val = document.getElementById('value');
    if (val) {
      // Small delay to ensure modal is fully visible
      setTimeout(() => {
        val.focus();
        val.select(); // Select any existing text
      }, 100);
    }
  } catch (error) {
    console.warn('Error focusing value field:', error);
  }
}

/**
 * Sets the modal to edit mode for an existing transaction
 * @param {Object} transaction - The transaction to edit
 */
export function setEditMode(transaction) {
  try {
    if (!transaction) return;

    const modal = document.getElementById('txModal');
    const val = document.getElementById('value');
    const desc = document.getElementById('desc');
    const method = document.getElementById('method');

    // Mark modal as in edit mode
    if (modal) {
      modal.classList.add('editing');
      modal.setAttribute('data-editing-id', transaction.id);
    }

    // Update modal title
    const modalTitle = modal?.querySelector('h2');
    if (modalTitle) {
      modalTitle.textContent = 'Editar operação';
    }

    // Populate form fields
    if (val) val.value = transaction.val ? Math.abs(transaction.val).toString() : '';
    if (desc) desc.value = transaction.desc || '';
    if (method && transaction.method) {
      const option = Array.from(method.options).find(opt => opt.value === transaction.method);
      if (option) {
        method.value = transaction.method;
      }
    }

    // Handle invoice parcel data if present
    if (transaction.installments > 1) {
      const invoiceParcelCheckbox = document.getElementById('invoiceParcel');
      const installments = document.getElementById('installments');
      const parcelasBlock = document.getElementById('parcelasBlock');

      if (invoiceParcelCheckbox) {
        invoiceParcelCheckbox.checked = true;
        if (parcelasBlock) parcelasBlock.classList.remove('hidden');
        if (installments) installments.value = transaction.installments.toString();
      }
    }

  } catch (error) {
    console.warn('Error setting edit mode:', error);
  }
}

/**
 * Gets the current form data from the modal
 * @returns {Object|null} Form data object or null if invalid
 */
export function getFormData() {
  try {
    const val = document.getElementById('value');
    const desc = document.getElementById('desc');
    const method = document.getElementById('method');
    const recurrence = document.getElementById('recurrence');
    const invoiceParcelCheckbox = document.getElementById('invoiceParcel');
    const installments = document.getElementById('installments');

    if (!val || !desc || !method) return null;

    const data = {
      value: parseFloat(val.value) || 0,
      desc: desc.value.trim(),
      method: method.value,
      recurrence: recurrence?.value || ''
    };

    // Add invoice data if applicable
    if (invoiceParcelCheckbox?.checked && installments) {
      data.installments = parseInt(installments.value, 10) || 1;
    }

    return data;

  } catch (error) {
    console.warn('Error getting form data:', error);
    return null;
  }
}

/**
 * Validates the current form data
 * @returns {Object} Validation result with isValid flag and errors array
 */
export function validateForm() {
  const errors = [];
  
  try {
    const val = document.getElementById('value');
    const desc = document.getElementById('desc');
    const method = document.getElementById('method');

    // Clear previous errors
    clearFieldErrors();

    // Validate value
    if (!val?.value || parseFloat(val.value) <= 0) {
      errors.push('Valor deve ser maior que zero');
      markFieldError(val);
    }

    // Validate description
    if (!desc?.value?.trim()) {
      errors.push('Descrição é obrigatória');
      markFieldError(desc);
    }

    // Validate method selection
    if (!method?.value) {
      errors.push('Método deve ser selecionado');
      markFieldError(method);
    }

  } catch (error) {
    console.warn('Error validating form:', error);
    errors.push('Erro na validação do formulário');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Marks a field as having an error
 * @param {HTMLElement} field - The form field element
 */
function markFieldError(field) {
  if (field) {
    field.classList.add('error');
  }
}

/**
 * Clears error states from all form fields
 */
function clearFieldErrors() {
  const fields = ['value', 'desc', 'method'].map(id => document.getElementById(id));
  fields.forEach(field => {
    if (field) {
      field.classList.remove('error');
    }
  });
}
