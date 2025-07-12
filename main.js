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
import { openDB } from 'https://unpkg.com/idb?module';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-app.js";

import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-auth.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.3.1/firebase-database.js";

// --- Firebase configuração de PRODUÇÃO (inline) ---
const firebaseConfig = {
  apiKey: "AIzaSyATGZtBlnSPnFtVgTqJ_E0xmBgzLTmMkI0",
  authDomain: "gastosweb-e7356.firebaseapp.com",
  databaseURL: "https://gastosweb-e7356-default-rtdb.firebaseio.com",
  projectId: "gastosweb-e7356",
  storageBucket: "gastosweb-e7356.firebasestorage.app",
  messagingSenderId: "519966772782",
  appId: "1:519966772782:web:9ec19e944e23dbe9e899bf",
  measurementId: "G-JZYYGSJKTZ"
};
// --------------------------------------------------

// Configuração Firebase importada do arquivo de produção

let PATH;

// Flag for mocking data while working on UI.  
// Switch to `false` to reconnect to production Firebase.
const USE_MOCK = false;               // usar banco real para testes
const APP_VERSION = '1.2.0';
let save, load;
let firebaseDb;

if (!USE_MOCK) {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  firebaseDb = db;
  PATH = 'orcamento365';
  const auth = getAuth(app);
  await signInAnonymously(auth);   // garante auth.uid antes dos gets/sets
  save = (k, v) => set(ref(db, `${PATH}/${k}`), v);
  load = async (k, d) => {
    const s = await get(ref(db, `${PATH}/${k}`));
    return s.exists() ? s.val() : d;
  };
} else {
  PATH = 'mock_365'; // namespace no localStorage
  save = (k, v) => localStorage.setItem(`${PATH}_${k}`, JSON.stringify(v));
  load = async (k, d) =>
    JSON.parse(localStorage.getItem(`${PATH}_${k}`)) ?? d;
}

// Cache local (LocalStorage) p/ boot instantâneo
const cacheGet  = (k, d) => JSON.parse(localStorage.getItem(`cache_${k}`)) ?? d;
const cacheSet  = (k, v) => localStorage.setItem(`cache_${k}`, JSON.stringify(v));

let transactions  = cacheGet('tx', []);
// ---- Migration: normalize legacy transactions ----
transactions = transactions.map(t => ({
  ...t,
  recurrence: t.recurrence ?? '',
  installments: t.installments ?? 1,
  parentId: t.parentId ?? null
}));
cacheSet('tx', transactions);
let cards         = cacheGet('cards', [{name:'Dinheiro',close:0,due:0}]);
let startBalance  = cacheGet('startBal', null);
const $=id=>document.getElementById(id);
const tbody=document.querySelector('#dailyTable tbody');
const wrapperEl = document.querySelector('.wrapper');
const txModalTitle = document.querySelector('#txModal h2');

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

const stickyMonth     = document.createElement('div');
stickyMonth.className = 'sticky-month';
stickyMonth.style.top = HEADER_OFFSET + 'px';
document.body.appendChild(stickyMonth);

