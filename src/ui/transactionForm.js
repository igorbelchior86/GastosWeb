/*
 * Transaction form module
 *
 * Handles formatting of the value input, sign toggles (expense/income),
 * switching between cash and card payment methods, and dynamically
 * rendering the card selector radio inputs. All DOM references and
 * helpers are injected via the configuration object to avoid
 * dependencies on global variables.
 *
 * Usage:
 *   import { setupTransactionForm } from './ui/transactionForm.js';
 *   setupTransactionForm({
 *     valueInput: document.getElementById('value'),
 *     valueToggleButtons: document.querySelectorAll('.value-toggle button'),
 *     methodButtons: document.querySelectorAll('.switch-option'),
 *     hiddenSelect: document.getElementById('method'),
 *     cards,
 *     renderCardList: yourRenderCardListFunction,
 *     safeFmtNumber,
 *     safeFmtCurrency
 *   });
 */

export function setupTransactionForm({
  valueInput,
  valueToggleButtons,
  methodButtons,
  hiddenSelect,
  cards = [],
  safeFmtNumber,
  safeFmtCurrency,
} = {}) {
  if (!valueInput) return;
  // Ensure numeric keypad and proper formatting on mobile devices
  try {
    if (valueInput.type !== 'tel') valueInput.type = 'tel';
    valueInput.setAttribute('inputmode', 'decimal');
    valueInput.setAttribute('enterkeyhint', 'done');
    valueInput.setAttribute('pattern', '');
  } catch (_) {}

  // Helper to parse digits and apply formatting
  const formatValue = () => {
    const digits = valueInput.value.replace(/\D/g, '');
    if (!digits) {
      valueInput.value = '';
      return;
    }
    const numberValue = parseInt(digits, 10) / 100;
    const activeToggle = Array.from(valueToggleButtons).find((b) => b.classList.contains('active'));
    const signedValue = (activeToggle && activeToggle.dataset.type === 'expense') ? -numberValue : numberValue;
    // Use injected formatter helpers
    if (typeof safeFmtNumber === 'function') {
      valueInput.value = safeFmtNumber(signedValue, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } else if (typeof safeFmtCurrency === 'function') {
      valueInput.value = safeFmtCurrency(signedValue, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } else {
      valueInput.value = signedValue.toFixed(2);
    }
  };

  // Input formatting on change
  valueInput.addEventListener('input', () => {
    // Auto-select expense toggle when first digit is typed
    const digits = valueInput.value.replace(/\D/g, '');
    if (digits.length === 1) {
      valueToggleButtons.forEach((b) => b.classList.remove('active'));
      const expBtn = Array.from(valueToggleButtons).find((b) => b.dataset.type === 'expense');
      if (expBtn) expBtn.classList.add('active');
    }
    formatValue();
  });

  // Attach click handlers for the value toggles
  valueToggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      valueToggleButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      formatValue();
    });
  });

  // Helper to render card selector when cards are available
  function renderCardSelector() {
    const container = document.getElementById('cardSelector');
    if (!container) return;
    container.innerHTML = '';
    
    // Get current cards from global state instead of captured variable
    const currentCards = (window.__gastos && window.__gastos.cards) || cards || [];
    const filtered = (Array.isArray(currentCards) ? currentCards : []).filter((c) => c && c.name !== 'Dinheiro');
    
    filtered.forEach((c) => {
      const label = document.createElement('label');
      label.style.flex = '1';
      label.innerHTML = `\n        <input type="radio" name="cardChoice" value="${c.name}">\n        ${c.name}\n      `;
      container.appendChild(label);
    });
    // auto-select first card
    const first = container.querySelector('input[name="cardChoice"]');
    if (first) {
      first.checked = true;
      hiddenSelect.value = first.value;
    }
    // listen for changes
    container.querySelectorAll('input[name="cardChoice"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        hiddenSelect.value = radio.value;
      });
    });
  }

  // Expose a helper on the returned object so callers can refresh the
  // card selector manually. The internal implementation closes over
  // `cards`, `hiddenSelect` and accesses the DOM via document.getElementById.
  setupTransactionForm.renderCardSelector = () => {
    renderCardSelector();
  };

  // Click handlers for payment method buttons
  methodButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      methodButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const selectedMethod = btn.dataset.method;
      if (hiddenSelect) hiddenSelect.value = selectedMethod;
      const switchContainer = btn.closest('.method-switch');
      if (switchContainer) switchContainer.dataset.selected = selectedMethod;
      const cardSelector = document.getElementById('cardSelector');
      if (cardSelector) {
        if (selectedMethod === 'Cartão') {
          renderCardSelector();
          cardSelector.hidden = false;
        } else {
          cardSelector.innerHTML = '';
          cardSelector.hidden = true;
        }
      }
      // Reformat value to ensure sign is consistent with method change
      formatValue();
    });
  });

  // Initialise hidden select and card selector based on current active method
  const activeMethodBtn = Array.from(methodButtons).find((b) => b.classList.contains('active'));
  if (activeMethodBtn && hiddenSelect) {
    hiddenSelect.value = activeMethodBtn.dataset.method;
    const container = activeMethodBtn.closest('.method-switch');
    if (container) container.dataset.selected = activeMethodBtn.dataset.method;
    const cardSelector = document.getElementById('cardSelector');
    if (cardSelector) {
      if (activeMethodBtn.dataset.method === 'Cartão') {
        renderCardSelector();
        cardSelector.hidden = false;
      } else {
        cardSelector.hidden = true;
      }
    }
  }
  // Perform an initial formatting to normalise value
  formatValue();
}

/*
 * Render card selector helper
 *
 * When editing transactions, the main application may need to refresh the
 * list of available cards and ensure the correct radio input is present.
 * This helper duplicates the logic used internally by setupTransactionForm
 * and can be invoked directly by other modules. You must supply the
 * current list of cards and the hidden select element that stores the
 * chosen method.
 *
 * @param {object} opts configuration
 * @param {Array<{name:string}>} opts.cards array of card objects
 * @param {HTMLSelectElement|null} opts.hiddenSelect select element storing the method
 */
export function renderCardSelectorHelper({ cards = [], hiddenSelect }) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('cardSelector');
  if (!container) return;
  container.innerHTML = '';
  
  // Use provided cards or get current cards from global state
  const currentCards = (Array.isArray(cards) && cards.length > 0) 
    ? cards 
    : ((window.__gastos && window.__gastos.cards) || []);
  const filtered = (Array.isArray(currentCards) ? currentCards : []).filter((c) => c && c.name !== 'Dinheiro');
  
  filtered.forEach((c) => {
    const label = document.createElement('label');
    label.style.flex = '1';
    label.innerHTML = `\n      <input type="radio" name="cardChoice" value="${c.name}">\n      ${c.name}\n    `;
    container.appendChild(label);
  });
  const first = container.querySelector('input[name="cardChoice"]');
  if (first) {
    first.checked = true;
    if (hiddenSelect) hiddenSelect.value = first.value;
  }
  container.querySelectorAll('input[name="cardChoice"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (hiddenSelect) hiddenSelect.value = radio.value;
    });
  });
}