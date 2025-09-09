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
        <div id="loginHint" class="login-hint" hidden></div>
        <button id="offlineBtn" class="login-google offline" style="margin-top:10px">
          Usar sem login (offline)
        </button>
        <div class="email-block" style="margin-top:12px">
          <input id="emailInput" type="email" placeholder="Seu e-mail" autocomplete="email" style="width:100%;padding:12px;border-radius:12px;border:none;outline:none;margin-bottom:8px;">
          <button id="emailBtn" class="login-google" style="background:linear-gradient(180deg,#3b82f6,#2563eb)">Enviar link por e-mail</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  const btn = el.querySelector('#googleBtn');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { await window.Auth?.signInWithGoogle(); }
    catch (e) {
      btn.disabled = false;
      // Show inline error
      const msg = (e && e.code) ? e.code.replace('auth/','Auth: ') : 'Falha no login';
      showError(el, msg);
    }
  });
  const off = el.querySelector('#offlineBtn');
  if (off) off.addEventListener('click', async () => {
    off.disabled = true;
    try {
      localStorage.setItem('guestMode', '1');
      location.reload();
    } catch (e) {
      off.disabled = false;
      showError(el, 'Não foi possível entrar offline');
    }
  });
  const emailBtn = el.querySelector('#emailBtn');
  if (emailBtn) emailBtn.addEventListener('click', async () => {
    const input = el.querySelector('#emailInput');
    const email = (input && input.value || '').trim();
    if (!email) { showError(el, 'Digite seu e-mail'); return; }
    emailBtn.disabled = true;
    try {
      await window.Auth?.sendMagicLink(email);
      showError(el, `Enviamos um link para ${email}`);
    } catch (e) {
      emailBtn.disabled = false;
      const msg = (e && e.code) ? e.code.replace('auth/','Auth: ') : 'Erro ao enviar link';
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
    try {
      const guest = localStorage.getItem('guestMode') === '1';
      if (guest) { hide(); return; }
    } catch (_) {}
    if (!user) show(); else hide();
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
    const off = document.querySelector('#offlineBtn');
    if (!btn) return;
    btn.disabled = !navigator.onLine;
    btn.classList.toggle('offline', !navigator.onLine);
    if (!navigator.onLine) btn.title = 'Sem conexão'; else btn.removeAttribute('title');
    if (off) off.disabled = false; // offline option always available
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

// iOS PWA + content blockers guidance
(async function hintIfBlocked(){
  try {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ('standalone' in navigator && navigator.standalone);
    if (!(isIOS && isStandalone)) return;
    const hint = document.querySelector('#loginHint');
    if (!hint) return;
    const ok = await probeGoogleReachability(2500);
    if (!ok) {
      hint.hidden = false;
      hint.textContent = 'Parece que bloqueadores de conteúdo do iOS estão impedindo o login do Google no app instalado. Desative Bloqueadores de Conteúdo e “Prevenir Rastreamento entre Sites” em Ajustes > Safari. Você também pode abrir no Safari para entrar, ou usar sem login e sincronizar depois.';
    }
  } catch (_) {}
})();

async function probeGoogleReachability(timeoutMs){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(800, timeoutMs||2000));
  try {
    await fetch('https://accounts.google.com/gsi/status', { mode:'no-cors', cache:'no-store', signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    try { clearTimeout(t); } catch {}
    return false;
  }
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
