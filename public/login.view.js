// login.view.js – Fullscreen login overlay with shimmer logo + Google button

const ID = 'loginOverlay';

function ensureOverlay() {
  let el = document.getElementById(ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = ID;
  el.className = 'login-overlay hidden';
  el.innerHTML = `
    <div class="login-box">
      <div class="login-center">
        <h1 class="login-logo shimmer">Gastos <span>+</span></h1>
        <p class="login-tag shimmer">Finança simplificada</p>
      </div>
      <div class="login-actions">
        <button id="googleBtn" class="login-google" aria-label="Continuar com Google">
          <span class="g-badge" aria-hidden>G</span>
          <span>Continuar com Google</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  const btn = el.querySelector('#googleBtn');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true;
    
    // iOS PWA specific handling
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ('standalone' in navigator && navigator.standalone);
    
    if (isIOS && standalone) {
      btn.innerHTML = `
        <span class="g-badge" aria-hidden>⟳</span>
        <span>Autenticando...</span>
      `;
    }
    
    try { 
      await window.Auth?.signInWithGoogle(); 
      
      // For iOS PWA, button will be re-enabled by auth state change
      if (!(isIOS && standalone)) {
        btn.disabled = false;
      }
    }
    catch (e) {
      btn.disabled = false;
      btn.innerHTML = `
        <span class="g-badge" aria-hidden>G</span>
        <span>Continuar com Google</span>
      `;
      console.error('Login error:', e);
      
      // Show inline error
      const msg = (e && e.code) ? e.code.replace('auth/','Auth: ') : 'Falha no login';
      showError(el, msg);
    }
  });
  return el;
}

function show() {
  const el = ensureOverlay();
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('visible'));
}

function hide() {
  const el = document.getElementById(ID);
  if (!el) return;
  el.classList.remove('visible');
  setTimeout(() => el.classList.add('hidden'), 180);
}

// Check if user was previously authenticated
function hasPreviousAuth() {
  try {
    // Check Firebase Auth persistence keys that indicate previous successful login
    const keys = Object.keys(localStorage);
    const hasFirebaseAuth = keys.some(key => 
      key.startsWith('firebase:authUser:') || 
      key.includes('firebase:host:')
    );
    
    // Also check IndexedDB-based persistence (for non-iOS PWA)
    const hasIndexedDBAuth = keys.some(key => 
      key.startsWith('firebaseLocalStorageDb#') ||
      key.includes('firebase-heartbeat')
    );
    
    return hasFirebaseAuth || hasIndexedDBAuth;
  } catch (e) {
    console.warn('LoginView: Error checking previous auth:', e);
    return false;
  }
}

// React to auth state
function hookAuth() {
  // Check for previous authentication before showing login
  const hadPreviousAuth = hasPreviousAuth();
  
  const update = (user) => {
    if (!user || user.isAnonymous) {
      // Only show login immediately if this is truly the first time
      if (!hadPreviousAuth) {
        show();
        hideMainApp();
      } else {
        // User had previous auth but state not ready yet - keep skeleton visible
        // Don't hide app here - keep skeleton visible
        
        // Give Firebase time to restore auth state
        setTimeout(() => {
          // If still no user after waiting, then show login
          const currentUser = window.Auth ? window.Auth.currentUser : null;
          if (!currentUser || currentUser.isAnonymous) {
            hideMainApp();
            show();
          }
        }, 1500); // Wait 1.5 seconds for auth restoration
      }
    } else {
      // User authenticated - reset button state and show main app
      const btn = document.querySelector('#googleBtn');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <span class="g-badge" aria-hidden>G</span>
          <span>Continuar com Google</span>
        `;
      }
      hide();
      // Show main app after successful auth
      showMainApp();
    }
  };
  
  if (window.Auth && typeof window.Auth.onReady === 'function') {
    window.Auth.onReady(update);
    update(window.Auth.currentUser);
  } else {
    // Wait for auth init event
    const onInit = () => {
      document.removeEventListener('auth:init', onInit);
      if (window.Auth) {
        window.Auth.onReady(update);
        update(window.Auth.currentUser);
      }
    };
    document.addEventListener('auth:init', onInit);
  }
}

// App visibility management
function hideMainApp() {
  const wrapper = document.querySelector('.wrapper');
  const header = document.querySelector('header, .app-header');
  const floatingPill = document.querySelector('.floating-pill');
  const floatingAddButton = document.querySelector('.floating-add-button');
  
  if (wrapper) wrapper.style.display = 'none';
  if (header) header.style.display = 'none';
  if (floatingPill) floatingPill.style.display = 'none';
  if (floatingAddButton) floatingAddButton.style.display = 'none';
}

function showMainApp() {
  const wrapper = document.querySelector('.wrapper');
  const header = document.querySelector('header, .app-header');
  const floatingPill = document.querySelector('.floating-pill');
  const floatingAddButton = document.querySelector('.floating-add-button');
  
  if (wrapper) {
    wrapper.style.display = '';
    wrapper.classList.remove('app-hidden');
  }
  if (header) header.style.display = '';
  if (floatingPill) floatingPill.style.display = '';
  if (floatingAddButton) floatingAddButton.style.display = '';
}

// Offline hint: disable button when navigator.offLine
function hookOnline() {
  const setState = () => {
    const btn = document.querySelector('#googleBtn');
    if (!btn) return;
    btn.disabled = !navigator.onLine;
    btn.classList.toggle('offline', !navigator.onLine);
    if (!navigator.onLine) btn.title = 'Sem conexão'; else btn.removeAttribute('title');
  };
  window.addEventListener('online', setState);
  window.addEventListener('offline', setState);
  setState();
}

// Public API
window.LoginView = { show, hide, showMainApp, hideMainApp };

// Boot - Only hide main app immediately if no previous auth
const hadPreviousAuth = hasPreviousAuth();
if (!hadPreviousAuth) {
  hideMainApp(); // Hide app only if this is the first time
  show(); // Show login immediately for first-time users
} else {
  // Show skeleton app immediately when previous auth is detected
  showMainApp();
}
hookAuth();
hookOnline();

// iOS PWA specific: Additional auth state check after page load
const ua = navigator.userAgent.toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(ua);
const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ('standalone' in navigator && navigator.standalone);

if (isIOS && standalone) {
  // Listen for auth errors specifically
  document.addEventListener('auth:error', (e) => {
    console.error('LoginView: Auth error received:', e.detail);
    const btn = document.querySelector('#googleBtn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <span class="g-badge" aria-hidden>G</span>
        <span>Continuar com Google</span>
      `;
    }
    show();
  });
}

// Error helper
function showError(root, text){
  let bar = root.querySelector('.login-error');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'login-error';
    root.querySelector('.login-actions').prepend(bar);
  }
  bar.textContent = text || 'Falha no login';
}
