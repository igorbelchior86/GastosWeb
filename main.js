// Recorrência: Exclusão e Edição de recorrência
let pendingDeleteTxId = null;
let pendingDeleteTxIso = null;
let pendingEditTxId = null;
let pendingEditTxIso = null;
let pendingEditMode = null;
// Modal Excluir Recorrência - refs
const deleteRecurrenceModal = document.getElementById('deleteRecurrenceModal');
const closeDeleteRecurrenceModal = document.getElementById('closeDeleteRecurrenceModal');
const deleteSingleBtn = document.getElementById('deleteSingleBtn');
const deleteFutureBtn = document.getElementById('deleteFutureBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const cancelDeleteRecurrence = document.getElementById('cancelDeleteRecurrence');
// Modal Editar Recorrência - refs
const editRecurrenceModal = document.getElementById('editRecurrenceModal');
const closeEditRecurrenceModal = document.getElementById('closeEditRecurrenceModal');
const editSingleBtn = document.getElementById('editSingleBtn');
const editFutureBtn = document.getElementById('editFutureBtn');
const editAllBtn = document.getElementById('editAllBtn');
const cancelEditRecurrence = document.getElementById('cancelEditRecurrence');
// Elements for Planejados modal
const openPlannedBtn = document.getElementById('openPlannedBtn');
const plannedModal   = document.getElementById('plannedModal');
const closePlannedModal = document.getElementById('closePlannedModal');
const plannedList    = document.getElementById('plannedList');

// Header segmented control → delega para os botões originais
const headerSeg = document.querySelector('.header-seg');
if (headerSeg) {
  headerSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-option');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'planned' && openPlannedBtn) {
      headerSeg.dataset.selected = 'planned';
      openPlannedBtn.click();
    } else if (action === 'cards') {
      const openCardBtn = document.getElementById('openCardModal');
      if (openCardBtn) {
        headerSeg.dataset.selected = 'cards';
        openCardBtn.click();
      }
    }
  });
}

// --- Ensure Planned modal values are anchored to the right, regardless of DOM structure
function fixPlannedAlignment() {
  if (!plannedList) return;
  // Only act if the Planned modal is visible
  if (plannedModal && plannedModal.classList.contains('hidden')) return;

  plannedList.querySelectorAll('li').forEach(li => {
    // Ensure wrappers occupy full width
    li.style.position = 'relative';
    li.style.width = '100%';

    const wrap = li.querySelector('.swipe-wrapper');
    if (wrap) {
      wrap.style.position = 'relative';
      wrap.style.width = '100%';
      wrap.style.maxWidth = '100%';
    }

    const line = li.querySelector('.op-line, .card-line') || li.firstElementChild;
    if (line) {
      line.style.position = 'relative';
      line.style.width = '100%';
      line.style.maxWidth = '100%';
      line.style.boxSizing = 'border-box';
    }

    const row = li.querySelector('.op-main') || li.querySelector('.planned-row') || (line || li).firstElementChild;
    if (row) {
      row.style.position = 'relative';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '12px';
      row.style.flexWrap = 'nowrap';
      // Reserve space for the fixed value on the right
      row.style.paddingRight = '96px';
      row.style.boxSizing = 'border-box';
      row.style.width = '100%';
      row.style.maxWidth = '100%';
    }

    // Locate value element
    let valueEl = li.querySelector('.op-right .value') || li.querySelector('.value');
    if (!valueEl) return;

    // Ensure an anchor container for absolute positioning
    let anchor = valueEl.closest('.op-right');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.className = 'op-right';
      valueEl.parentNode.insertBefore(anchor, valueEl);
      anchor.appendChild(valueEl);
    }
    anchor.style.position = 'absolute';
    anchor.style.right = '12px';
    anchor.style.top = '50%';
    anchor.style.transform = 'translateY(-50%)';
    anchor.style.display = 'flex';
    anchor.style.alignItems = 'center';
    anchor.style.justifyContent = 'flex-end';
    anchor.style.minWidth = '84px';

    valueEl.style.textAlign = 'right';
    valueEl.style.display = 'inline-block';

    // Move payment method element under the description inside .op-left
    const methodEl = li.querySelector('.op-right > :not(.value)');
    const opLeft   = li.querySelector('.op-left');
    if (methodEl && opLeft && !opLeft.contains(methodEl)) {
      methodEl.classList.add('method');
      opLeft.appendChild(methodEl);   // agora fica exatamente alinhado com a descrição
    }
    // Compute exact indent where the description text actually starts
    const descSpan = li.querySelector('.op-left span:not(.icon-repeat)');
    const methodUnder = li.querySelector('.op-left .method');
    if (descSpan) {
      try {
        const lineRect = line.getBoundingClientRect();
        const descRect = descSpan.getBoundingClientRect();
        const cs = getComputedStyle(descSpan);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const marL = parseFloat(cs.marginLeft) || 0;
        const borderL = parseFloat(cs.borderLeftWidth) || 0;
        const indent = Math.max(0, Math.round((descRect.left - lineRect.left) + padL + marL + borderL));
        // set CSS variable on the line (inherited by children)
        line.style.setProperty('--plan-left-indent', indent + 'px');
        // enforce on the method element as a fallback/safety
        
      } catch(_) {}
    }
  });
}

// --- Expand weekday labels to long form inside Planned modal ---
const WDAY_LONG = {
  'dom.': 'Domingo',
  'seg.': 'Segunda-feira',
  'ter.': 'Terça-feira',
  'qua.': 'Quarta-feira',
  'qui.': 'Quinta-feira',
  'sex.': 'Sexta-feira',
  'sáb.': 'Sábado',
  'sab.': 'Sábado'
};

function expandPlannedDayLabels() {
  if (!plannedModal) return;
  // Look for common containers used as day headers inside the Planned modal
  const nodes = plannedModal.querySelectorAll('.modal-content .subheader, .modal-content .planned-date, .modal-content h3, .modal-content div');
  nodes.forEach(el => {
    const raw = (el.textContent || '').trim();
    // Match patterns like "Qua., 16/07" or "qui., 24/07"
    const m = raw.match(/^([A-Za-zÀ-ÿ]{3,4}\.)\s*,?\s*(.*)$/);
    if (!m) return;
    const abbr = m[1].toLowerCase();
    const rest = m[2] || '';
    const full = WDAY_LONG[abbr];
    if (full) {
      el.textContent = rest ? `${full}, ${rest}` : full;
    }
  });
}

// Hooks: on open button click, after modal transition, and whenever list mutates
if (openPlannedBtn) {
  openPlannedBtn.addEventListener('click', () => setTimeout(() => { fixPlannedAlignment(); expandPlannedDayLabels(); }, 0));
}

const plannedBox = plannedModal ? plannedModal.querySelector('.bottom-modal-box') : null;
if (plannedBox) {
  plannedBox.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'transform') {
      fixPlannedAlignment();
      expandPlannedDayLabels();
    }
  });
}

if (plannedList) {
  const mo = new MutationObserver(() => { fixPlannedAlignment(); expandPlannedDayLabels(); });
  mo.observe(plannedList, { childList: true, subtree: true });
}

import { openDB } from 'https://unpkg.com/idb?module';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-app.js";

import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-auth.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-database.js";

// Configuração do Firebase de TESTE (arquivo separado)
import { firebaseConfig } from './firebase.prod.config.js';

/**
 * Initialize swipe-to-reveal actions on elements.
 * @param {ParentNode} root       Root element to listen on (e.g., document or specific container).
 * @param {string} wrapperSel     Selector for swipe wrapper (e.g., '.swipe-wrapper').
 * @param {string} actionsSel     Selector for swipe actions (e.g., '.swipe-actions').
 * @param {string} lineSel        Selector for the line to translate (e.g., '.op-line' or '.card-line').
 * @param {boolean} onceFlag      Name of global flag to prevent multiple inits.
 */
function initSwipe(root, wrapperSel, actionsSel, lineSel, onceFlag) {
  if (window[onceFlag]) return;
  let startX = 0;
  root.addEventListener('touchstart', e => {
    const wrap = e.target.closest(wrapperSel);
    if (!wrap) return;
    startX = e.touches[0].clientX;
    wrap.dataset.startX = startX;
    const line = wrap.querySelector(lineSel);
    const m = new WebKitCSSMatrix(getComputedStyle(line).transform);
    wrap.dataset.offset = m.m41 || 0;
  }, { passive: true });
  root.addEventListener('touchmove', e => {
    const wrap = e.target.closest(wrapperSel);
    if (!wrap) return;
    const start = parseFloat(wrap.dataset.startX || 0);
    const offset = parseFloat(wrap.dataset.offset || 0);
    const diff   = start - e.touches[0].clientX;
    const line   = wrap.querySelector(lineSel);
    const actions= wrap.querySelector(actionsSel);
    const actW   = actions.offsetWidth;
    line.style.transition = 'none';
    let newTx = offset - diff;
    newTx = Math.max(Math.min(newTx, 0), -actW);
    line.style.transform = `translateX(${newTx}px)`;
    actions.style.opacity = Math.abs(newTx) / actW;
  }, { passive: true });
  root.addEventListener('touchend', e => {
    const wrap = e.target.closest(wrapperSel);
    if (!wrap) return;
    const start  = parseFloat(wrap.dataset.startX || 0);
    const offset = parseFloat(wrap.dataset.offset || 0);
    const diff   = start - e.changedTouches[0].clientX;
    const line   = wrap.querySelector(lineSel);
    const actions= wrap.querySelector(actionsSel);
    const actW   = actions.offsetWidth;
    let finalTx  = offset - diff;
    const shouldOpen = Math.abs(finalTx) > actW / 2;
    finalTx = shouldOpen ? -actW : 0;
    line.style.transition = '';
    line.style.transform  = `translateX(${finalTx}px)`;
    actions.style.opacity = shouldOpen ? 1 : 0;
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(30);
    }
    // collapse others
    document.querySelectorAll(lineSel).forEach(l=>{
      if(l!==line){l.style.transform='translateX(0)';}
    });
    document.querySelectorAll(actionsSel).forEach(a=>{
      if(a!==actions){a.style.opacity=0;}
    });
  }, { passive: true });
  window[onceFlag] = true;
}

