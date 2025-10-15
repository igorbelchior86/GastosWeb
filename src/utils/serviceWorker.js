/**
 * Registers and manages a service worker for the application. This logic
 * originally lived in main.js but has been extracted to keep that file
 * concise. The function will only perform registration when service workers
 * are supported and mock mode is disabled.
 *
 * @param {Object} options Configuration options
 * @param {boolean} options.USE_MOCK Whether the app is running in mock mode
 * @param {Function} options.flushQueue Function to flush the queue when a sync message is received
 */
export function setupServiceWorker({ USE_MOCK, flushQueue }) {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
  if (USE_MOCK) return;
  if (!('serviceWorker' in navigator)) return;
  // Helper: non-intrusive update banner
  function showUpdateBanner(onUpdateClick) {
    let banner = document.getElementById('updateBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'updateBanner';
      banner.className = 'update-banner';
      const label = document.createElement('div');
      label.textContent = 'Nova versão disponível';
      const btn = document.createElement('button');
      btn.textContent = 'Atualizar';
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Atualizando…';
        try {
          onUpdateClick && onUpdateClick();
        } catch (_) {}
      });
      banner.appendChild(label);
      banner.appendChild(btn);
      document.body.appendChild(banner);
    }
    return banner;
  }
  // Attempt registration with the root-level script first. If that fails
  // (404 in certain dev servers), try the `public/` path as a fallback.
  const tryRegister = async () => {
    try {
      return await navigator.serviceWorker.register('sw.js?v=1.4.9(b84)', { updateViaCache: 'none' });
    } catch (err) {
      // Swallow registration errors; service worker is an optional
      // enhancement and should not break app startup when unavailable.
      console.warn('Service worker registration failed:', err);
      return null;
    }
  };
  tryRegister().then((reg) => {
    if (!reg) return;
      let requestedUpdate = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!requestedUpdate) return;
        try {
          // Force hard reload to bypass cache
          window.location.href = window.location.href;
        } catch (_) {}
      });
      const promptUpdate = (postMsgTarget) => {
        const banner = showUpdateBanner(() => {
          requestedUpdate = true;
          try {
            postMsgTarget && postMsgTarget.postMessage({ type: 'SKIP_WAITING' });
          } catch (_) {}
        });
        return banner;
      };
      // If an update is already waiting, show prompt
      if (reg.waiting) {
        promptUpdate(reg.waiting);
      }
      // Detect updates while the page is open
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            // New version ready → let user choose when to update
            promptUpdate(sw);
          }
        });
      });
    });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'sync-tx' && typeof flushQueue === 'function') {
      flushQueue();
    }
  });
}