// Recalcula altura do header em rotação / resize
window.addEventListener('resize', () => {
  const h = headerEl.getBoundingClientRect().height;
  stickyMonth.style.top = h + 'px';
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
    stickyMonth.textContent = label;
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

const post=(iso,m)=>{if(m==='Dinheiro')return iso;const c=cards.find(x=>x.name===m);if(!c)return iso;const [y,mo,d]=iso.split('-').map(Number);let mm=mo,yy=y;if(d>c.close){mm++;if(mm===13){mm=1;yy++;}}return yy+'-'+String(mm).padStart(2,'0')+'-'+String(c.due).padStart(2,'0');};

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

// Recorrência e Parcelas
const recurrence = $('recurrence');
const parcelasBlock = $('parcelasBlock');
const installments = $('installments');

// --- Parcelamento desativado temporariamente ---
parcelasBlock.classList.add('hidden');
installments.value = '1';
installments.disabled = true;

// Populate installments select with options 1–24 if empty
if (installments && installments.children.length === 0) {
  for (let i = 1; i <= 24; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${i}x`;
    installments.appendChild(opt);
  }
}
/*
// Exibe parcelamento somente para cartão
met.onchange = () => {
  const isCash = met.value.toLowerCase() === 'dinheiro';
  parcelasBlock.classList.toggle('hidden', isCash);
  if (isCash) installments.value = '1';
};
*/
// Se selecionar recorrência, zera parcelas
recurrence.onchange = () => {
  if (recurrence.value !== '') installments.value = '1';
};
/*
// Se escolher parcelas >1, desabilita recorrência
installments.onchange = () => {
  if (parseInt(installments.value) > 1) recurrence.value = '';
};
*/
let isEditing = null;
const cardName=$('cardName'),cardClose=$('cardClose'),cardDue=$('cardDue'),addCardBtn=$('addCardBtn'),cardList=$('cardList');
const startGroup=$('startGroup'),startInput=$('startInput'),setStartBtn=$('setStartBtn'),resetBtn=$('resetData');
resetBtn.style.display = 'none';
const startContainer = document.querySelector('.start-container');
const dividerSaldo = document.getElementById('dividerSaldo');

const showToast = (msg, type = 'error') => {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('success', 'error');
  t.classList.add('show', type);
  setTimeout(() => t.classList.remove('show', type), 3000);
};

const togglePlanned = (id, iso) => {
  const master = transactions.find(x => x.id === id);
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
        postDate: iso,
        recurrence: '',
        installments: 1,
        planned: false,
        ts: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };
      transactions.push(execTx);
    }
  } else {
    master.planned = !master.planned;
  }
  save('tx', transactions);
  renderTable();
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

      const editBtn = document.createElement('button');
      editBtn.className = 'icon edit';
      editBtn.innerHTML = '✏️';
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

      const delBtn = document.createElement('button');
      delBtn.className = 'icon danger delete';
      delBtn.innerHTML = '🗑';
      delBtn.addEventListener('click', () => {
        if (!confirm('Excluir cartão?')) return;
        cards = cards.filter(x => x.name !== c.name);
        save('cards', cards);
        refreshMethods();
        renderCardList();
        renderTable();
      });
      actions.appendChild(delBtn);

      const line = document.createElement('div');
      line.className = 'card-line';
      line.innerHTML = `
        <div>
          <div class="card-name">${c.name}</div>
          <div class="card-dates">Fechamento: ${c.close} | Vencimento: ${c.due}</div>
        </div>`;

      wrap.appendChild(actions);
      wrap.appendChild(line);
      li.appendChild(wrap);
      cardList.appendChild(li);
    });

  if (!window.cardsSwipeInit) {
    let startX = 0;
    cardList.addEventListener('touchstart', e => {
      const wrap = e.target.closest('.swipe-wrapper');
      if (!wrap) return;
      startX = e.touches[0].clientX;
      wrap.dataset.startX = startX;
    }, { passive: true });

    cardList.addEventListener('touchend', e => {
      const wrap = e.target.closest('.swipe-wrapper');
      if (!wrap) return;
      const start = parseFloat(wrap.dataset.startX || 0);
      const diff  = start - e.changedTouches[0].clientX;
      const line  = wrap.querySelector('.card-line');
      const actW  = wrap.querySelector('.swipe-actions').offsetWidth;
      // Close other open swipes
      document.querySelectorAll('.card-line').forEach(l => {
        if (l !== line) {
          l.style.transform = 'translateX(0)';
        }
      });
      if (diff > 30) {
        line.style.transform = `translateX(-${actW}px)`;
      } else if (diff < -30) {
        line.style.transform = 'translateX(0)';
      }
    }, { passive: true });

    window.cardsSwipeInit = true;
  }
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
  editBtn.textContent = '✏️';
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
  delBtn.textContent = '🗑';
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
    chk.onchange = () => togglePlanned(t.id, t.postDate);
    left.appendChild(chk);
  }
  const descNode = document.createElement('span');
  descNode.textContent = t.desc;
  left.appendChild(descNode);
  // mark recurring transactions (master or detached occurrence) with an icon
  if (t.recurrence || t.parentId) {
    const recIcon = document.createElement('span');
    recIcon.className = 'recurring-icon';
    recIcon.textContent = '🔄';
    recIcon.title = 'Recorrência';
    left.appendChild(recIcon);
  }
  const right = document.createElement('div');
  right.className = 'op-right';
  const value = document.createElement('span');
  value.className = 'value';
  value.textContent = `R$ ${(t.val < 0 ? '-' : '')}${Math.abs(t.val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
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
// Operations swipe handler (inicialização única)
if (!window.opsSwipeInit) {
  let startXOp = 0;
  document.body.addEventListener('touchstart', e => {
    const wrap = e.target.closest('.swipe-wrapper');
    if (!wrap) return;
    startXOp = e.touches[0].clientX;
    wrap.dataset.startX = startXOp;
  }, { passive: true });

  document.body.addEventListener('touchend', e => {
    const wrap = e.target.closest('.swipe-wrapper');
    if (!wrap) return;
    const start = parseFloat(wrap.dataset.startX || 0);
    const diff = start - e.changedTouches[0].clientX;
    const line = wrap.querySelector('.op-line');
    const actW = wrap.querySelector('.swipe-actions').offsetWidth;
    // Close other open swipes
    document.querySelectorAll('.op-line').forEach(l => {
      if (l !== line) l.style.transform = 'translateX(0)';
    });
    if (diff > 30) {
      line.style.transform = `translateX(-${actW}px)`;
    } else if (diff < -30) {
      line.style.transform = 'translateX(0)';
    }
  }, { passive: true });

  window.opsSwipeInit = true;
}

function addCard(){const n=cardName.value.trim(),cl=+cardClose.value,du=+cardDue.value;if(!n||cl<1||cl>31||du<1||du>31||cl>=du||cards.some(c=>c.name===n)){alert('Dados inválidos');return;}cards.push({name:n,close:cl,due:du});cacheSet('cards', cards);save('cards',cards);refreshMethods();renderCardList();cardName.value='';cardClose.value='';cardDue.value='';}

async function addTx() {
  // Modo edição?
  if (isEditing !== null) {
    const t = transactions.find(x => x.id === isEditing);
    const newDesc    = desc.value.trim();
    const newVal     = parseFloat(val.value);
    const newMethod  = met.value;
    const newOpDate  = date.value;
    const newPostDate = post(newOpDate, newMethod);

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
          recurrence: t.recurrence,
          installments: 1,
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

  // Lê opções de recorrência e parcelas
  const recur = recurrence.value;
  const inst  = parseInt(installments.value, 10) || 1;

  const baseTx = {
    id: Date.now(),
    parentId: null,
    desc: d,
    val: v,
    method: m,
    opDate: iso,
    postDate: post(iso, m),
    recurrence: recur,
    installments: inst,
    planned: iso > todayISO(),
    ts: new Date().toISOString(),
    modifiedAt: new Date().toISOString()
  };

  // Gera lote de transações conforme tipo
  let batch = [];
  if (inst > 1) {
    batch = generateInstallments(baseTx);
  } else if (recur) {
    batch = [baseTx];   // salva só a regra de recorrência
  } else {
    batch = [baseTx];
  }

  // Adiciona e salva
  transactions.push(...batch);
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

// Função auxiliar para gerar parcelas
function generateInstallments(baseTx) {
  const batch = [];
  const n = baseTx.installments || 1;
  const parentId = baseTx.id;
  const val = baseTx.val;
  const m = baseTx.method;
  const opDate = baseTx.opDate;
  const postDate0 = post(opDate, m);
  const planned0 = opDate > todayISO();
  for (let i = 0; i < n; i++) {
    // Calcula data da parcela i
    let opDateI;
    if (m === 'Dinheiro') {
      // Parcelas em dinheiro: cada parcela em meses seguintes
      const d = new Date(opDate);
      d.setMonth(d.getMonth() + i);
      opDateI = d.toISOString().slice(0, 10);
    } else {
      // Parcelas em cartão: cada parcela na próxima fatura
      const d = new Date(opDate);
      d.setMonth(d.getMonth() + i);
      // Ajusta dia para o fechamento do cartão se necessário
      opDateI = d.toISOString().slice(0, 10);
    }
    batch.push({
      ...baseTx,
      id: parentId + i,
      parentId,
      val: val,
      opDate: opDateI,
      postDate: post(opDateI, m),
      planned: opDateI > todayISO(),
      ts: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      recurrence: '',
      installments: n
    });
  }
  return batch;
}

// Função auxiliar para gerar recorrências
function generateOccurrences(baseTx) {
  const recur = baseTx.recurrence;
  if (!recur) return [];
  const occurrences = [];
  const parentId = baseTx.id;
  // Limita a 12 ocorrências (exemplo: 1 ano) para evitar explosão
  let n = 0, max = 12;
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
    occurrences.push({
      ...baseTx,
      id: parentId + i,
      parentId,
      opDate: nextIso,
      postDate: post(nextIso, baseTx.method),
      planned: nextIso > todayISO(),
      ts: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      recurrence: '',
      installments: 1
    });
  }
  return occurrences;
}

// Delete a transaction (with options for recurring rules)
function delTx(id, iso) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  pendingDeleteTxId = id;
  pendingDeleteTxIso = iso;
  // open the half-sheet
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

function renderTable(){
  tbody.innerHTML='';
  const y=new Date().getFullYear();const cur=new Date().getMonth();let saldo=startBalance||0;
  for(let m=0;m<12;m++){
    const hdr=document.createElement('tr');hdr.className='month-header';hdr.dataset.m=m;if(m<cur)hdr.classList.add('closed');
    const td=document.createElement('td');td.colSpan=4;td.textContent=meses[m];hdr.appendChild(td);
    hdr.onclick=()=>{const hide=hdr.classList.toggle('closed');document.querySelectorAll(`tr[data-mon='${m}']`).forEach(r=>r.style.display=hide?'none':'table-row');};
    tbody.appendChild(hdr);
    for(let d=1;d<=31;d++){
      const date=new Date(y,m,d);if(date.getMonth()!==m)break;
      const iso=date.toISOString().slice(0,10);const dayTx=transactions.filter(t=>t.postDate===iso);const sum=dayTx.reduce((s,t)=>s+t.val,0);saldo+=sum;
      const row=document.createElement('tr');row.dataset.mon=m;row.style.display=m<cur?'none':'table-row';
      row.innerHTML=`<td>${fmt(date)}</td><td></td><td></td><td${saldo<0?' class="saldo-neg"':''}>${currency(saldo)}</td>`;
      const tdD=row.children[1],tdG=row.children[2];
      if(sum!==0){tdG.textContent=currency(sum);tdG.className=sum<0?'negative':'positive';}
      dayTx.filter(t=>t.method==='Dinheiro').forEach(t=>tdD.appendChild(makeLine(t)));
      const grp={};dayTx.filter(t=>t.method!=='Dinheiro').forEach(t=>(grp[t.method]=grp[t.method]||[]).push(t));
      Object.keys(grp).forEach(card=>{const det=document.createElement('details');det.className='invoice';const sm=document.createElement('summary');sm.textContent='Fatura '+card;det.appendChild(sm);grp[card].forEach(t=>{det.appendChild(makeLine(t));const ts=document.createElement('div');ts.className='op-ts';ts.textContent=t.ts.slice(5,16).replace('T',' ');det.appendChild(ts);});tdD.appendChild(det);});
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

  // Helper to get all transactions of a specific ISO date
  const txByDate = iso => {
    const today = todayISO();
    // direct transactions (non-recurring, non-installment)
    const dayList = transactions.filter(t =>
      t.postDate === iso && !t.recurrence && t.installments === 1
    );
    // add dynamically generated occurrences with correct planned flag
    transactions.filter(t => t.recurrence).forEach(master => {
      if (occursOn(master, iso)) {
        const isPlanned = iso > today;
        dayList.push({ ...master, postDate: iso, planned: isPlanned });
      }
    });
    return dayList;
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
    // Cria summary estilizado como linha do mês
    const mSum = document.createElement('summary');
    mSum.className = 'month-divider';
    mSum.innerHTML = `${nomeMes.toUpperCase()} <hr>`;
    mDet.appendChild(mSum);

    // Garante o número correto de dias em cada mês
    const daysInMonth = new Date(2025, mIdx + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(2025, mIdx, d);
      const iso = dateObj.toISOString().slice(0, 10);
      const dayTx = txByDate(iso);

      const dayTotal = dayTx.reduce((s,t)=>s + t.val,0);
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
      if (hasCardDue) labelParts.push('💳');
      if (hasSalary)  labelParts.push('💰');

      const labelWithDue = labelParts.join(' | ');
      dSum.innerHTML = `<span>${labelWithDue}</span><span class="day-balance" style="margin-left:auto">${saldoFormatado}</span>`;
      if (runningBalance < 0) dDet.classList.add('negative');
      dDet.appendChild(dSum);

      // Group card operations by method (case-insensitive for 'Dinheiro')
      const cashOps = dayTx.filter(t => t.method.toLowerCase() === 'dinheiro');
      const cardGroups = {};
      dayTx.filter(t => t.method.toLowerCase() !== 'dinheiro')
           .forEach(t => (cardGroups[t.method] = cardGroups[t.method] || []).push(t));

      // Seção de planejados (apenas se houver planejados)
      const plannedOps = dayTx.filter(t => t.planned);
      if (plannedOps.length) {
        const plannedSection = document.createElement('div');
        plannedSection.className = 'planned-section';
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

      // Fatura (executados no cartão)
      Object.entries(cardGroups).forEach(([card, list]) => {
        const invDet = document.createElement('details');
        invDet.className = 'invoice';
        const invSum = document.createElement('summary');
        const invTotal = list.reduce((s,t)=>s + t.val,0);
        invSum.innerHTML = `
          <span class="invoice-label">💳 Fatura - ${card}</span>
          <span class="invoice-total">${currency(invTotal)}</span>
        `;
        invDet.appendChild(invSum);
        const invExec    = list.filter(t => !t.planned);
        if (invExec.length) {
          const execList = document.createElement('ul');
          execList.className = 'executed-list';
          invExec.forEach(t => {
            const li = document.createElement('li');
            li.appendChild(makeLine(t));
            execList.appendChild(li);
          });
          invDet.appendChild(execList);
        }
        dDet.appendChild(invDet);
      });

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
    // (month summary já foi adicionado no topo; não adicionar novamente)
    acc.appendChild(mDet);

    // Cria linha meta como elemento independente
    const metaLine = document.createElement('div');
    metaLine.className = 'month-meta';

    let label;
    if (mIdx < curMonth) label = 'Saldo final:';
    else if (mIdx === curMonth) label = 'Saldo atual:';
    else label = 'Saldo projetado:';

    metaLine.innerHTML = `<span>| ${label}</span><strong>${currency(runningBalance)}</strong>`;
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
function togglePlannedModal() {
  const isOpening = plannedModal.classList.contains('hidden');
  if (isOpening) {
    renderPlannedModal();
    if (document.body) document.body.style.overflow = 'hidden';
    if (wrapperEl) wrapperEl.style.overflow = 'hidden';
  } else {
    if (document.body) document.body.style.overflow = '';
    if (wrapperEl) wrapperEl.style.overflow = '';
  }
  plannedModal.classList.toggle('hidden');
}
openPlannedBtn.onclick = togglePlannedModal;
closePlannedModal.onclick = togglePlannedModal;
plannedModal.onclick = e => { if (e.target === plannedModal) togglePlannedModal(); };
// Block scroll behind modal but allow scrolling inside it
plannedModal.addEventListener('touchmove', e => {
  if (e.target === plannedModal) e.preventDefault();
}, { passive: false });
plannedModal.addEventListener('wheel', e => {
  if (e.target === plannedModal) e.preventDefault();
}, { passive: false });

function renderPlannedModal() {
  plannedList.innerHTML = '';
  const grouped = {};
  const today = new Date();
  const todayIso = todayISO();

  // Look ahead for the next year (365 days)
  for (let i = 1; i <= 365; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    const iso  = `${yyyy}-${mm}-${dd}`;
    const dayItems = [];

    // 1. one-off planned transactions
    transactions
      .filter(t => !t.recurrence && t.planned && t.opDate === iso)
      .forEach(t => dayItems.push(t));

    // 2. dynamic recurring occurrences
    transactions
      .filter(t => t.recurrence)
      .forEach(master => {
        if (occursOn(master, iso)) {
          dayItems.push({ ...master, opDate: iso, postDate: iso, planned: true });
        }
      });

    if (dayItems.length) {
      grouped[iso] = dayItems;
    }
  }

  Object.keys(grouped)
    .sort()
    .forEach(iso => {
      const [y, mo, da] = iso.split('-').map(Number);
      const header = document.createElement('div');
      header.className = 'subheader';
      header.textContent = `${String(da).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${String(y % 100).padStart(2, '0')}`;
      plannedList.appendChild(header);

      grouped[iso].forEach(t => {
        const item = document.createElement('div');
        item.className = 'planned-item';
        const row = document.createElement('div');
        row.className = 'planned-row';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.name = 'plannedModal';
        chk.checked = false;
        chk.onchange = () => { togglePlanned(t.id, t.opDate); renderPlannedModal(); renderTable(); };
        row.appendChild(chk);

        const descEl = document.createElement('span');
        descEl.className = 'desc';
        descEl.textContent = t.desc;
        if (t.recurrence) {
          const recIcon = document.createElement('span');
          recIcon.className = 'recurring-icon';
          recIcon.textContent = '🔄';
          recIcon.title = 'Recorrência';
          descEl.appendChild(recIcon);
        }
        row.appendChild(descEl);

        const valEl = document.createElement('span');
        valEl.className = 'value';
        valEl.textContent = currency(t.val);
        row.appendChild(valEl);
        item.appendChild(row);

        const methodDiv = document.createElement('div');
        methodDiv.className = 'method';
        methodDiv.textContent = t.method;
        item.appendChild(methodDiv);

        plannedList.appendChild(item);
      });
    });
}
// Online/offline indicator
const offlineIndicator = document.getElementById('offlineIndicator');
window.addEventListener('online',  () => offlineIndicator.hidden = true);
window.addEventListener('offline', () => offlineIndicator.hidden = false);
offlineIndicator.hidden = navigator.onLine;

// IndexedDB queue for offline transactions
async function getDb() {
  return openDB('gastos-offline', 1, {
    upgrade(db) {
      db.createObjectStore('tx', { keyPath: 'id' });
    }
  });
}
async function queueTx(tx) {
  const db = await getDb();
  await db.put('tx', tx);
  updatePendingBadge();
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-tx');
    } catch (e) {
      console.warn('[Sync]', e);   // tolera problemas com SW
    }
  }
}
async function flushQueue() {
  if (USE_MOCK) return;  // skip real DB in mock mode
  const spinStart = Date.now();     // placeholder for min‑spin

  const db = await getDb();
  const all = await db.getAll('tx');
  for (const tx of all) {
    try {
      const txRef = ref(firebaseDb, `${PATH}/tx/${tx.id}`);
      const snap  = await get(txRef);
      if (!snap.exists() || snap.val().modifiedAt <= tx.modifiedAt) {
        // Ensure no undefined fields before syncing
        tx.recurrence   = tx.recurrence   ?? '';
        tx.installments = tx.installments ?? 1;
        tx.parentId     = tx.parentId     ?? null;
        await set(txRef, tx);
      }
      await db.delete('tx', tx.id);
    } catch(e) {
      console.error('[SYNC]', e);
    }
  }

  // garante pelo menos 1s de animação
  const elapsed = Date.now() - spinStart;
  const minSpin = 1000;
  if (elapsed < minSpin) {
    await new Promise(res => setTimeout(res, minSpin - elapsed));
  }

  updatePendingBadge();
}

function updatePendingBadge() {
  getDb().then(db => db.getAll('tx')
    .then(all => {
      const offIc   = document.getElementById('offlineIndicator');
      const count = all.length;
      offIc.textContent = count ? `📴 ${count}` : '📴';
    }));
}
// dispara badge no arranque e após cada sync
updatePendingBadge();


// Prevent background scrolling on wheel when card modal is open
document.addEventListener('wheel', e => {
  if (!cardModal.classList.contains('hidden')) {
    e.preventDefault();
  }
}, { passive: false });