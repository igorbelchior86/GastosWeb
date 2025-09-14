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
      console.log('iOS PWA: Starting Google sign-in...');
      btn.textContent = 'Redirecionando...';
    }
    
    try { 
      await window.Auth?.signInWithGoogle(); 
      
      // For iOS PWA redirect, the button will be re-enabled by auth state change
      if (!(isIOS && standalone)) {
        btn.disabled = false;
      }
    }
    catch (e) {
      btn.disabled = false;
      btn.textContent = 'Continuar com Google';
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

// React to auth state
function hookAuth() {
  const update = (user) => {
    console.log('LoginView: Auth state update -', user ? user.email : 'signed out');
    
    if (!user || user.isAnonymous) {
      show();
    } else {
      // User authenticated - reset button state
      const btn = document.querySelector('#googleBtn');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <span class="g-badge" aria-hidden>G</span>
          <span>Continuar com Google</span>
        `;
      }
      hide();
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
window.LoginView = { show, hide };

// Boot
hookAuth();
hookOnline();

// iOS PWA specific: Additional auth state check after page load
const ua = navigator.userAgent.toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(ua);
const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ('standalone' in navigator && navigator.standalone);

if (isIOS && standalone) {
  console.log('LoginView: iOS PWA detected, setting up enhanced auth monitoring');
  
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
  
  // Additional check after a delay to catch late auth states
  setTimeout(() => {
    const currentUser = window.Auth && window.Auth.currentUser;
    if (!currentUser) {
      console.log('LoginView: iOS PWA late check - no user found, ensuring login view is shown');
      show();
    } else {
      console.log('LoginView: iOS PWA late check - user found:', currentUser.email);
      hide();
    }
  }, 3000);
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
