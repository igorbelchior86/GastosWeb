/**
 * iOS PWA debug helper extracted from main.js.
 * When running in an iOS Progressive Web App context, this function logs
 * useful diagnostics to the console to aid troubleshooting. It logs
 * viewport metrics, safe area insets, viewport unit support, auth state
 * changes and network status. This helper is no‑op on non‑iOS devices.
 *
 * Set DEBUG_IOS to true to enable debug logging.
 *
 * @param {object} firebaseConfig Firebase configuration, used only to
 *   report whether the config loaded successfully.
 */

// Enable/disable iOS debug logging
const DEBUG_IOS = false;

export function initIOSDebug(firebaseConfig) {
  if (!DEBUG_IOS) return; // Skip debug logging when disabled
  
  try {
    const ua = (navigator.userAgent || '').toLowerCase();
    const isIOSDebug = /iphone|ipad|ipod/.test(ua);
    const standaloneDebug =
      (window.matchMedia &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      ('standalone' in navigator && navigator.standalone);
    if (!isIOSDebug || !standaloneDebug) return;

    console.log('🔧 iOS PWA Debug Info:');
    console.log('- User Agent:', navigator.userAgent);
    console.log(
      '- Display Mode:',
      window.matchMedia ? window.matchMedia('(display-mode: standalone)').matches : 'unknown'
    );
    console.log('- Navigator Standalone:', navigator.standalone);
    console.log('- Firebase Config:', firebaseConfig ? 'loaded' : 'missing');
    console.log('- Auth State:', window.Auth ? 'initialized' : 'pending');

    // Viewport diagnostics for iOS 26+
    console.log('📱 iOS 26 Viewport Info:');
    console.log('- window.innerHeight:', window.innerHeight);
    console.log('- window.outerHeight:', window.outerHeight);
    console.log('- screen.height:', screen.height);
    if (window.visualViewport) {
      console.log('- visualViewport:', {
        height: window.visualViewport.height,
        width: window.visualViewport.width,
        offsetTop: window.visualViewport.offsetTop
      });
    } else {
      console.log('- visualViewport:', 'not supported');
    }

    // Safe area insets support check
    const testDiv = document.createElement('div');
    testDiv.style.cssText =
      'position: fixed; top: env(safe-area-inset-top); left: env(safe-area-inset-left); visibility: hidden;';
    document.body.appendChild(testDiv);
    const computedStyle = getComputedStyle(testDiv);
    console.log('- Safe area insets:', {
      top: computedStyle.top,
      left: computedStyle.left,
      supported: computedStyle.top !== 'env(safe-area-inset-top)'
    });
    document.body.removeChild(testDiv);

    // Check viewport unit support
    const viewportSupport = {
      vh: CSS.supports('height', '100vh'),
      svh: CSS.supports('height', '100svh'),
      dvh: CSS.supports('height', '100dvh'),
      lvh: CSS.supports('height', '100lvh')
    };
    console.log('- Viewport units support:', viewportSupport);

    // Log auth state changes
    document.addEventListener('auth:state', (e) => {
      const user = e.detail && e.detail.user;
      console.log(
        '🔧 iOS PWA Auth State:',
        user
          ? {
              email: user.email,
              uid: user.uid,
              emailVerified: user.emailVerified
            }
          : 'signed out'
      );
    });

    // Monitor network status
    const logNetworkStatus = () => {
      console.log('🔧 iOS PWA Network:', navigator.onLine ? 'online' : 'offline');
    };
    logNetworkStatus();
    window.addEventListener('online', logNetworkStatus);
    window.addEventListener('offline', logNetworkStatus);
  } catch (_) {
    // Silently ignore any errors; this is purely a debug helper.
  }
}