/*
 * DOM utilities
 *
 * This module centralises a handful of common DOM manipulation helpers used
 * throughout the Gastos+ application. They are intentionally designed to
 * operate without implicit globals so they can be imported into tests or
 * other contexts without side effects.
 */

/**
 * Toggle a modal element’s visibility. When opening or closing a modal,
 * update the document root state to reflect whether any modals are open.
 *
 * @param {HTMLElement} modal element to toggle
 * @param {string} [hiddenClass='hidden'] class that controls visibility
 * @returns {boolean} true if the modal is being opened
 */
export function toggleModal(modal, hiddenClass = 'hidden') {
  if (!modal) return false;
  const isOpening = modal.classList.contains(hiddenClass);
  modal.classList.toggle(hiddenClass);
  updateModalOpenState();
  return isOpening;
}

/**
 * Show a modal by removing its hidden class and updating the modal state.
 *
 * @param {HTMLElement} modal modal element
 */
export function showModal(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  updateModalOpenState();
}

/**
 * Hide a modal by adding the hidden class and updating the modal state.
 *
 * @param {HTMLElement} modal modal element
 */
export function hideModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  updateModalOpenState();
}

/**
 * Focus a specific input element. Accepts either the element itself or a
 * selector string. Supports optional scrolling behaviour and delay.
 *
 * @param {HTMLElement|string} input element or selector to focus
 * @param {object} [options] focus options (preventScroll, selectAll, delay)
 */
export function focusInput(input, options = {}) {
  const el = typeof input === 'string' ? document.getElementById(input) || document.querySelector(input) : input;
  if (!el) return;
  const { preventScroll = true, selectAll = false, delay = 0 } = options;
  const doFocus = () => {
    try {
      el.focus({ preventScroll });
      if (selectAll && typeof el.select === 'function') {
        el.select();
      }
    } catch (err) {
      console.warn('Failed to focus input', err);
    }
  };
  if (delay > 0) {
    setTimeout(doFocus, delay);
  } else {
    requestAnimationFrame(doFocus);
  }
}

/**
 * Scroll an element into view. Accepts the element itself or a selector.
 * Uses smooth scrolling by default when supported.
 *
 * @param {HTMLElement|string} element element or selector
 * @param {object} [options] scroll options (behaviour, block, inline)
 */
export function scrollIntoView(element, options = {}) {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (!el) return;
  const { behavior = 'smooth', block = 'center', inline = 'nearest' } = options;
  try {
    el.scrollIntoView({ behavior, block, inline });
  } catch {
    // Older browsers: fallback to immediate scroll
    el.scrollIntoView();
  }
}

/**
 * Cycle or set the application theme. Without arguments, toggles between
 * 'light' and 'dark'. When a specific theme is provided, sets that value
 * directly. The chosen theme is stored on the <html> element via the
 * `data-theme` attribute.
 *
 * @param {string|null} theme optional theme ('light' or 'dark')
 * @returns {string} applied theme
 */
export function setTheme(theme = null) {
  const html = document.documentElement;
  let next = theme;
  if (theme === null) {
    const current = html.getAttribute('data-theme');
    next = current === 'light' ? 'dark' : 'light';
  }
  html.setAttribute('data-theme', next);
  return next;
}

/**
 * Add an event listener and return a cleanup function. Encapsulates the
 * removeEventListener call to aid in teardown.
 *
 * @param {HTMLElement|Document|Window} element target to listen on
 * @param {string} event event name
 * @param {function} handler callback
 * @param {object} [options] listener options
 * @returns {function} unsubscribe function
 */
export function addListener(element, event, handler, options = {}) {
  if (!element || typeof handler !== 'function') return () => {};
  element.addEventListener(event, handler, options);
  return () => {
    element.removeEventListener(event, handler, options);
  };
}

/**
 * Create a DOM element with attributes and content. Useful for building
 * complex structures in a declarative way.
 *
 * @param {string} tag tag name
 * @param {object} [attributes] attributes to set
 * @param {string|HTMLElement|Array} [content] content to insert
 * @returns {HTMLElement}
 */
export function createElement(tag, attributes = {}, content = '') {
  const el = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'style' && value && typeof value === 'object') {
      Object.assign(el.style, value);
    } else {
      el.setAttribute(key, value);
    }
  });
  if (typeof content === 'string') {
    el.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    el.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach((child) => {
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
 * Update the document's modal open state. When any element with the
 * `.bottom-modal` class is visible (i.e. not hidden), the root element
 * receives the class `modal-open`. In this state, the body is locked to
 * prevent scrolling. When no modals are visible, the lock is released.
 */
export function updateModalOpenState() {
  const root = document.documentElement || document.body;
  const hasVisibleModal = !!document.querySelector('.bottom-modal:not(.hidden)');
  root.classList.toggle('modal-open', hasVisibleModal);
  try {
    const wrapper = document.querySelector('.wrapper');
    if (!wrapper) return;
    if (hasVisibleModal) {
      if (!root.classList.contains('modal-locked')) {
        root.classList.add('modal-locked');
        wrapper.dataset.prevOverflow = wrapper.style.overflow || '';
        wrapper.dataset.prevPointerEvents = wrapper.style.pointerEvents || '';
        wrapper.style.overflow = 'hidden';
        wrapper.style.pointerEvents = 'none';
      }
    } else if (root.classList.contains('modal-locked')) {
      root.classList.remove('modal-locked');
      const prevOverflow = wrapper.dataset.prevOverflow || '';
      const prevPointer = wrapper.dataset.prevPointerEvents || '';
      if (prevPointer) {
        wrapper.style.pointerEvents = prevPointer;
      } else {
        wrapper.style.removeProperty('pointer-events');
      }
      if (prevOverflow) {
        wrapper.style.overflow = prevOverflow;
      } else {
        wrapper.style.removeProperty('overflow');
      }
      // iOS-specific scroll restoration
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        const currentScrollTop = wrapper.scrollTop;
        // Force scroll state reset for iOS Safari
        wrapper.style.overflow = 'hidden';
        wrapper.style.webkitOverflowScrolling = 'auto';
        wrapper.offsetHeight; // force reflow
        wrapper.style.overflow = 'auto';
        wrapper.style.webkitOverflowScrolling = 'touch';
        wrapper.scrollTop = currentScrollTop;
        // Trigger scroll event to refresh iOS scroll state
        setTimeout(() => {
          wrapper.dispatchEvent(new Event('scroll'));
        }, 10);
      } else {
        // Force reflow to ensure scroll is properly restored
        wrapper.offsetHeight;
      }
      try {
        delete wrapper.dataset.prevOverflow;
        delete wrapper.dataset.prevPointerEvents;
      } catch {
        wrapper.removeAttribute('data-prev-overflow');
        wrapper.removeAttribute('data-prev-pointer-events');
      }
    }
  } catch {
    // Fail silently
  }
}

/**
 * Determine if an element is visible within the viewport. Useful for
 * incremental rendering or triggering animations based on visibility.
 *
 * @param {HTMLElement|string} element element or selector
 * @returns {boolean}
 */
export function isElementVisible(element) {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom >= 0;
}
