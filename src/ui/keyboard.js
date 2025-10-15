/*
 * Keyboard and scroll behaviour helpers
 *
 * On iOS devices the virtual keyboard can cause layout issues by
 * resizing the viewport and leaving blank space below the page. This
 * module centralises the logic for detecting when modals are open,
 * preventing background scroll while a modal is active, and applying
 * workarounds for keyboard offsets. To use, import
 * `initKeyboardAndScrollHandlers` and invoke it once on page load.
 */

export function initKeyboardAndScrollHandlers() {
  // Determine whether any modal is currently open. A modal is
  // considered open if a `.bottom-modal` element exists without the
  // `hidden` class. This selector mirrors the usage in the original
  // implementation.
  function anyModalOpen() {
    return !!document.querySelector('.bottom-modal:not(.hidden)');
  }

  // Check if an element is inside a scrollable region within a modal.
  // If so, scroll events should propagate naturally within the modal
  // content rather than being blocked at the page level. This helper
  // examines ancestors up to the modal content container.
  function isInScrollableModal(el) {
    const content = el && el.closest ? el.closest('.bottom-modal .modal-content') : null;
    if (!content) return false;
    let node = el;
    while (node && node !== content.parentElement) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) {
        return true;
      }
      node = node.parentElement;
    }
    // fallback: treat .modal-content as scrollable if it overflows
    return content && content.scrollHeight > content.clientHeight;
  }

  // Track whether a modal was previously open to detect when one
  // closes. This is used to trigger a scroll state reset on iOS.
  let lastModalState = false;

  // When modals are closed on iOS Safari, the page can get stuck in
  // a weird scroll state. This function resets the scroll container
  // after a modal closes by toggling overflow styles.
  function resetScrollStateIfNeeded() {
    const currentModalState = anyModalOpen();
    if (lastModalState && !currentModalState) {
      // Modal was just closed - force scroll cleanup for Safari iOS
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        setTimeout(() => {
          const wrapper = document.querySelector('.wrapper');
          if (wrapper) {
            const currentScrollTop = wrapper.scrollTop;
            // Force scroll container reset for iOS
            wrapper.style.overflow = 'hidden';
            wrapper.style.webkitOverflowScrolling = 'auto';
            wrapper.offsetHeight; // force reflow
            wrapper.style.overflow = 'auto';
            wrapper.style.webkitOverflowScrolling = 'touch';
            wrapper.scrollTop = currentScrollTop;
            // Additional iOS fix: trigger scroll event to refresh internal state
            wrapper.dispatchEvent(new Event('scroll'));
          }
        }, 100);
      }
    }
    lastModalState = currentModalState;
  }

  // Prevent background scrolling when a modal is open. Allow
  // scrolling inside modal content if the target is within a scrollable
  // container. Also reset scroll state as modals open/close.
  document.addEventListener('touchmove', (e) => {
    resetScrollStateIfNeeded();
    if (!anyModalOpen()) return;
    const target = e.target;
    if (isInScrollableModal(target)) return;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('wheel', (e) => {
    resetScrollStateIfNeeded();
    if (!anyModalOpen()) return;
    const target = e.target;
    if (isInScrollableModal(target)) return;
    e.preventDefault();
  }, { passive: false });

  // Additional iOS scroll fix - listen for modal state changes
  const modalObserver = new MutationObserver(() => {
    resetScrollStateIfNeeded();
  });
  
  // Watch for class changes on bottom-modal elements
  document.querySelectorAll('.bottom-modal').forEach(modal => {
    modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });

  // iOS 16/17 keyboard offset fix. When the virtual keyboard
  // appears, the viewport shrinks and can leave large blank areas
  // beneath the page content. This routine tracks keyboard height
  // changes and applies CSS custom properties that can be used to
  // adjust UI positioning. It also disables keyboard transforms
  // entirely when a modal is open so that modals remain centered.
  (function setupKbOffsets() {
    const root = document.documentElement;
    if (!root) return;
    // Provide no‑ops for lock/unlock functions if not defined
    if (typeof window.__lockKeyboardGap !== 'function') window.__lockKeyboardGap = () => {};
    if (typeof window.__unlockKeyboardGap !== 'function') window.__unlockKeyboardGap = () => {};
    const vv = window.visualViewport;
    if (!vv) return;
    const THRESH = 140; // px
    const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    let keyboardOpen = false;
    let closeTimer = null;
    let lastGap = 0;
    let lastTopOffset = 0;
    let lastPageTop = 0;
    let lockedGap = null;
    let lockedTopOffset = null;
    let lockedPageTop = null;
    const applyKeyboardOpen = (gap) => {
      keyboardOpen = true;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      const measured = Math.max(0, Math.round(gap || 0));
      const rawOffsetTop = Math.max(0, Math.round(vv?.offsetTop || 0));
      const rawPageTop = Math.max(0, Math.round(
        typeof vv?.pageTop === 'number'
          ? vv.pageTop
          : (window.scrollY ?? window.pageYOffset ?? document.documentElement?.scrollTop ?? 0)
      ));
      lastGap = measured;
      lastTopOffset = rawOffsetTop;
      lastPageTop = rawPageTop;
      const hasModalOpen = anyModalOpen();
      if (root) {
        root.dataset.vvKb = '1';
        root.classList.add('keyboard-open');
        root.dataset.kbGap = String(measured);
        root.dataset.kbTop = String(rawOffsetTop);
        root.dataset.kbPage = String(rawPageTop);
        if (!hasModalOpen) {
          const effective = lockedGap != null ? Math.min(lockedGap, measured) : measured;
          const baselineOffset = lockedTopOffset != null ? lockedTopOffset : rawOffsetTop;
          const baselinePage = lockedPageTop != null ? lockedPageTop : rawPageTop;
          const diffOffset = Math.max(0, rawOffsetTop - baselineOffset);
          const diffPage = Math.max(0, rawPageTop - baselinePage);
          const shift = Math.max(diffOffset, diffPage);
          root.style.setProperty('--kb-offset-bottom', effective + 'px');
          root.style.setProperty('--kb-offset-top', shift + 'px');
        } else {
          root.style.setProperty('--kb-offset-bottom', '0px');
          root.style.setProperty('--kb-offset-top', '0px');
        }
      }
    };
    const applyKeyboardClosed = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        keyboardOpen = false;
        lockedGap = null;
        lockedTopOffset = null;
        lockedPageTop = null;
        lastGap = 0;
        lastTopOffset = 0;
        lastPageTop = 0;
        if (root) {
          delete root.dataset.vvKb;
          root.classList.remove('keyboard-open');
          root.style.removeProperty('--kb-offset-bottom');
          root.style.removeProperty('--kb-offset-top');
          delete root.dataset.kbGap;
          delete root.dataset.kbTop;
          delete root.dataset.kbPage;
          delete root.dataset.kbLock;
          delete root.dataset.kbLockTop;
          delete root.dataset.kbLockPage;
        }
        // flush any deferred tasks that were waiting for the keyboard to close
        if (typeof window.flushKeyboardDeferredTasks === 'function') {
          window.flushKeyboardDeferredTasks();
        }
      }, 200);
    };
    const onResize = () => {
      if (!IS_IOS) return;
      const vhDiff = window.innerHeight - vv.height;
      const gap = Math.max(0, vhDiff);
      if (gap > THRESH) {
        applyKeyboardOpen(gap);
      } else {
        if (keyboardOpen) {
          applyKeyboardClosed();
        }
      }
    };
    vv.addEventListener('resize', onResize);
    // Provide a way to lock the keyboard gap and top offset. This is
    // used by certain flows to hold the keyboard space while performing
    // animations.
    window.__lockKeyboardGap = (lockGap, lockTop, lockPage) => {
      lockedGap = lockGap;
      lockedTopOffset = lockTop;
      lockedPageTop = lockPage;
    };
    window.__unlockKeyboardGap = () => {
      lockedGap = null;
      lockedTopOffset = null;
      lockedPageTop = null;
    };
  })();
}