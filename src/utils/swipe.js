/**
 * Provides a helper to initialize swipe gestures on list items. This logic
 * was originally embedded in main.js but has been moved out to reduce
 * complexity. It attaches touch listeners to a root element and handles
 * horizontal swiping to reveal action buttons. The function will only
 * register its listeners once per `onceFlag` to avoid duplicate setup.
 *
 * @param {HTMLElement} root The root element to listen on (e.g. document.body)
 * @param {string} wrapperSel Selector for the wrapper element surrounding each line
 * @param {string} actionsSel Selector for the container of action buttons
 * @param {string} lineSel Selector for the line element that moves horizontally
 * @param {string} onceFlag Global property name used to prevent duplicate setup
 */
export function initSwipe(root, wrapperSel, actionsSel, lineSel, onceFlag) {
  // Guard against double initialization. The onceFlag should be a unique
  // property on the global window object. If it's already truthy the
  // listeners have been attached previously.
  if (typeof window !== 'undefined' && window[onceFlag]) return;
  let startX = 0;
  const DRAG_ACTIVATE_PX = 6; // threshold to consider a swipe gesture
  root.addEventListener(
    'touchstart',
    (e) => {
      const wrap = e.target.closest(wrapperSel);
      if (!wrap) return;
      // Limit swipe start to interactions on the line element only
      const lineHit = e.target.closest(lineSel);
      if (!lineHit) return;
      startX = e.touches[0].clientX;
      wrap.dataset.startX = startX;
      wrap.dataset.swiping = '0';
      const line = wrap.querySelector(lineSel);
      // Use CSSMatrix to compute any current translation on the line
      const m = new WebKitCSSMatrix(getComputedStyle(line).transform);
      wrap.dataset.offset = m.m41 || 0;
    },
    { passive: true }
  );
  root.addEventListener(
    'touchmove',
    (e) => {
      const wrap = e.target.closest(wrapperSel);
      if (!wrap) return;
      if (!e.target.closest(lineSel)) return;
      const start = parseFloat(wrap.dataset.startX || 0);
      const offset = parseFloat(wrap.dataset.offset || 0);
      const diff = start - e.touches[0].clientX;
      const line = wrap.querySelector(lineSel);
      // Prefer external, targeted actions (e.g., invoice header pay button), then fallback to local
      let actions =
        document.querySelector(`${actionsSel}[data-for="${wrap.dataset.swipeId}"]`) ||
        wrap.querySelector(actionsSel);
      const actW = actions.offsetWidth || 96; // fallback width
      line.style.transition = 'none';
      let newTx = offset - diff;
      newTx = Math.max(Math.min(newTx, 0), -actW);
      line.style.transform = `translateX(${newTx}px)`;
      const op = Math.abs(newTx) / actW;
      actions.style.opacity = op;
      actions.style.pointerEvents = op > 0.05 ? 'auto' : 'none';
      // Mark as swiping to avoid toggling <details>
      if (Math.abs(diff) >= DRAG_ACTIVATE_PX) wrap.dataset.swiping = '1';
    },
    { passive: true }
  );
  root.addEventListener(
    'touchend',
    (e) => {
      const wrap = e.target.closest(wrapperSel);
      if (!wrap) return;
      if (!e.target.closest(lineSel)) return;
      const start = parseFloat(wrap.dataset.startX || 0);
      const offset = parseFloat(wrap.dataset.offset || 0);
      const diff = start - e.changedTouches[0].clientX;
      const line = wrap.querySelector(lineSel);
      // Prefer external, targeted actions (e.g., invoice header pay button), then fallback to local
      let actions =
        document.querySelector(`${actionsSel}[data-for="${wrap.dataset.swipeId}"]`) ||
        wrap.querySelector(actionsSel);
      const actW = actions.offsetWidth || 96;
      let finalTx = offset - diff;
      const shouldOpen = Math.abs(finalTx) > actW / 2;
      finalTx = shouldOpen ? -actW : 0;
      line.style.transition = '';
      line.style.transform = `translateX(${finalTx}px)`;
      actions.style.opacity = shouldOpen ? 1 : 0;
      actions.style.pointerEvents = shouldOpen ? 'auto' : 'none';
      // Provide haptic feedback on supporting devices
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(30);
      }
      // collapse others
      document.querySelectorAll(lineSel).forEach((l) => {
        if (l !== line) {
          l.style.transform = 'translateX(0)';
        }
      });
      document.querySelectorAll(actionsSel).forEach((a) => {
        if (a !== actions) {
          a.style.opacity = 0;
          a.style.pointerEvents = 'none';
        }
      });
      // Allow clicks again shortly after swipe ends
      setTimeout(() => {
        if (wrap) wrap.dataset.swiping = '0';
      }, 80);
    },
    { passive: true }
  );
  if (typeof window !== 'undefined') {
    window[onceFlag] = true;
  }
}