let PATH;

// Flag for mocking data while working on UI.  
// Switch to `false` to reconnect to production Firebase.
const USE_MOCK = false;              // conectar ao Firebase PROD
const APP_VERSION = '1.4.5';
let save, load;
let firebaseDb;

if (!USE_MOCK) {
  // Seleciona config conforme ambiente
  const cfg = firebaseConfig;
  const app  = initializeApp(cfg);
  const db   = getDatabase(app);
  firebaseDb = db;

  // Mesmo caminho de DB para ambos os ambientes
  PATH = 'orcamento365_9b8e04c5';

  const auth = getAuth(app);
  await signInAnonymously(auth);

  save = (k, v) => set(ref(db, `${PATH}/${k}`), v);
  load = async (k, d) => {
    const s = await get(ref(db, `${PATH}/${k}`));
    return s.exists() ? s.val() : d;
  };
} else {
  // Modo MOCK (LocalStorage)
  PATH = 'mock_365';
  save = (k, v) => localStorage.setItem(`${PATH}_${k}`, JSON.stringify(v));
  load = async (k, d) =>
    JSON.parse(localStorage.getItem(`${PATH}_${k}`)) ?? d;
}


// Cache local (LocalStorage) p/ boot instantâneo
const cacheGet  = (k, d) => JSON.parse(localStorage.getItem(`cache_${k}`)) ?? d;
const cacheSet  = (k, v) => localStorage.setItem(`cache_${k}`, JSON.stringify(v));

// ---------------- Offline queue helpers ----------------
// Badge on the ⟳ sync button shows how many items are waiting
function updatePendingBadge() {
  const syncBtn = document.getElementById('syncNowBtn');
  if (!syncBtn) return;
  const q = cacheGet('txQueue', []);
  syncBtn.textContent = q.length ? `⟳ (${q.length})` : '⟳';
}

// Adds one transaction to the local pending queue (LocalStorage)
async function queueTx(tx) {
  const q = cacheGet('txQueue', []);
  q.push(tx);
  cacheSet('txQueue', q);
  updatePendingBadge();
}

// Flushes the pending queue to Firebase and clears it locally.
// Merges with the live `transactions` list and saves.
async function flushQueue() {
  const q = cacheGet('txQueue', []);
  if (!q.length) return;

  cacheSet('txQueue', []);

  try {
    await save('tx', transactions);
    showToast('Fila sincronizada!', 'success');
  } catch (err) {
    console.error('flushQueue failed:', err);
    // Re‑queue on error to retry later
    cacheSet('txQueue', q);
    return;
  }
  updatePendingBadge();
  renderTable();
}


// Load transactions from Firebase in production, fallback to LocalStorage in mock
let transactions = !USE_MOCK
  ? await load('tx', [])
  : cacheGet('tx', []);
// Helper: sort transactions by opDate (YYYY-MM-DD) then by timestamp (ts) so UI is always chronological
function sortTransactions() {
  transactions.sort((a, b) => {
    const d = a.opDate.localeCompare(b.opDate);
    if (d !== 0) return d;
    // Fallback: compare timestamps when same date
    return (a.ts || '').localeCompare(b.ts || '');
  });
}
// ---- Migration: normalize legacy transactions ----
transactions = transactions.map(t => ({
  ...t,
  // Padroniza “Dinheiro” com D maiúsculo
  method: (t.method && t.method.toLowerCase() === 'dinheiro') ? 'Dinheiro' : t.method,
  recurrence: t.recurrence ?? '',
  installments: t.installments ?? 1,
  parentId: t.parentId ?? null
}));
cacheSet('tx', transactions);
sortTransactions();
let cards         = cacheGet('cards', [{name:'Dinheiro',close:0,due:0}]);
let startBalance  = cacheGet('startBal', null);
const $=id=>document.getElementById(id);
const tbody=document.querySelector('#dailyTable tbody');
const wrapperEl = document.querySelector('.wrapper');
const txModalTitle = document.querySelector('#txModal h2');

// ---------------------------------------------------------------------------
// Modal de Transação: código movido do index.html
// ---------------------------------------------------------------------------
const openTxBtn = document.getElementById('openTxModal');
const txModal   = document.getElementById('txModal');
const closeTxModal = document.getElementById('closeTxModal');

/**
 * Reset the fields and state of the transaction modal.
 */
function resetTxModal() {
  // Clear text fields and date
  const descInput = document.getElementById('desc');
  const valueInput = document.getElementById('value');
  const dateInput = document.getElementById('opDate');
  if (descInput) descInput.value = '';
  if (valueInput) valueInput.value = '';
  if (dateInput) dateInput.value = todayISO();
  // Reset expense/income toggles
  document.querySelectorAll('.value-toggle button').forEach(btn => btn.classList.remove('active'));
  // Reset method switch to Dinheiro
  document.querySelectorAll('.switch-option').forEach(btn => btn.classList.remove('active'));
  const defaultBtn = document.querySelector('.switch-option[data-method="Dinheiro"]');
  if (defaultBtn) defaultBtn.classList.add('active');
  const hiddenSelect = document.getElementById('method');
  if (hiddenSelect) hiddenSelect.value = 'Dinheiro';
  const methodSwitch = document.querySelector('.method-switch');
  if (methodSwitch) methodSwitch.dataset.selected = 'Dinheiro';
  // Clear card selector
  const cardSelectorEl = document.getElementById('cardSelector');
  if (cardSelectorEl) {
    cardSelectorEl.innerHTML = '';
    cardSelectorEl.hidden = true;
  }
  // Reset recurrence and installments
  const recurrenceSelect = document.getElementById('recurrence');
  if (recurrenceSelect) recurrenceSelect.value = '';
  const parcelaBlock = document.getElementById('parcelasBlock');
  if (parcelaBlock) parcelaBlock.classList.add('hidden');
  const instSelect = document.getElementById('installments');
  if (instSelect) instSelect.value = '1';
  // Reset modal title and button
  const modalHeader = document.querySelector('#txModal h2');
  if (modalHeader) modalHeader.textContent = 'Lançar operação';
  const addBtnEl = document.getElementById('addBtn');
  if (addBtnEl) addBtnEl.textContent = 'Adicionar';
}

/**
 * Toggle the visibility of the transaction modal.
 */
function toggleTxModal() {
  const isOpening = txModal.classList.contains('hidden');
  if (isOpening) {
    resetTxModal();
    // Prevent background scrolling when modal is open
    if (document.body) document.body.style.overflow = 'hidden';
    if (wrapperEl) wrapperEl.style.overflow = 'hidden';
  } else {
    // Restore scrolling
    if (document.body) document.body.style.overflow = '';
    if (wrapperEl) wrapperEl.style.overflow = '';
  }
  txModal.classList.toggle('hidden');
  // Rotate the floating button to indicate state
  if (openTxBtn) {
    openTxBtn.style.transform = isOpening ? 'rotate(45deg)' : 'rotate(0deg)';
  }
  if (isOpening) {
    const valInput = document.getElementById('value');
    if (valInput) {
      valInput.focus();
      valInput.select();
    }
  }
}

// Attach event handlers if elements exist
if (openTxBtn) openTxBtn.onclick = toggleTxModal;
if (closeTxModal) closeTxModal.onclick = toggleTxModal;
if (txModal) {
  txModal.onclick = (e) => {
    if (e.target === txModal) toggleTxModal();
  };
}
// Block background scrolling via touch/wheel when tx modal is open
document.addEventListener('touchmove', (e) => {
  if (!txModal.classList.contains('hidden')) e.preventDefault();
}, { passive: false });
document.addEventListener('wheel', (e) => {
  if (!txModal.classList.contains('hidden')) e.preventDefault();
}, { passive: false });



const currency=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
// Palavras que caracterizam “salário”
const SALARY_WORDS = ['salário', 'salario', 'provento', 'rendimento', 'pagamento', 'paycheck', 'salary'];
const mobile=()=>window.innerWidth<=480;
const fmt=d=>d.toLocaleDateString('pt-BR',mobile()?{day:'2-digit',month:'2-digit'}:{day:'2-digit',month:'2-digit',year:'numeric'});

// ---------------------------------------------------------------------------
// Sticky month header  (Safari/iOS não suporta <summary> sticky)
// ---------------------------------------------------------------------------
const headerEl      = document.querySelector('.app-header');
const HEADER_OFFSET = headerEl ? headerEl.getBoundingClientRect().height : 58;
const STICKY_VISIBLE = 18;
const stickyMonth     = document.createElement('div');
stickyMonth.className = 'sticky-month';
stickyMonth.style.top = (HEADER_OFFSET - STICKY_VISIBLE) + 'px';
document.body.appendChild(stickyMonth);

// Recalcula altura do header em rotação / resize
window.addEventListener('resize', () => {
  const h = headerEl.getBoundingClientRect().height;
  stickyMonth.style.top = (h - STICKY_VISIBLE) + 'px';
});

function updateStickyMonth() {
  let label = '';
  const divs = document.querySelectorAll('summary.month-divider');
  divs.forEach(div => {
    const rect = div.getBoundingClientRect();
    // choose the last divider whose top passed the header
    if (rect.top <= HEADER_OFFSET) {
      label = div.textContent.replace(/\s+/g, ' ').trim();
    }
  });
  if (label) {
    // Exibe apenas o nome do mês (primeira palavra do label)
    const mesApenas = label.split(/\s+/)[0];
    stickyMonth.textContent = mesApenas;
    stickyMonth.classList.add('visible');
  } else {
    stickyMonth.classList.remove('visible');
  }
}

