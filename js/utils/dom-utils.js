/**
 * DOM manipulation utilities
 * Extracted from main.js as part of FASE 1 refactoring
 */

/**
 * Toggle modal visibility and handle modal open state
 * @param {HTMLElement} modal - Modal element to toggle
 * @param {string} modalClass - Optional CSS class to toggle (default: 'hidden')
 */
export function toggleModal(modal, modalClass = 'hidden') {
  if (!modal) return;
  const isOpening = modal.classList.contains(modalClass);
  modal.classList.toggle(modalClass);
  
  // Update global modal state
  // defer to centralized updater to ensure consistent body locking
  try { updateModalOpenState(); } catch (e) { if (isOpening) document.documentElement.classList.add('modal-open'); else document.documentElement.classList.remove('modal-open'); }
  
  return isOpening;
}

/**
 * Show modal by removing hidden class and setting modal-open state
 * @param {HTMLElement} modal - Modal element to show
 */
export function showModal(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  try { updateModalOpenState(); } catch (e) { document.documentElement.classList.add('modal-open'); }
}

/**
 * Hide modal by adding hidden class and removing modal-open state
 * @param {HTMLElement} modal - Modal element to hide
 */
export function hideModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  try { updateModalOpenState(); } catch (e) { document.documentElement.classList.remove('modal-open'); }
}

/**
 * Focus input field with error handling and mobile optimizations
 * @param {HTMLElement|string} input - Input element or selector
 * @param {object} options - Focus options
 */
export function focusInput(input, options = {}) {
  const inputEl = typeof input === 'string' ? document.getElementById(input) || document.querySelector(input) : input;
  if (!inputEl) return;
  
  const { preventScroll = true, selectAll = false, delay = 0 } = options;
  
  const doFocus = () => {
    try {
      inputEl.focus({ preventScroll });
      if (selectAll && typeof inputEl.select === 'function') {
        inputEl.select();
      }
    } catch (e) {
      console.warn('Focus failed:', e);
    }
  };
  
  if (delay > 0) {
    setTimeout(doFocus, delay);
  } else {
    requestAnimationFrame(doFocus);
  }
}

/**
 * Scroll element into view with smooth behavior
 * @param {HTMLElement|string} element - Element or selector to scroll to
 * @param {object} options - Scroll options
 */
export function scrollIntoView(element, options = {}) {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (!el) return;
  
  const { behavior = 'smooth', block = 'center', inline = 'nearest' } = options;
  
  try {
    el.scrollIntoView({ behavior, block, inline });
  } catch (e) {
    // Fallback for older browsers
    el.scrollIntoView();
  }
}

/**
 * Set or toggle theme attribute
 * @param {string} theme - Theme name ('light', 'dark', or null to toggle)
 */
export function setTheme(theme = null) {
  const html = document.documentElement;
  if (theme === null) {
    // Toggle current theme
    const current = html.getAttribute('data-theme');
    theme = current === 'light' ? 'dark' : 'light';
  }
  html.setAttribute('data-theme', theme);
  return theme;
}

/**
 * Add event listener with automatic cleanup
 * @param {HTMLElement} element - Element to attach listener to
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @param {object} options - Event options
 * @returns {Function} Cleanup function
 */
export function addListener(element, event, handler, options = {}) {
  if (!element || typeof handler !== 'function') return () => {};
  
  element.addEventListener(event, handler, options);
  
  return () => {
    element.removeEventListener(event, handler, options);
  };
}

/**
 * Create element with attributes and content
 * @param {string} tag - HTML tag name
 * @param {object} attributes - Element attributes
 * @param {string|HTMLElement|Array} content - Element content
 * @returns {HTMLElement} Created element
 */
export function createElement(tag, attributes = {}, content = '') {
  const el = document.createElement(tag);
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else {
      el.setAttribute(key, value);
    }
  });
  
  // Set content
  if (typeof content === 'string') {
    el.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    el.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(child => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof HTMLElement) {
        el.appendChild(child);
      }
    });
  }
  
  return el;
}

/**
 * Update global modal open state based on visible modals
 */
export function updateModalOpenState() {
  const root = document.documentElement || document.body;
  const hasVisibleModal = !!document.querySelector('.bottom-modal:not(.hidden)');
  // toggle class used by CSS
  root.classList.toggle('modal-open', hasVisibleModal);

  // Keep body fixed when a modal is open to avoid viewport/keyboard resizing jumps on mobile
  try {
    if (hasVisibleModal) {
      if (!root.classList.contains('modal-locked')) {
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
        root.classList.add('modal-locked');
        root.dataset.modalScroll = String(scrollY);
      }
    } else {
      if (root.classList.contains('modal-locked')) {
        root.classList.remove('modal-locked');
        const prev = parseInt(root.dataset.modalScroll || '0', 10) || 0;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        window.scrollTo(0, prev);
        try { delete root.dataset.modalScroll; } catch (_) { root.removeAttribute('data-modal-scroll'); }
      }
    }
  } catch (e) {
    // ignore failures
  }
}

/**
 * Check if element is visible in viewport
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} True if element is visible
 */
export function isElementVisible(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Maintain backward compatibility by exposing functions globally
if (typeof window !== 'undefined') {
  window.toggleModal = toggleModal;
  window.showModal = showModal;
  window.hideModal = hideModal;
  window.focusInput = focusInput;
  window.scrollIntoView = scrollIntoView;
  window.setTheme = setTheme;
}