window.addEventListener('scroll', updateStickyMonth);

// Retorna YYYY-MM-DD no fuso local (corrige o shift do toISOString em UTC)
const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
// expose todayISO to global for inline scripts
window.todayISO = todayISO;

// Função para calcular o postDate de cartões corretamente (nova lógica)
const post = (iso, m) => {
  if (m === 'Dinheiro') return iso;
  const c = cards.find(x => x.name === m);
  if (!c) return iso;
  // Usa dayjs para facilitar manipulação de datas
  // Se não houver dayjs, implementa lógica equivalente
  const [y, mo, d] = iso.split('-').map(Number);
  const closingDay = c.close;
  const dueDay = c.due;
  const txDay = d;
  let invoiceMonth = mo - 1; // JS Date/Month é 0-based
  let invoiceYear = y;
  if (txDay > closingDay) {
    // entra na fatura do mês seguinte
    if (invoiceMonth === 11) {
      invoiceMonth = 0;
      invoiceYear += 1;
    } else {
      invoiceMonth += 1;
    }
  }
  // Monta data de vencimento da fatura (YYYY-MM-DD)
  const pad = n => String(n).padStart(2, '0');
  return `${invoiceYear}-${pad(invoiceMonth + 1)}-${pad(dueDay)}`;
};

const addYearsIso  = (iso,n) => {
  const d=new Date(iso);d.setFullYear(d.getFullYear()+n);
  return d.toISOString().slice(0,10);
};


// ---- Recurrence rule helpers ----
function isSameDayOfMonth(baseIso, testIso, monthInterval) {
  const [by, bm, bd] = baseIso.split('-').map(Number);
  const [ty, tm, td] = testIso.split('-').map(Number);
  if (td !== bd) return false;
  const monthsDiff = (ty - by) * 12 + (tm - bm);
  return monthsDiff % monthInterval === 0;
}

function occursOn(tx, iso) {
  // Exclude single exceptions
  if (tx.exceptions && tx.exceptions.includes(iso)) return false;
  // Exclude dates on or after recurrence end
  if (tx.recurrenceEnd && iso >= tx.recurrenceEnd) return false;
  if (!tx.recurrence) return false;
  if (iso < tx.opDate) return false;
  const diffDays = Math.floor((new Date(iso) - new Date(tx.opDate)) / 864e5);
  switch (tx.recurrence) {
    case 'D':  return true;
    case 'W':  return diffDays % 7  === 0;
    case 'BW': return diffDays % 14 === 0;
    case 'M':  return isSameDayOfMonth(tx.opDate, iso, 1);
    case 'Q':  return isSameDayOfMonth(tx.opDate, iso, 3);
    case 'S':  return isSameDayOfMonth(tx.opDate, iso, 6);
    case 'Y': {
      const bd = new Date(tx.opDate);
      const td = new Date(iso);
      return bd.getDate() === td.getDate() && bd.getMonth() === td.getMonth();
    }
    default:   return false;
  }
}

const desc=$('desc'),val=$('value'),met=$('method'),date=$('opDate'),addBtn=$('addBtn');
// Auto-format value input as BRL currency while typing
val.type = 'text';  // ensure it's text for formatting
val.addEventListener('input', () => {
  // Remove all non-digit characters
  const digits = val.value.replace(/\D/g, '');
  // On first digit typed, automatically highlight the expense (red) toggle
  if (digits.length === 1) {
    document.querySelectorAll('.value-toggle button').forEach(b => b.classList.remove('active'));
    document.querySelector('.value-toggle button[data-type="expense"]').classList.add('active');
  }
  if (!digits) {
    val.value = '';
    return;
  }
  // Parse as cents and format
  const numberValue = parseInt(digits, 10) / 100;
  // Check toggle for sign
  const activeToggle = document.querySelector('.value-toggle button.active');
  let formatted = numberValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (activeToggle && activeToggle.dataset.type === 'expense') {
    formatted = '-' + formatted.replace(/^-/, '');
  } else {
    formatted = formatted.replace(/^-/, '');
  }
  val.value = formatted;
});

const valueToggles = document.querySelectorAll('.value-toggle button');
valueToggles.forEach(btn => {
  btn.addEventListener('click', () => {
    valueToggles.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Reformat current value preserving sign choice
    const digits = val.value.replace(/\D/g, '');
    if (!digits) {
      val.value = '';
      return;
    }
    const numberValue = parseInt(digits, 10) / 100;
    let formatted = numberValue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    if (btn.dataset.type === 'expense') {
      formatted = '-' + formatted.replace(/^-/, '');
    } else {
      formatted = formatted.replace(/^-/, '');
    }
    val.value = formatted;
  });
});

// pill-switch for Dinheiro vs Cartão
const methodButtons = document.querySelectorAll('.switch-option');
const hiddenSelect = document.getElementById('method');
methodButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    methodButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const selectedMethod = btn.dataset.method;
    hiddenSelect.value = selectedMethod;
    btn.closest('.method-switch').dataset.selected = selectedMethod;
    const cardSelector = document.getElementById('cardSelector');
    if (selectedMethod === 'Cartão') {
      renderCardSelector();
      cardSelector.hidden = false;
    } else {
      // clear any previously rendered cards and hide selector
      cardSelector.innerHTML = '';
      cardSelector.hidden = true;
    }
  });
});
// initialize hidden select to match default active
const initialMethod = document.querySelector('.switch-option.active').dataset.method;
hiddenSelect.value = initialMethod;
document.querySelector('.method-switch').dataset.selected = initialMethod;
// Also show/hide card selector on load
const cardSelector = document.getElementById('cardSelector');
if (initialMethod === 'Cartão') {
  renderCardSelector();
  cardSelector.hidden = false;
} else {
  cardSelector.hidden = true;
}

function renderCardSelector() {
  const container = document.getElementById('cardSelector');
  container.innerHTML = '';
  // Only render cards that are not 'Dinheiro'
  cards
    .filter(c => c.name !== 'Dinheiro')
    .forEach(c => {
      const label = document.createElement('label');
      label.style.flex = '1';
      label.innerHTML = `
        <input type="radio" name="cardChoice" value="${c.name}">
        ${c.name}
      `;
      container.appendChild(label);
    });
  // auto-select first card
  const first = container.querySelector('input[name="cardChoice"]');
  if (first) {
    first.checked = true;
    hiddenSelect.value = first.value;
  }
  // listen for changes
  container.querySelectorAll('input[name="cardChoice"]').forEach(radio => {
    radio.addEventListener('change', () => hiddenSelect.value = radio.value);
  });
}

// Recorrência e Parcelas
const recurrence = $('recurrence');
const parcelasBlock = $('parcelasBlock');
const installments = $('installments');

// --- Parcelamento desativado temporariamente ---
parcelasBlock.classList.add('hidden');
installments.value = '1';
installments.disabled = true;
// Não popula opções de parcelas e não exibe nem ativa nada relacionado a parcelas.
// Se selecionar recorrência, zera parcelas
recurrence.onchange = () => {
  if (recurrence.value !== '') installments.value = '1';
};
let isEditing = null;
const cardName=$('cardName'),cardClose=$('cardClose'),cardDue=$('cardDue'),addCardBtn=$('addCardBtn'),cardList=$('cardList');
const startGroup=$('startGroup'),startInput=$('startInput'),setStartBtn=$('setStartBtn'),resetBtn=$('resetData');
const startContainer = document.querySelector('.start-container');
const dividerSaldo = document.getElementById('dividerSaldo');

const showToast = (msg, type = 'error') => {
  const t = document.getElementById('toast');
  if (!t) return;

  // Set the message
  t.textContent = msg;

  // choose icon for CSS ::before
  t.style.setProperty('--icon', type === 'error' ? '"✕"' : '"✓"');

  // Remove any previous type classes
  t.classList.remove('success', 'error');

  // Add the new type (defines background color)
  t.classList.add(type);

  // ⚡️ Force a reflow so consecutive toasts restart the animation cleanly
  void t.offsetWidth;

  // Show the toast (opacity transition handled via CSS)
  t.classList.add('show');

  // Hide after 3 s: first fade out, then drop the color class to avoid flicker
  setTimeout(() => {
    t.classList.remove('show');          // starts fade‑out (0.3 s)
    // setTimeout(() => t.classList.remove(type), 300);
  }, 3000);
};

const togglePlanned = (id, iso) => {
  const master = transactions.find(x => x.id === id);
  // ← memoriza quais faturas estavam abertas
  const openInvoices = Array.from(
    document.querySelectorAll('details.invoice[open]')
  ).map(el => el.dataset.pd);
  let toastMsg = null;
  if (!master) return;
  if (master.recurrence) {
    master.exceptions = master.exceptions || [];
    if (!master.exceptions.includes(iso)) {
      master.exceptions.push(iso);
      // Create a standalone executed transaction for this occurrence
      const execTx = {
        id: Date.now(),
        parentId: master.id,
        desc: master.desc,
        val: master.val,
        method: master.method,
        opDate: iso,
        postDate: post(iso, master.method),
        recurrence: '',
        installments: 1,
        planned: false,
        ts: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };
      transactions.push(execTx);
      // Exibe toast quando a ocorrência recorrente vai para a fatura (cartão)
      if (execTx.method !== 'Dinheiro') {
        const [, mm, dd] = execTx.postDate.split('-');
        toastMsg = `Movida para fatura de ${dd}/${mm}`;
      }
    }
  } else {
    // If un-planning an expired transaction, adjust based on method
    if (master.planned) {
      const today = todayISO();
      if (master.method === 'Dinheiro') {
        // cash payments move to today
        master.opDate = today;
        master.postDate = today;
      }
      // update timestamp of payment to today
      master.ts = new Date().toISOString();
    }
    master.planned = !master.planned;
    if (!master.planned && master.method !== 'Dinheiro') {
      master.postDate = post(master.opDate, master.method);      // move para a fatura
      const [, mm, dd] = master.postDate.split('-');
      toastMsg = `Movida para fatura de ${dd}/${mm}`;
    }
  }
  save('tx', transactions);
  renderTable();
  // restaura faturas que o usuário tinha expandido
  openInvoices.forEach(pd => {
    const det = document.querySelector(`details.invoice[data-pd="${pd}"]`);
    if (det) det.open = true;
  });

  // mostra o toast por último, já com a tela renderizada
  if (toastMsg) showToast(toastMsg, 'success');
};

const openCardBtn=document.getElementById('openCardModal');
const cardModal=document.getElementById('cardModal');
const closeCardModal=document.getElementById('closeCardModal');

function refreshMethods(){met.innerHTML='';cards.forEach(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;met.appendChild(o);});}
function renderCardList() {
  cardList.innerHTML = '';
  cards
    .filter(c => c.name !== 'Dinheiro')
    .forEach(c => {
      const li = document.createElement('li');

      const wrap = document.createElement('div');
      wrap.className = 'swipe-wrapper';

      const actions = document.createElement('div');
      actions.className = 'swipe-actions';

      // Edit SVG icon
      const editBtn = document.createElement('button');
      editBtn.className = 'icon edit';
      editBtn.style.padding = '0';
      editBtn.style.background = 'none';
      editBtn.style.border = 'none';
      editBtn.style.cursor = 'pointer';
      // SVG icon as mask-image
      const editIconDiv = document.createElement('div');
      editIconDiv.className = 'icon-action icon-edit';
      editBtn.appendChild(editIconDiv);
      editBtn.addEventListener('click', () => {
        const newName  = prompt('Nome do cartão', c.name)?.trim();
        if (!newName) return;
        const newClose = parseInt(prompt('Dia de fechamento (1-31)', c.close), 10);
        const newDue   = parseInt(prompt('Dia de vencimento (1-31)', c.due), 10);
        if (
          isNaN(newClose) || isNaN(newDue) ||
          newClose < 1 || newClose > 31 ||
          newDue   < 1 || newDue   > 31 ||
          newClose >= newDue
        ) { alert('Dados inválidos'); return; }
        if (newName !== c.name && cards.some(card => card.name === newName)) {
          alert('Já existe cartão com esse nome'); return;
        }
        const oldName = c.name;
        c.name  = newName;
        c.close = newClose;
        c.due   = newDue;
        transactions.forEach(t => {
          if (t.method === oldName) {
            t.method   = newName;
            t.postDate = post(t.opDate, newName);
          }
        });
        save('cards', cards);
        save('tx', transactions);
        refreshMethods();
        renderCardList();
        renderTable();
      });
      actions.appendChild(editBtn);

      // Delete SVG icon
      const delBtn = document.createElement('button');
      delBtn.className = 'icon danger delete';
      delBtn.style.padding = '0';
      delBtn.style.background = 'none';
      delBtn.style.border = 'none';
      delBtn.style.cursor = 'pointer';
      const delIconDiv = document.createElement('div');
      delIconDiv.className = 'icon-action icon-delete';
      delBtn.appendChild(delIconDiv);
      delBtn.addEventListener('click', () => {
        if (!confirm('Excluir cartão?')) return;
        cards = cards.filter(x => x.name !== c.name);
        save('cards', cards);
        refreshMethods();
        renderCardList();
        renderTable();
      });
      actions.appendChild(delBtn);

    const content = document.createElement('div');
    content.className = 'card-content card-line';
    content.innerHTML = `
      <b>${c.name}</b>
      <div class="card-detail">
        <span class="card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1 .9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1 -.9-2-2-2zm0 16H5V9h14v11z"/>
          </svg>
        </span>
        <span class="card-label">Fechamento</span>
        <span class="card-value">${c.close}</span>
      </div>
      <div class="card-detail">
        <span class="card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 20c4.41 0 8-3.59 8-8s-3.59-8 -8-8 -8 3.59 -8 8 3.59 8 8 8zm0-14c3.31 0 6 2.69 6 6s-2.69 6 -6 6 -6-2.69 -6-6 2.69-6 6-6zm.5 3H11v5l4.25 2.52 .75-1.23 -3.5-2.04V9z"/>
          </svg>
        </span>
        <span class="card-label">Vencimento</span>
        <span class="card-value">${c.due}</span>
      </div>
    `;
    wrap.appendChild(actions);
    wrap.appendChild(content);
    li.appendChild(wrap);
      cardList.appendChild(li);
    });

  // swipe-init for cards is now handled via initSwipe at the end of the file.
}
// Helper: returns true if this record is a detached (single‑edited) occurrence
function isDetachedOccurrence(tx) {
  return !tx.recurrence && !!tx.parentId;
}

const makeLine = t => {
  // Create swipe wrapper
  const wrap = document.createElement('div');
  wrap.className = 'swipe-wrapper';

  // Create actions container
  const actions = document.createElement('div');
  actions.className = 'swipe-actions';

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'icon edit';
  // Remove emoji, add SVG icon
  editBtn.textContent = '';
  const editIconDiv = document.createElement('div');
  editIconDiv.className = 'icon-action icon-edit';
  editBtn.appendChild(editIconDiv);
  editBtn.onclick = () => {
    if (t.recurrence) {
      /* ocorrência dinâmica ou regra‑mestre — mostra opções */
      pendingEditTxId  = t.id;
      pendingEditTxIso = t.postDate;
      editRecurrenceModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      wrapperEl.style.overflow     = 'hidden';
      return;
    }

    if (isDetachedOccurrence(t)) {
      /* Já foi editada como “Somente esta”: trata como operação única */
      pendingEditMode = null;
      editTx(t.id);
      return;
    }

    /* Operação realmente única (sem parentId) */
    editTx(t.id);
  };
  actions.appendChild(editBtn);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'icon danger delete';
  delBtn.textContent = '';
  const delIconDiv = document.createElement('div');
  delIconDiv.className = 'icon-action icon-delete';
  delBtn.appendChild(delIconDiv);
  delBtn.onclick = () => {
    if (t.recurrence) {
      // show bottom sheet only for recurring operations
      delTx(t.id, t.postDate);
    } else {
      // simple confirm for one‑time operations (including detached occurrences)
      if (confirm('Deseja excluir esta operação?')) {
        transactions = transactions.filter(x => x.id !== t.id);
        save('tx', transactions);
        renderTable();
        showToast('Operação excluída!', 'success');
      }
    }
  };
  actions.appendChild(delBtn);

  // Original operation line
  const d = document.createElement('div');
  d.className = 'op-line';
  d.dataset.txId = t.id;

  // Build the content as before
  const topRow = document.createElement('div');
  topRow.className = 'op-main';
  const left = document.createElement('div');
  left.className = 'op-left';

  // (Moved) mark recurring transactions with an icon AFTER description

  if (t.planned) {
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'plan-check';
    chk.name = 'planned';
    chk.onchange = () => togglePlanned(t.id, t.opDate);
    left.appendChild(chk);
  }
  const descNode = document.createElement('span');
  descNode.textContent = t.desc;
  left.appendChild(descNode);
  // mark recurring transactions (master or detached occurrence) with an icon
  if (t.recurrence || t.parentId) {
    const recIcon = document.createElement('span');
    recIcon.className = 'icon-repeat';
    recIcon.title = 'Recorrência';
    left.appendChild(recIcon);
  }
  const right = document.createElement('div');
  right.className = 'op-right';
  const value = document.createElement('span');
  value.className = 'value';
  value.textContent = `R$ ${(t.val < 0 ? '-' : '')}${Math.abs(t.val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  // assign color class based on sign
  if (t.val < 0) {
    value.classList.add('negative');
  } else {
    value.classList.add('positive');
  }
  right.appendChild(value);
  topRow.appendChild(left);
  topRow.appendChild(right);
  d.appendChild(topRow);

  // Timestamp & method
  const ts = document.createElement('div');
  ts.className = 'timestamp';
  const [y, mo, da] = t.opDate.split('-').map(Number);
  const dateObj = new Date(y, mo - 1, da);
  const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const methodLabel = t.method === 'Dinheiro' ? 'Dinheiro' : `Cartão ${t.method}`;
  if (t.planned) {
    ts.textContent = `${dateStr} - ${methodLabel}`;
  } else if (t.opDate === todayISO()) {
    const timeStr = new Date(t.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
    ts.textContent = timeStr;
  } else {
    ts.textContent = dateStr;
  }
  d.appendChild(ts);

  // Assemble wrapper and return
  wrap.appendChild(actions);
  wrap.appendChild(d);
  return wrap;
};
// swipe-init for operations is now handled via initSwipe at the end of the file.

function addCard(){const n=cardName.value.trim(),cl=+cardClose.value,du=+cardDue.value;if(!n||cl<1||cl>31||du<1||du>31||cl>=du||cards.some(c=>c.name===n)){alert('Dados inválidos');return;}cards.push({name:n,close:cl,due:du});cacheSet('cards', cards);save('cards',cards);refreshMethods();renderCardList();cardName.value='';cardClose.value='';cardDue.value='';}

async function addTx() {
  // Modo edição?
  if (isEditing !== null) {
    const t = transactions.find(x => x.id === isEditing);
    if (!t) {
      console.error('Transaction not found for editing:', isEditing);
      // reset edit state
      pendingEditMode = null;
      isEditing = null;
      addBtn.textContent = 'Adicionar';
      txModalTitle.textContent = 'Lançar operação';
      toggleTxModal();
      return;
    }
    const newDesc    = desc.value.trim();
    const newVal     = parseFloat(val.value);
    const newMethod  = met.value;
    const newOpDate  = date.value;
    const newPostDate = post(newOpDate, newMethod);
    const newRecurrence  = recurrence.value;
    const newInstallments = parseInt(installments.value, 10) || 1;

    switch (pendingEditMode) {
      case 'single':
        // Exception for this occurrence
        t.exceptions = t.exceptions || [];
        if (!t.exceptions.includes(pendingEditTxIso)) {
          t.exceptions.push(pendingEditTxIso);
        }
        // Create standalone edited transaction
        transactions.push({
          id: Date.now(),
          parentId: t.id,
          desc: newDesc,
          val: newVal,
          method: newMethod,
          opDate: newOpDate,
          postDate: newPostDate,
          recurrence: '',
          installments: 1,
          planned: newOpDate > todayISO(),
          ts: new Date().toISOString(),
          modifiedAt: new Date().toISOString()
        });
        break;
      case 'future':
        // End original series at this occurrence
        t.recurrenceEnd = pendingEditTxIso;
        // Create new series starting from this occurrence
        transactions.push({
          id: Date.now(),
          parentId: null,
          desc: newDesc,
          val: newVal,
          method: newMethod,
          opDate: pendingEditTxIso,
          postDate: newPostDate,
          recurrence: newRecurrence,
          installments: newInstallments,
          planned: pendingEditTxIso > todayISO(),
          ts: new Date().toISOString(),
          modifiedAt: new Date().toISOString()
        });
        break;
      case 'all': {
        {
          /* —— EDITAR TODAS ——  
             Apenas altera a REGRA‑MESTRE, preservando todas as ocorrências
             passadas.  Se o registro clicado for uma ocorrência gerada,
             subimos para o pai; caso contrário usamos o próprio. */

          const master = t.parentId
            ? transactions.find(tx => tx.id === t.parentId)
            : t;

          if (master) {
            master.desc         = newDesc;
            master.val          = newVal;
            master.method       = newMethod;
            // Mantemos opDate original; só recalculamos postDate conforme novo método
            master.postDate     = post(master.opDate, newMethod);
            master.recurrence   = recurrence.value;
            master.installments = parseInt(installments.value, 10) || 1;
            master.modifiedAt   = new Date().toISOString();
          }
        }
        break;
      }
      default:
        // Fallback: modify just this entry
        t.desc       = newDesc;
        t.val        = newVal;
        t.method     = newMethod;
        t.opDate     = newOpDate;
        t.postDate   = newPostDate;
        t.recurrence   = newRecurrence;
        t.installments = newInstallments;
        // Ajusta flag planned caso a data da operação ainda não tenha ocorrido
        t.planned      = t.opDate > todayISO();
        t.modifiedAt = new Date().toISOString();
    }

    // Reset editing state
    pendingEditMode    = null;
    pendingEditTxId    = null;
    pendingEditTxIso   = null;
    isEditing          = null;
    addBtn.textContent = 'Adicionar';
    txModalTitle.textContent = 'Lançar operação';

    save('tx', transactions);
    renderTable();
    toggleTxModal();
    showToast('Alterações salvas!', 'success');
    return;
  }

  // Modo adicionar
  if (startBalance === null) {
    showToast('Defina o saldo inicial primeiro (pode ser 0).');
    return;
  }

  const d   = desc.value.trim();
  const v   = parseFloat(val.value);
  const m   = met.value;
  const iso = date.value;

  if (!d || isNaN(v) || !iso) {
    alert('Complete os campos');
    return;
  }

  // Lê opções de recorrência
  const recur = recurrence.value;
  // Parcelamento desativado: sempre 1
  const inst = 1;

  const baseTx = {
    id: Date.now(),
    parentId: null,
    desc: d,
    val: v,
    method: m,
    opDate: iso,
    postDate: post(iso, m),
    recurrence: recur,
    installments: 1,
    planned: iso > todayISO(),          // planned if the transaction date is in the future
    ts: new Date().toISOString(),
    modifiedAt: new Date().toISOString()
  };

  // Gera lote de transações conforme tipo
  let batch = [];
  if (recur) {
    batch = [baseTx];   // salva só a regra de recorrência
  } else {
    batch = [baseTx];
  }

  // Adiciona e salva
  transactions.push(...batch);
  sortTransactions();
  cacheSet('tx', transactions);

  if (!navigator.onLine) {
    for (const t of batch) {
      await queueTx(t);
    }
    updatePendingBadge();
    renderTable();
    showToast('Offline: transação salva na fila', 'error');
    return;
  }

  for (const t of batch) {
    await queueTx(t);
  }
  await flushQueue();

  // Limpa formulário
  desc.value = '';
  val.value  = '';
  date.value = todayISO();
  updatePendingBadge();
  renderTable();
  toggleTxModal();
  showToast('Tudo certo!', 'success');
}

// Função auxiliar para gerar recorrências
function generateOccurrences(baseTx) {
  const recur = baseTx.recurrence;
  if (!recur) return [];
  const occurrences = [];
  const parentId = baseTx.id;
  // Limita a 12 ocorrências (exemplo: 1 ano) para evitar explosão
  let max = 12;
  let d = new Date(baseTx.opDate);
  for (let i = 1; i < max; i++) {
    // Avança data conforme recorrência
    switch(recur) {
      case 'D': d.setDate(d.getDate() + 1); break;
      case 'W': d.setDate(d.getDate() + 7); break;
      case 'BW': d.setDate(d.getDate() + 14); break;
      case 'M': d.setMonth(d.getMonth() + 1); break;
      case 'Q': d.setMonth(d.getMonth() + 3); break;
      case 'S': d.setMonth(d.getMonth() + 6); break;
      case 'Y': d.setFullYear(d.getFullYear() + 1); break;
      default: break;
    }
    const nextIso = d.toISOString().slice(0, 10);
    // Calcula postDate com a regra de cartão
    let postDate = post(nextIso, baseTx.method);
    occurrences.push({
      ...baseTx,
      id: parentId + i,
      parentId,
      opDate: nextIso,
      postDate: postDate,
      planned: postDate > todayISO(),
      ts: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      recurrence: '',
      installments: 1
    });
  }
  return occurrences;
}
// Função utilitária para buscar cartão por id (caso não exista)
function getCardById(id) {
  if (!id) return null;
  // Tenta encontrar cartão pelo campo id, ou pelo nome (fallback)
  return cards.find(c => c.id === id || c.name === id) || null;
}

// Função utilitária para formatar data ISO (YYYY-MM-DD)
function formatDateISO(date) {
  if (!(date instanceof Date)) return '';
  return date.toISOString().slice(0,10);
}

// Delete a transaction (with options for recurring rules)
function delTx(id, iso) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;

  // Se NÃO for recorrente (nem ocorrência destacada), exclui direto
  if (!t.recurrence && !t.parentId) {
    transactions = transactions.filter(x => x.id !== id);
    save('tx', transactions);
    renderTable();
    showToast('Operação excluída.', 'success');
    return;
  }

  // Recorrente → abre modal de escopo
  pendingDeleteTxId = id;
  pendingDeleteTxIso = iso || t.opDate;
  deleteRecurrenceModal.classList.remove('hidden');
  if (document.body) document.body.style.overflow = 'hidden';
  if (wrapperEl) wrapperEl.style.overflow = 'hidden';
}

function closeDeleteModal() {
  deleteRecurrenceModal.classList.add('hidden');
  if (document.body) document.body.style.overflow = '';
  if (wrapperEl) wrapperEl.style.overflow = '';
  pendingDeleteTxId = null;
  pendingDeleteTxIso = null;
}

// Modal handlers
closeDeleteRecurrenceModal.onclick = closeDeleteModal;
cancelDeleteRecurrence.onclick = closeDeleteModal;
deleteRecurrenceModal.onclick = e => { if (e.target === deleteRecurrenceModal) closeDeleteModal(); };

deleteSingleBtn.onclick = () => {
  const tx = transactions.find(t => t.id === pendingDeleteTxId);
  if (!tx) { closeDeleteModal(); return; }
  tx.exceptions = tx.exceptions || [];
  tx.exceptions.push(pendingDeleteTxIso);
  save('tx', transactions);
  renderTable();
  closeDeleteModal();
  showToast('Ocorrência excluída!', 'success');
};
deleteFutureBtn.onclick = () => {
  const tx = transactions.find(t => t.id === pendingDeleteTxId);
  if (!tx) { closeDeleteModal(); return; }
  tx.recurrenceEnd = pendingDeleteTxIso;
  save('tx', transactions);
  renderTable();
  closeDeleteModal();
  showToast('Esta e futuras excluídas!', 'success');
};
deleteAllBtn.onclick = () => {
  // Remove both master rule and any occurrences with parentId
  transactions = transactions.filter(t => t.id !== pendingDeleteTxId && t.parentId !== pendingDeleteTxId);
  save('tx', transactions);
  renderTable();
  closeDeleteModal();
  showToast('Todas as recorrências excluídas!', 'success');
};

// Modal Editar Recorrência handlers
function closeEditModal() {
  editRecurrenceModal.classList.add('hidden');
  if (document.body) document.body.style.overflow = '';
  if (wrapperEl) wrapperEl.style.overflow = '';
}
closeEditRecurrenceModal.onclick = closeEditModal;
cancelEditRecurrence.onclick = closeEditModal;
editRecurrenceModal.onclick = e => { if (e.target === editRecurrenceModal) closeEditModal(); };

editSingleBtn.onclick = () => {
  pendingEditMode = 'single';
  closeEditModal();
  editTx(pendingEditTxId);
};
editFutureBtn.onclick = () => {
  pendingEditMode = 'future';
  closeEditModal();
  editTx(pendingEditTxId);
};
editAllBtn.onclick = () => {
  pendingEditMode = 'all';
  closeEditModal();
  editTx(pendingEditTxId);
};
const editTx = id => {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  // Preenche modal com dados para edição
  desc.value   = t.desc;
  val.value    = t.val;
  met.value    = t.method;
  // garante que o bloco Parcelas apareça para métodos de cartão
  met.dispatchEvent(new Event('change'));
  // Preenche recorrência e parcelas e data especial, se em pendingEditMode
  if (pendingEditMode && pendingEditTxIso) {
    date.value = pendingEditTxIso;
  } else {
    date.value = t.opDate;
  }
  recurrence.value = t.recurrence;
  installments.value = t.installments;
  isEditing    = id;
  addBtn.textContent = 'Salvar';
  txModalTitle.textContent = 'Editar operação';
  toggleTxModal();
};

// ===== Hook único para EDITAR: decide entre modal de escopo (recorrente) ou edição direta =====
document.addEventListener('click', (e) => {
  const editEl = e.target.closest('.icon-edit, [data-action="edit"]');
  if (!editEl) return;

  // tenta obter o id a partir do elemento da linha
  const container = editEl.closest('.op-item, .op-line, .swipe-wrapper') || document;
  const txEl = container.querySelector('[data-tx-id]');
  const id = txEl ? Number(txEl.dataset.txId) : null;
  if (!id) return;

  const t = transactions.find(x => x.id === id);
  if (!t) return;

  pendingEditTxId  = id;
  pendingEditTxIso = t.opDate;

  if (t.recurrence || t.parentId) {
    // recorrente → abre modal de escopo de edição
    editRecurrenceModal.classList.remove('hidden');
    if (document.body) document.body.style.overflow = 'hidden';
    if (wrapperEl) wrapperEl.style.overflow = 'hidden';
  } else {
    // não recorrente → vai direto para edição
    editTx(id);
  }

  e.preventDefault();
  e.stopPropagation();
});

function renderTable() {
  sortTransactions();   // ensure data is ordered before rendering
  tbody.innerHTML = '';
  const y = new Date().getFullYear();
  const cur = new Date().getMonth();
  let saldo = startBalance || 0;
  for (let m = 0; m < 12; m++) {
    const hdr = document.createElement('tr');
    hdr.className = 'month-header';
    hdr.dataset.m = m;
    if (m < cur) hdr.classList.add('closed');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = meses[m];
    hdr.appendChild(td);
    hdr.onclick = () => {
      const hide = hdr.classList.toggle('closed');
      document.querySelectorAll(`tr[data-mon='${m}']`).forEach(r => r.style.display = hide ? 'none' : 'table-row');
    };
    tbody.appendChild(hdr);
    for (let d = 1; d <= 31; d++) {
      const date = new Date(y, m, d);
      if (date.getMonth() !== m) break;
      const iso = date.toISOString().slice(0, 10);
      // Só considera transações cujo postDate é este dia
      const dayTx = transactions.filter(t => t.postDate === iso);
      const sum = dayTx.reduce((s, t) => s + t.val, 0);
      saldo += sum;
      const row = document.createElement('tr');
      row.dataset.mon = m;
      row.style.display = m < cur ? 'none' : 'table-row';
      row.innerHTML = `<td>${fmt(date)}</td><td></td><td></td><td${saldo < 0 ? ' class="saldo-neg"' : ''}>${currency(saldo)}</td>`;
      const tdD = row.children[1], tdG = row.children[2];
      if (sum !== 0) { tdG.textContent = currency(sum); tdG.className = sum < 0 ? 'negative' : 'positive'; }
      // Só mostra Dinheiro normalmente
      dayTx.filter(t => t.method === 'Dinheiro').forEach(t => tdD.appendChild(makeLine(t)));
      // --- INÍCIO: plannedOps filtrados e ordenados ---
      const plannedOps = dayTx
        .filter(t => t.planned)
        .sort((a, b) => {
          const dateCmp = a.opDate.localeCompare(b.opDate);
          if (dateCmp !== 0) return dateCmp;
          return (a.ts || '').localeCompare(b.ts || '');
        });
      // --- FIM: plannedOps filtrados e ordenados ---
      const plannedSection = document.createElement('div');
      plannedSection.className = 'planned-cash';
      // ... (continuação do bloco planejados, mantido como estava)
      tbody.appendChild(row);
    }
  }
  // constrói o acordeão de 3 níveis
  renderAccordion();
  updateStickyMonth();
}


// -----------------------------------------------------------------------------
// Acordeão: mês → dia → fatura
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Accordion: month ▶ day ▶ invoice
// Shows every month (Jan–Dec) and every day (01–31),
// past months collapsed by default, current & future months open.
// -----------------------------------------------------------------------------
function renderAccordion() {
  const acc = document.getElementById('accordion');
  if (!acc) return;
  // Salva quais <details> estão abertos antes de recriar
  const openKeys = Array.from(acc.querySelectorAll('details[open]'))
                        .map(d => d.dataset.key || '');
  acc.innerHTML = '';

  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const currency = v => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const curMonth = new Date().getMonth();   // 0‑based

  // Helper para criar o header da fatura do cartão
  function createCardInvoiceHeader(cardName, cardTotalAmount) {
    const invSum = document.createElement('summary');
    // Ajuste de formatação: se valor negativo, exibe como R$ -valor
    let formattedTotal;
    if (cardTotalAmount < 0) {
      formattedTotal = `R$ -${Math.abs(cardTotalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    } else {
      formattedTotal = `R$ ${cardTotalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    invSum.innerHTML = `
      <span class="invoice-label">Fatura – ${cardName}</span>
      <span class="invoice-total">${formattedTotal}</span>
    `;
    return invSum;
  }

  // Helper para calcular a data de vencimento (YYYY-MM-DD) do cartão para determinado mês/ano
  function getCardDueDateKey(card, year, month) {
    // card.due: dia do vencimento
    // month: 0-based
    // year: full year
    const pad = n => String(n).padStart(2, '0');
    return `${year}-${pad(month + 1)}-${pad(card.due)}`;
  }

  // Helper para obter todas as transações de um cartão para o mês/ano da data
  function getAllTransactionsOnCard(cardName, year, month) {
    const txs = [];
    const targetMonth = month;           // 0‑based
    const targetYear  = year;

    // Define a 60‑day window that comfortably spans:
    // • todo o mês alvo
    // • o intervalo entre o fechamento do cartão do mês anterior
    //   e a data de vencimento da fatura do mês alvo.
    const windowStart = new Date(targetYear, targetMonth - 1, 1); // 1.º dia do mês anterior
    const windowEnd   = new Date(targetYear, targetMonth + 1, 0); // último dia do mês seguinte

    // Percorre todas as transações já persistidas
    transactions.forEach(tx => {
      if (tx.method !== cardName) return;

      // 1. Operações únicas --------------------------------------------
      if (!tx.recurrence) {
        const pd = new Date(tx.postDate);
        if (pd.getFullYear() === targetYear && pd.getMonth() === targetMonth) {
          txs.push(tx);
        }
        return;          // done
      }

      // 2. Operações recorrentes ---------------------------------------
      // Gera ocorrências apenas dentro da janela de 60 dias para performance.
      for (let d = new Date(windowStart); d <= windowEnd; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (!occursOn(tx, iso)) continue;

        const pd  = post(iso, cardName);
        const pdDate = new Date(pd);
        if (pdDate.getFullYear() === targetYear && pdDate.getMonth() === targetMonth) {
          txs.push({
            ...tx,
            opDate: iso,           // dia real da compra
            postDate: pd,          // dia de vencimento da fatura
            planned: iso > todayISO()
          });
        }
      }
    });

    // Exibe na fatura apenas transações que já foram executadas
    return txs.filter(t => !t.planned);
  }

  // Helper to get all transactions of a specific ISO date
  const txByDate = iso => {
  const list = [];
  const today = todayISO();

  // ================= NON-RECURRING =================
  transactions.forEach(t => {
    if (t.recurrence) return;            // só não-recorrentes aqui
    if (t.opDate !== iso) return;        // renderiza sempre no opDate

    if (t.method !== 'Dinheiro') {
      // CARTÃO
      if (t.planned) {
        // planejada → aparece no dia lançado (opDate)
        list.push(t);
      } else {
        // executada → NÃO aparece no dia; vai só para a fatura (postDate)
      }
    } else {
      // DINHEIRO → aparece sempre no opDate (planejada ou executada)
      list.push(t);
    }
  });

  // ================= RECURRING RULES =================
  transactions
    .filter(t => t.recurrence)
    .forEach(master => {
      if (!occursOn(master, iso)) return; // materializa somente a ocorrência do dia

      const pd = post(iso, master.method);
      const plannedFlag = iso > today;    // futuro → planejada; passado/hoje → executada

      if (master.method !== 'Dinheiro') {
        // CARTÃO recorrente
        if (plannedFlag) {
          // planejada → aparece no opDate
          list.push({
            ...master,
            opDate: iso,
            postDate: pd,
            planned: true,
            recurrence: ''
          });
        } else {
          // executada → NÃO aparece no dia; vai só para a fatura no postDate
        }
      } else {
        // DINHEIRO recorrente → sempre aparece no opDate (planejada/executada)
        list.push({
          ...master,
          opDate: iso,
          postDate: post(iso, 'Dinheiro'),
          planned: plannedFlag,
          recurrence: ''
        });
      }
    });

  // Ordem cronológica estável (por opDate e ts)
  list.sort((a, b) => {
    const dateCmp = a.opDate.localeCompare(b.opDate);
    if (dateCmp !== 0) return dateCmp;
    return (a.ts || '').localeCompare(b.ts || '');
  });

  return list;
  };

  let runningBalance = startBalance || 0;          // saldo acumulado
  for (let mIdx = 0; mIdx < 12; mIdx++) {
    const nomeMes = new Date(2025, mIdx).toLocaleDateString('pt-BR', { month: 'long' });
    // Build month container
    const mDet = document.createElement('details');
    mDet.className = 'month';
    mDet.dataset.key = `m-${mIdx}`;   // identifica o mês
    const isOpen = mIdx >= curMonth;
    mDet.open = openKeys.includes(mDet.dataset.key) || isOpen;
    // Month total = sum of all tx in that month
    const monthTotal = transactions
      .filter(t => new Date(t.postDate).getMonth() === mIdx)
      .reduce((s,t) => s + t.val, 0);
    // Cabeçalho flutuante dos meses
    const mSum = document.createElement('summary');
    mSum.className = 'month-divider';

    const monthActual = transactions
      .filter(t => {
        const pd = new Date(t.postDate);
        return pd.getMonth() === mIdx && !t.planned;
      })
      .reduce((s, t) => s + t.val, 0);

    const monthPlanned = transactions
      .filter(t => {
        const pd = new Date(t.postDate);
        return pd.getMonth() === mIdx && t.planned;
      })
      .reduce((s, t) => s + t.val, 0);

    let metaLabel = '';
    let metaValue = '';

    if (mIdx < curMonth) { // meses passados
      metaLabel = 'Saldo final:';
      metaValue = currency(monthActual);
    } else if (mIdx === curMonth) { // mês corrente
      metaLabel = 'Saldo atual:';
      metaValue = currency(monthActual);
    } else { // meses futuros
      metaLabel = 'Saldo projetado:';
      metaValue = currency(monthActual + monthPlanned);
    }

    mSum.innerHTML = `
      <div class="month-row">
        <span class="month-name">${nomeMes.toUpperCase()}</span>
      </div>
      <div class="month-meta">
        <span class="meta-label">${metaLabel}</span>
        <span class="meta-value">${metaValue}</span>
      </div>`;

    mDet.appendChild(mSum);

    // Garante o número correto de dias em cada mês
    const daysInMonth = new Date(2025, mIdx + 1, 0).getDate();
    let monthEndBalanceForHeader;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(2025, mIdx, d);
      const iso = dateObj.toISOString().slice(0, 10);
      const dayTx = txByDate(iso);

      // === DAILY IMPACT (novas regras) — TABELA: só cálculo, sem UI ===
const invoicesByCard = {};
const addToGroup = (cardName, tx) => {
  if (!invoicesByCard[cardName]) invoicesByCard[cardName] = [];
  invoicesByCard[cardName].push(tx);
};

// Não-recorrentes de cartão: vencem hoje
transactions.forEach(t => {
  if (t.method !== 'Dinheiro' && !t.recurrence && t.postDate === iso) {
    addToGroup(t.method, t);
  }
});

// Recorrentes de cartão: varre 60 dias p/ trás por ocorrências cujo postDate == hoje
const _scanStart = new Date(iso);
_scanStart.setDate(_scanStart.getDate() - 60);
for (const master of transactions.filter(t => t.recurrence && t.method !== 'Dinheiro')) {
  for (let d2 = new Date(_scanStart); d2 <= new Date(iso); d2.setDate(d2.getDate() + 1)) {
    const occIso = d2.toISOString().slice(0, 10);
    if (!occursOn(master, occIso)) continue;
    const pd = post(occIso, master.method);
    if (pd === iso) {
      addToGroup(master.method, {
        ...master,
        opDate: occIso,
        postDate: iso,
        planned: false,
        recurrence: ''
      });
    }
  }
}

// 1) Dinheiro impacta o saldo no dia da operação
const cashImpact = dayTx
  .filter(t => t.method === 'Dinheiro')
  .reduce((s, t) => s + t.val, 0);

// 2) Cartões impactam somente via total da fatura no vencimento
const invoiceTotals = {};
Object.keys(invoicesByCard).forEach(card => {
  invoiceTotals[card] = invoicesByCard[card].reduce((s, t) => s + t.val, 0);
});
const cardImpact = Object.values(invoiceTotals).reduce((s, v) => s + v, 0);

const dayTotal = cashImpact + cardImpact;
      runningBalance += dayTotal;                           // atualiza saldo acumulado
      const dow = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
      const dDet = document.createElement('details');
      dDet.dataset.has = String(dayTx.length > 0);
      dDet.className = 'day';
      dDet.dataset.key = `d-${iso}`;    // identifica o dia YYYY‑MM‑DD
      dDet.open = openKeys.includes(dDet.dataset.key);
      const today = todayISO();
      if (iso === today) dDet.classList.add('today');
      const dSum = document.createElement('summary');
      dSum.className = 'day-summary';
      const saldoFormatado = runningBalance < 0
        ? `R$ -${Math.abs(runningBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : `R$ ${runningBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const baseLabel = `${String(d).padStart(2,'0')} - ${dow.charAt(0).toUpperCase() + dow.slice(1)}`;
      const hasCardDue = cards.some(card => card.due === d);
      const hasSalary  = dayTx.some(t =>
        SALARY_WORDS.some(w => t.desc.toLowerCase().includes(w))
      );

      const labelParts = [baseLabel];
      if (hasCardDue) labelParts.push('<span class="icon-invoice"></span>');
      if (hasSalary)  labelParts.push('<span class="icon-salary"></span>');

      const labelWithDue = labelParts.join('');
      dSum.innerHTML = `<span>${labelWithDue}</span><span class="day-balance" style="margin-left:auto">${saldoFormatado}</span>`;
      if (runningBalance < 0) dDet.classList.add('negative');
      dDet.appendChild(dSum);

      // Seção de planejados (apenas se houver planejados)
      const plannedOps = dayTx
        .filter(t => t.planned)
        .sort((a, b) => {
          const dateCmp = a.opDate.localeCompare(b.opDate);
          if (dateCmp !== 0) return dateCmp;
          return (a.ts || '').localeCompare(b.ts || '');
        });

      // === INVOICE UI (vencendo hoje) ===
      // Remove restos de render anteriores
      (dDet.querySelectorAll && dDet.querySelectorAll('details.invoice').forEach(n => n.remove()));

      Object.keys(invoicesByCard).forEach(cardName => {
        const det = document.createElement('details');
        det.className = 'invoice';
        det.dataset.pd = iso; // YYYY-MM-DD (vencimento)

        // Cabeçalho padrão da fatura
        det.appendChild(createCardInvoiceHeader(cardName, invoiceTotals[cardName] || 0));

        // Itens da fatura (apenas visual; o saldo usa somente o total)
        invoicesByCard[cardName]
          .filter(t => !t.planned)
          .forEach(t => det.appendChild(makeLine(t)));
        dDet.appendChild(det);
      });
      if (plannedOps.length) {
        const plannedSection = document.createElement('div');
        plannedSection.className = 'planned-cash';
        const plannedHeader = document.createElement('div');
        plannedHeader.className = 'planned-header';
        plannedHeader.textContent = 'Planejados:';
        plannedSection.appendChild(plannedHeader);
        const plannedList = document.createElement('ul');
        plannedList.className = 'planned-list';
        plannedSection.appendChild(plannedList);

        plannedOps.forEach(t => {
          const li = document.createElement('li');
          li.appendChild(makeLine(t));
          plannedList.appendChild(li);
        });

        dDet.appendChild(plannedSection);
      }


      // Seção de executados em dinheiro (apenas se houver)
      const cashExec = dayTx.filter(t => t.method.toLowerCase() === 'dinheiro' && !t.planned);
      if (cashExec.length) {
        const executedCash = document.createElement('div');
        executedCash.className = 'executed-cash';
        const execHeader = document.createElement('div');
        execHeader.className = 'executed-header';
        execHeader.textContent = 'Executados:';
        executedCash.appendChild(execHeader);
        const execList = document.createElement('ul');
        execList.className = 'executed-list';

        cashExec.forEach(t => {
          const li = document.createElement('li');
          li.appendChild(makeLine(t));
          execList.appendChild(li);
        });

        executedCash.appendChild(execList);
        dDet.appendChild(executedCash);
      }

      mDet.appendChild(dDet);
    }

// --- Atualiza o preview do mês com base no último dia visível ---
monthEndBalanceForHeader = runningBalance; // saldo do último dia do mês
const headerPreviewLabel = (mIdx < curMonth) ? 'Saldo final' : 'Saldo planejado';

    // Atualiza o summary do mês (cabeçalho do accordion)
    const labelEl = mSum.querySelector('.meta-label');
    const valueEl = mSum.querySelector('.meta-value');
    if (labelEl) labelEl.textContent = headerPreviewLabel + ':';
    if (valueEl) valueEl.textContent = currency(monthEndBalanceForHeader);

    // (month summary já foi adicionado no topo; não adicionar novamente)
    acc.appendChild(mDet);

    // Cria linha meta como elemento independente
    const metaLine = document.createElement('div');
    metaLine.className = 'month-meta';
    const previewLabel = (mIdx < curMonth) ? 'Saldo final:' : 'Saldo planejado:';
    metaLine.innerHTML = `<span>| ${previewLabel}</span><strong>${currency(monthEndBalanceForHeader)}</strong>`;
    // Clique em "Saldo final" também expande/colapsa o mês
    metaLine.addEventListener('click', () => {
      mDet.open = !mDet.open;
    });

    // Se o mês estiver fechado (collapsed), exibe metaLine abaixo de mDet
    if (!mDet.open) {
      acc.appendChild(metaLine);
    }

    // Atualiza visibilidade ao expandir/fechar
    mDet.addEventListener('toggle', () => {
      if (mDet.open) {
        if (metaLine.parentElement === acc) {
          acc.removeChild(metaLine);
        }
      } else {
        acc.insertBefore(metaLine, mDet.nextSibling);
      }
    });
  }
  updateStickyMonth();
}

function initStart() {
  const showStart = startBalance === null && transactions.length === 0;
  // exibe ou oculta todo o container de saldo inicial
  startContainer.style.display = showStart ? 'block' : 'none';
  dividerSaldo.style.display = showStart ? 'block' : 'none';
  // (mantém linha antiga para compatibilidade)
  startGroup.style.display = showStart ? 'flex' : 'none';
  // mantém o botão habilitado; a função addTx impede lançamentos
  addBtn.classList.toggle('disabled', showStart);
}
setStartBtn.onclick=()=>{const v=parseFloat(startInput.value);if(isNaN(v)){alert('Valor inválido');return;}startBalance=v;cacheSet('startBal', v);save('startBal',v);initStart();renderTable();};
resetBtn.onclick=()=>{if(!confirm('Resetar tudo?'))return;transactions=[];cards=[{name:'Dinheiro',close:0,due:0}];startBalance=null;cacheSet('tx', []);cacheSet('cards', [{name:'Dinheiro',close:0,due:0}]);cacheSet('startBal', null);save('tx',transactions);save('cards',cards);save('startBal',null);refreshMethods();renderCardList();initStart();renderTable();};

addCardBtn.onclick=addCard;addBtn.onclick=addTx;
openCardBtn.onclick = () => {
  if (document.body) document.body.style.overflow = 'hidden';   // bloqueia scroll de fundo
  if (wrapperEl) wrapperEl.style.overflow = 'hidden';      // bloqueia scroll no container principal
  cardModal.classList.remove('hidden');
};
closeCardModal.onclick = () => {
  if (document.body) document.body.style.overflow = '';
  if (wrapperEl) wrapperEl.style.overflow = '';
  cardModal.classList.add('hidden');
};
cardModal.onclick = e => {
  if (e.target === cardModal) {
    if (document.body) document.body.style.overflow = '';
    if (wrapperEl) wrapperEl.style.overflow = '';
    cardModal.classList.add('hidden');
  }
};

 (async () => {
    // Instancia todos os botões “Adicionar” a partir do template
  document.querySelectorAll('[data-add-btn-container]').forEach(container => {
    const tpl = document.getElementById('add-button-template');
    const btn = tpl.content.cloneNode(true).firstElementChild;
    const targetId = container.dataset.targetId;
    if (targetId) btn.id = targetId;
    container.appendChild(btn);
  });
  date.value = todayISO();
  // Renderiza imediatamente com dados em cache
  refreshMethods();
  renderCardList();
  initStart();
  renderTable();
  // exibe conteúdo após carregar dados localmente
  document.querySelector('.wrapper').classList.remove('app-hidden');

  const [liveTx, liveCards, liveBal] = await Promise.all([
    load('tx', []),
    load('cards', cards),
    load('startBal', startBalance)
  ]);

  const hasLiveTx    = Array.isArray(liveTx)    ? liveTx.length    > 0 : liveTx    && Object.keys(liveTx).length    > 0;
  const hasLiveCards = Array.isArray(liveCards) ? liveCards.length > 0 : liveCards && Object.keys(liveCards).length > 0;

  // Converte objeto → array se necessário
  const fixedTx = Array.isArray(liveTx) ? liveTx : Object.values(liveTx || {});

  if (hasLiveTx && JSON.stringify(fixedTx) !== JSON.stringify(transactions)) {
    transactions = fixedTx;
    cacheSet('tx', transactions);
    renderTable();
  }
  if (hasLiveCards && JSON.stringify(liveCards) !== JSON.stringify(cards)) {
    cards = liveCards;
    if(!cards.some(c=>c.name==='Dinheiro'))cards.unshift({name:'Dinheiro',close:0,due:0});
    cacheSet('cards', cards);
    refreshMethods(); renderCardList(); renderTable();
  }
  if (liveBal !== startBalance) {
    startBalance = liveBal;
    cacheSet('startBal', startBalance);
    initStart(); renderTable();
  }
  // exibe versão
  const verEl = document.getElementById('version');
  if (verEl) verEl.textContent = `v${APP_VERSION}`;
  // se online, tenta esvaziar fila pendente
  if (navigator.onLine) flushQueue();
})();

// Service Worker registration and sync event (disabled in mock mode)
if (!USE_MOCK && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'sync-tx') flushQueue();
  });
}
// Planejados modal handlers
function renderPlannedModal() {
  // Lista completa, sem filtrar datas vencidas; marca .overdue quando opDate < hoje
  if (!plannedList) return;
  plannedList.innerHTML = '';

  const today = todayISO();

  // ---------- Coleta de ocorrências planejadas ----------
  let occur = [];

  transactions.forEach(tx => {
    // 1) Operações únicas com planned=true
  if (!tx.recurrence && tx.planned) {
    // Se já existe operação equivalente (mesma data, descrição e valor) executada,
    // não exibe no Planejados.
  const isDone = transactions.some(o =>
    o.id !== tx.id &&
    !o.planned &&            // executada
    !o.recurrence &&         // simples, não-recorrente
    o.opDate === tx.opDate &&
    o.desc === tx.desc &&
    o.val  === tx.val
  );
  if (!isDone) occur.push(tx);
  return;
}

    // 2) Operações recorrentes – gera até 90 d à frente
    if (tx.recurrence) {
      const end = new Date();
      end.setDate(end.getDate() + 90);

      const scanStart = new Date(tx.opDate);
      for (let d = new Date(scanStart); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);

        if (!occursOn(tx, iso)) continue;
        if (tx.exceptions && tx.exceptions.includes(iso)) continue;
        if (tx.recurrenceEnd && iso >= tx.recurrenceEnd) continue;

        // Já editado/executado?
        const detached = transactions.some(t => t.parentId === tx.id && t.opDate === iso);
        if (detached) continue;

        occur.push({
          ...tx,
          opDate: iso,
          postDate: post(iso, tx.method),
          planned: true
        });
      }
    }
  });

  // --- Remove ocorrências que já foram executadas --------------------
occur = occur.filter(o =>
  !transactions.some(t =>
    !t.planned &&                 // operação já executada
    t.opDate === o.opDate &&
    t.desc   === o.desc &&
    t.val    === o.val &&
    t.method === o.method
  )
);

  // Ordena por data da compra
  occur.sort((a, b) => a.opDate.localeCompare(b.opDate));

  // ---------- Renderização ----------
  let currentDate = '';
  occur.forEach(t => {
    if (t.opDate !== currentDate) {
      currentDate = t.opDate;
      const sub = document.createElement('div');
      sub.className = 'subheader';
      const dObj = new Date(currentDate + 'T00:00');
      let dateLabel = dObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      dateLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);   // capitaliza dia da semana
      sub.textContent = dateLabel;
      plannedList.appendChild(sub);
    }

    // create <li class="planned-cash"> card instead of a <div>
const li = document.createElement('li');
li.className = 'planned-cash';

// row: checkbox + description + value
const row = document.createElement('div');
row.className = 'op-main';

// left side: checkbox + description
const left = document.createElement('div');
left.className = 'op-left';

const chk = document.createElement('input');
chk.type = 'checkbox';
chk.className = 'plan-check';
chk.name = 'planned';
chk.onchange = () => togglePlanned(t.id, t.opDate);
left.appendChild(chk);

const descNode = document.createElement('span');
descNode.textContent = t.desc;
left.appendChild(descNode);

// right side: value, with sign colouring
const right = document.createElement('div');
right.className = 'op-right';

const value = document.createElement('span');
value.className = 'value';
value.textContent = `R$ ${(t.val < 0 ? '-' : '')}${Math.abs(t.val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
if (t.val < 0) {
  value.classList.add('negative');
} else {
  value.classList.add('positive');
}
right.appendChild(value);

row.appendChild(left);
row.appendChild(right);
li.appendChild(row);

// method label (below the row)
const methodDiv = document.createElement('div');
methodDiv.className = 'method';
methodDiv.textContent = t.method === 'Dinheiro' ? 'Dinheiro' : `Cartão ${t.method}`;
li.appendChild(methodDiv);

plannedList.appendChild(li);
  });
}

// Ensure Planejados modal open/close handlers exist exactly once
if (!window.plannedHandlersInit) {
  openPlannedBtn.onclick = () => {
    document.body.style.overflow = 'hidden';
    if (wrapperEl) wrapperEl.style.overflow = 'hidden';
    plannedModal.classList.remove('hidden');
    renderPlannedModal();         // Atualiza sempre ao abrir
  };
  closePlannedModal.onclick = () => {
    document.body.style.overflow = '';
    if (wrapperEl) wrapperEl.style.overflow = '';
    plannedModal.classList.add('hidden');
  };
  plannedModal.onclick = e => {
    if (e.target === plannedModal) {
      document.body.style.overflow = '';
      if (wrapperEl) wrapperEl.style.overflow = '';
      plannedModal.classList.add('hidden');
    }
  };
  window.plannedHandlersInit = true;
}
// Initialize swipe for operations (op-line)
initSwipe(document.body, '.swipe-wrapper', '.swipe-actions', '.op-line', 'opsSwipeInit');
// Initialize swipe for card list (card-line)
initSwipe(cardList,      '.swipe-wrapper', '.swipe-actions', '.card-line', 'cardsSwipeInit');

