import { updateAdHocBudget } from '../services/budgetEditor.js';
import { safeFmtCurrency, safeParseCurrency, safeFmtNumber } from '../utils/safeFormat.js';
import { setupTransactionForm } from './transactionForm.js';

function ensureStyles(){
  if (document.getElementById('budget-edit-styles')) return;
  const st = document.createElement('style');
  st.id = 'budget-edit-styles';
  st.textContent = `
    #budgetEditModal.bottom-modal{ z-index: 1200; }
    #budgetEditModal .bottom-modal-box{ max-width:480px; width:calc(100% - 8px); }
    #budgetEditModal .field{ display:flex; flex-direction:column; gap:6px; margin:10px 0; }
    #budgetEditModal label{ font-size:12px; color: var(--txt-main, #EDEDEF); opacity:.85 }
    /* Premium inputs (tag + datas) usando os mesmos tokens do TX modal */
    #budgetEditModal input[type="text"],
    #budgetEditModal input[type="date"]{
      height:48px; padding: 12px 16px; border-radius:16px; width: 100%; box-sizing: border-box;
      background: var(--tx-field-bg) !important;
      border: 1px solid var(--tx-field-border) !important;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.25) !important;
      color: var(--txt-main);
    }
    #budgetEditModal input[type="text"]:focus,
    #budgetEditModal input[type="date"]:focus{
      outline: none; box-shadow: inset 0 0 0 2px var(--tx-field-focus) !important;
      background: var(--tx-field-bg) !important;
    }
    #budgetEditModal ::placeholder { color: rgba(255,255,255,0.65); }
    /* Slightly smaller date text to avoid overlap with icon */
    #budgetEditModal input[type="date"]{ font-size: 0.9rem; }
    #budgetEditModal input[type="date"]::-webkit-datetime-edit{ font-size: 0.9rem; }
    #budgetEditModal input[type="date"]::-webkit-datetime-edit-year-field,
    #budgetEditModal input[type="date"]::-webkit-datetime-edit-month-field,
    #budgetEditModal input[type="date"]::-webkit-datetime-edit-day-field{ font-size: 0.9rem; }
    html[data-theme="light"] #budgetEditModal input[type="text"],
    html[data-theme="light"] #budgetEditModal input[type="date"]{
      background:#f3f4f6 !important; border:1px solid rgba(0,0,0,0.06) !important; color:#111;
      box-shadow: inset 0 2px 6px rgba(0,0,0,0.04) !important;
    }
    html[data-theme="light"] #budgetEditModal ::placeholder { color:#6b7280; }
    #budgetEditModal .row{ display:flex; gap:10px; }
    #budgetEditModal .row > .field{ min-width: 0; }

    /* Calendar icon contrast per theme */
    #budgetEditModal input[type="date"]::-webkit-calendar-picker-indicator{
      filter: invert(1) brightness(1.2); /* make icon light on dark bg */
      opacity: .9;
    }
    html[data-theme="light"] #budgetEditModal input[type="date"]::-webkit-calendar-picker-indicator{
      filter: none; /* keep dark icon on light bg */
      opacity: .7;
    }
    #budgetEditModal .row > .field{ flex:1 1 0 }
    /* Footer CTA premium (mesmo padrão do TX modal) */
    #budgetEditModal .sheet-footer{ margin-top:auto; padding-top:16px; display:flex; justify-content:center; }
    #budgetEditModal #be_save{ 
      background: linear-gradient(180deg, #23c15a, #1da851); border: 0; color:#fff; cursor:pointer;
      border-radius: 9999px; padding:14px 0; width:100%; max-width:290px; font-weight:600; font-size:1rem;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
    }
    html[data-theme="light"] #budgetEditModal #be_save{ background: linear-gradient(180deg, #22c55e, #16a34a); color:#fff; box-shadow: 0 6px 12px rgba(22,163,74,0.12); }

    /* Recurring value modal — match the same premium sheet look */
    #budgetRecurringModal.bottom-modal{ z-index: 1200; }
    #budgetRecurringModal .bottom-modal-box{ max-width:420px; width:calc(100% - 8px); }
    #budgetRecurringModal .sheet-header h2{ color: var(--txt-main, #EDEDEF); }
    #budgetRecurringModal .field > label{ color: var(--txt-main, #EDEDEF); opacity:.85; }
    #budgetRecurringModal .modal-content{ padding-top: 6px; }
    #budgetRecurringModal .field{ display:flex; flex-direction:column; gap:8px; margin:8px 0 4px; }
    #budgetRecurringModal .field > label{ font-size:12px; letter-spacing:.02em; opacity:.8; }
    /* Match TX modal field visuals */
    #budgetRecurringModal .currency-input{ height:48px; border-radius:16px; padding: 14px 16px; background: var(--tx-field-bg) !important; border:1px solid var(--tx-field-border) !important; box-shadow: inset 0 1px 2px rgba(0,0,0,0.25) !important; color: var(--txt-main); }
    #budgetRecurringModal .currency-input:focus{ outline:none; box-shadow: inset 0 0 0 2px var(--tx-field-focus) !important; }
    #budgetRecurringModal ::placeholder{ color: rgba(255,255,255,0.65); }
    #budgetRecurringModal .sheet-footer{ margin-top:auto; padding-top:16px; display:flex; justify-content:center; }
    #budgetRecurringModal #rv_save{ 
      background: linear-gradient(180deg, #23c15a, #1da851); border: 0; color:#fff; cursor:pointer;
      border-radius: 9999px; padding:14px 0; width:100%; max-width:290px; font-weight:600; font-size:1rem;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
    }
    html[data-theme="light"] #budgetRecurringModal .currency-input{ background:#f3f4f6 !important; border:1px solid rgba(0,0,0,0.06) !important; color:#111; box-shadow: inset 0 2px 6px rgba(0,0,0,0.04) !important; }
    /* Recorrente: light theme for value-input-wrapper input (actual element) */
    html[data-theme="light"] #budgetRecurringModal .value-input-wrapper input{ background:#f3f4f6 !important; border:1px solid rgba(0,0,0,0.06) !important; color:#111 !important; box-shadow: inset 0 2px 6px rgba(0,0,0,0.04) !important; }
    html[data-theme="light"] #budgetRecurringModal ::placeholder{ color: #6b7280; }

    /* Also unify style for ad‑hoc modal input */
    #budgetEditModal .currency-input{ height:48px; border-radius:16px; padding:14px 16px; background: var(--tx-field-bg) !important; border:1px solid var(--tx-field-border) !important; box-shadow: inset 0 1px 2px rgba(0,0,0,0.25) !important; color: var(--txt-main); }
    #budgetEditModal .currency-input:focus{ outline:none; box-shadow: inset 0 0 0 2px var(--tx-field-focus) !important; }
    #budgetEditModal ::placeholder{ color: rgba(255,255,255,0.65); }
    html[data-theme="light"] #budgetEditModal .currency-input{ background:#f3f4f6 !important; border:1px solid rgba(0,0,0,0.06) !important; color:#111; box-shadow: inset 0 2px 6px rgba(0,0,0,0.04) !important; }
    html[data-theme="light"] #budgetEditModal ::placeholder{ color: #6b7280; }
    html[data-theme="light"] #budgetRecurringModal #rv_save{ background: linear-gradient(180deg, #22c55e, #16a34a); color:#fff; border:0; box-shadow: 0 6px 12px rgba(22,163,74,0.12); }

    /* Premium checkbox for migrate option */
    /* Ensure checkbox visual is visible and attractive (toggle-like) */
    #budgetEditModal .checkbox-field{ margin: 8px 0 12px; }
  #budgetEditModal .premium-checkbox{ display:flex; align-items:center; gap:12px; user-select:none; cursor:pointer; position:relative; }
  #budgetEditModal .premium-checkbox .text{ color: var(--txt-main, #EDEDEF); font-weight:600; font-size:15px; line-height:20px; }

    /* Keep native input accessible but visually hidden for custom visuals */
    #budgetEditModal .premium-checkbox input{ position:absolute; left:0; top:0; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); border:0; }

    /* Visual box (uses existing .box element) */
    #budgetEditModal .premium-checkbox .box{
      display:inline-block; width:44px; height:26px; border-radius:999px; background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.06));
      border: 1px solid rgba(255,255,255,0.06); box-shadow: 0 8px 20px rgba(2,6,23,0.45); position:relative; transition: background 220ms, box-shadow 220ms; flex-shrink:0;
    }
    #budgetEditModal .premium-checkbox .box::after{
      content: ''; position: absolute; top:2px; left:3px; width:22px; height:22px; border-radius:999px; background:#fff; box-shadow: 0 4px 12px rgba(2,6,23,0.35); transition: transform 220ms;
      transform: translateX(0);
    }
    #budgetEditModal .premium-checkbox .box svg{ position:absolute; left:0; top:0; width:100%; height:100%; display:block; pointer-events:none; }
    #budgetEditModal .premium-checkbox .box .tick{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; opacity:0; transition: opacity 140ms ease-in-out; }

    /* Checked visuals */
    #budgetEditModal .premium-checkbox input:checked + .box{
      background: linear-gradient(180deg, #22c55e, #16a34a); border-color: rgba(0,0,0,0.08); box-shadow: 0 10px 28px rgba(34,197,94,0.18);
    }
    #budgetEditModal .premium-checkbox input:checked + .box::after{ transform: translateX(18px); background: linear-gradient(180deg,#fff,#f3f3f3); }
    #budgetEditModal .premium-checkbox input:checked + .box .tick{ opacity:1; }

    /* Focus-visible */
    #budgetEditModal .premium-checkbox input:focus + .box{ box-shadow: 0 0 0 6px rgba(34,197,94,0.12); }

    /* Light theme tweaks */
    html[data-theme="light"] #budgetEditModal .premium-checkbox .box{ background: linear-gradient(180deg,#fff,#f7f7f7); border:1px solid rgba(0,0,0,0.06); box-shadow: 0 6px 16px rgba(2,6,23,0.06); }
    html[data-theme="light"] #budgetEditModal .premium-checkbox .text{ color:#111; }

    /* Compact variant (tooltip-like): smaller toggle and label */
    #budgetEditModal .premium-checkbox--compact{ gap:8px; }
    /* Make the label thin and attempt to fit original long text on a single line */
    #budgetEditModal .premium-checkbox--compact .text{
      font-size:12px; font-weight:400; line-height:16px; opacity:0.95;
      white-space:nowrap; overflow:visible; text-overflow:clip; flex:1 1 auto; min-width:0;
    }
    /* Slightly smaller toggle to free up space */
    #budgetEditModal .premium-checkbox--compact .box{ width:34px; height:18px; }
    #budgetEditModal .premium-checkbox--compact .box::after{ width:14px; height:14px; top:2px; left:2px; }
    #budgetEditModal .premium-checkbox--compact .box .tick svg{ width:9px; height:9px; }

  /* Allow toggle shadows/knob to overflow the sheet so it's not clipped */
  #budgetEditModal .bottom-modal-box,
  #budgetEditModal .modal-content { overflow: visible; }
  /* Ensure visual box sits above modal background */
  #budgetEditModal .premium-checkbox .box { position: relative; z-index: 3; }

  `;
  document.head.appendChild(st);
}

function el(id){ return document.getElementById(id); }

export function openEditBudgetModal(budget, ctx = {}){
  ensureStyles();
  let modal = el('budgetEditModal');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'budgetEditModal';
    modal.className = 'bottom-modal backdrop-blur hidden sheet-modal';
    modal.innerHTML = `
      <div class="bottom-modal-box">
        <div class="modal-drag"></div>
        <button class="modal-close-btn" id="closeBudgetEditModal" aria-label="Fechar">✕</button>
        <header class="sheet-header"><h2>Editar orçamento</h2></header>
        <div class="modal-content">
          <div class="field"><label>Tag</label><input id="be_tag" type="text" placeholder="#Mercado"></div>
          <!-- Monitor removed: confirmation will be requested on save if tag changed -->
          <div class="row">
            <div class="field"><label>Início</label><input id="be_start" type="date"></div>
            <div class="field"><label>Fim</label><input id="be_end" type="date"></div>
          </div>
          <div class="field"><label>Valor (reserva)</label><input id="be_value" class="currency-input" type="tel" inputmode="decimal" pattern="[0-9]*" placeholder="0,00"></div>
        </div>
        <div class="sheet-footer"><button id="be_save">Salvar</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    el('closeBudgetEditModal').onclick = () => modal.classList.add('hidden');
    // no cancel button by design; tap outside or close icon
  }

  // Prefill
  const fmtISO = (d) => (d ? String(d).slice(0,10) : '');
  el('be_tag').value = String(budget.tag || '');
  el('be_start').value = fmtISO(budget.startDate);
  el('be_end').value = fmtISO(budget.endDate);
  try {
    const inp = el('be_value');
    if (inp) {
      inp.value = safeFmtNumber(Number(budget.initialValue || 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      setupTransactionForm({ valueInput: inp, valueToggleButtons: [], safeFmtNumber, safeFmtCurrency });
    }
  } catch(_) {}
  // Remove toggle default. We'll show a monitor if the tag is changed.
  const originalTag = String(budget.tag || '').trim();
  const tagInputEl = el('be_tag');

  const countAffected = () => {
    try {
      const txs = window.__gastos?.getTransactions?.() || [];
      const start = el('be_start').value;
      const end = el('be_end').value;
      return txs.filter(t => {
        if (!t) return false;
        const sameTag = String(t.tag || '').trim() === originalTag;
        if (!sameTag) return false;
        if (start || end) {
          const dt = String(t.date || '').slice(0,10);
          if (start && dt < start) return false;
          if (end && dt > end) return false;
        }
        return true;
      }).length;
    } catch(_) { return 0; }
  };

  // Monitor UI removed; confirmation will be requested at save if tag changed.

  const showToast = (msg, type='success') => {
    try { window.__gastos?.showToast?.(msg, type); } catch(_){}
  };

  el('be_save').onclick = async () => {
    const tag = el('be_tag').value.trim().replace(/^#+/, '');
    const start = el('be_start').value;
    const end = el('be_end').value;
    const val = safeParseCurrency(el('be_value').value);
    // Determine whether the tag changed and user confirmed migration
    const newTag = el('be_tag').value.trim().replace(/^#+/, '');
    const tagChanged = newTag && newTag !== originalTag;
    let migrate = false;

    if (tagChanged) {
      // Show existing confirmMoveModal for confirmation
      const confirmMoveModal = document.getElementById('confirmMoveModal');
      const confirmMoveYes   = document.getElementById('confirmMoveYes');
      const confirmMoveNo    = document.getElementById('confirmMoveNo');
      const closeConfirmMove = document.getElementById('closeConfirmMove');
      const confirmMoveText  = document.getElementById('confirmMoveText');

      // Always use a single confirmation message regardless of affected count
      const msg = `Todas as transações sob a tag "${originalTag}" serão movidas para a tag "${newTag}". Gostaria de prosseguir?`;

      if (!confirmMoveModal || !confirmMoveYes || !confirmMoveNo) {
        // fallback to window.confirm
        migrate = window.confirm(msg);
      } else {
        migrate = await new Promise(resolve => {
          const prevZ = confirmMoveModal.style.zIndex;
          // ensure confirmation modal is above the edit modal
          confirmMoveModal.style.zIndex = '1300';
          const cleanup = () => {
            confirmMoveModal.classList.add('hidden');
            confirmMoveYes.onclick = null;
            confirmMoveNo.onclick = null;
            if (closeConfirmMove) closeConfirmMove.onclick = null;
            confirmMoveModal.onclick = null;
            confirmMoveModal.style.zIndex = prevZ || '';
            try { if (window.updateModalOpenState) window.updateModalOpenState(); } catch(_){ }
          };
          confirmMoveYes.onclick = () => { cleanup(); resolve(true); };
          confirmMoveNo.onclick  = () => { cleanup(); resolve(false); };
          if (closeConfirmMove) closeConfirmMove.onclick = () => { cleanup(); resolve(false); };
          confirmMoveModal.onclick = (e) => { if (e.target === confirmMoveModal) { cleanup(); resolve(false); } };
          // set message and show
          if (confirmMoveText) confirmMoveText.textContent = msg;
          confirmMoveModal.classList.remove('hidden');
          try { if (window.updateModalOpenState) window.updateModalOpenState(); } catch(_){ }
        });
      }
    }
    if (!tag){ showToast('Informe uma tag válida', 'error'); return; }
    if (start && end && start > end){ showToast('Período inválido', 'error'); return; }
    try {
      const res = updateAdHocBudget(budget, {
        tag,
        startDate: start,
        endDate: end,
        initialValue: isNaN(val) ? budget.initialValue : val,
      }, {
        migrateOps: migrate,
        getTransactions: () => (window.__gastos?.getTransactions?.() || []),
        setTransactions: (list) => { try { window.__gastos?.setTransactions?.(list); } catch(_){} },
      });
      if (res.updated){
        modal.classList.add('hidden');
        try { window.__gastos?.refreshPanorama?.(); } catch(_){}
        try { window.__gastos?.renderTable?.(); } catch(_){}
        showToast('Orçamento atualizado', 'success');
      } else {
        showToast('Nada foi alterado', 'warning');
      }
    } catch(err){
      console.warn('updateAdHocBudget failed', err);
      showToast('Falha ao salvar orçamento', 'error');
    }
  };

  modal.classList.remove('hidden');
}

export function openEditRecurringValueModal(budget){
  ensureStyles();
  let modal = document.getElementById('budgetRecurringModal');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'budgetRecurringModal';
    modal.className = 'bottom-modal backdrop-blur hidden sheet-modal';
    modal.innerHTML = `
      <div class="bottom-modal-box">
        <div class="modal-drag"></div>
        <button class="modal-close-btn" id="rv_close" aria-label="Fechar">✕</button>
        <header class="sheet-header"><h2>Editar valor do ciclo</h2></header>
        <div class="modal-content">
          <div class="field">
            <label>Valor do ciclo (reserva)</label>
            <div class="value-input-wrapper">
              <input id="rv_value" type="tel" inputmode="decimal" pattern="[0-9]*" placeholder="Valor" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
            </div>
          </div>
        </div>
        <div class="sheet-footer"><button id="rv_save">Salvar</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    modal.querySelector('#rv_close').onclick = () => modal.classList.add('hidden');
  }
  const valInput = modal.querySelector('#rv_value');
  if (valInput) {
    try { valInput.value = safeFmtNumber(Number(budget.initialValue || 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch(_) { valInput.value = Number(budget.initialValue || 0); }
    try { setupTransactionForm({ valueInput: valInput, valueToggleButtons: [], safeFmtNumber, safeFmtCurrency }); } catch(_) {}
  }
  const showToast = (m,t='success') => { try { window.__gastos?.showToast?.(m,t); } catch(_){} };
  modal.querySelector('#rv_save').onclick = async () => {
    const v = safeParseCurrency(valInput.value);
    const { updateRecurringCycleValue } = await import('../services/budgetEditor.js');
    const res = updateRecurringCycleValue(budget, isNaN(v) ? budget.initialValue : v);
    if (res.updated){
      modal.classList.add('hidden');
      try { window.__gastos?.refreshPanorama?.(); } catch(_){}
      try { window.__gastos?.renderTable?.(); } catch(_){}
      showToast('Valor do ciclo atualizado');
    } else {
      showToast('Valor inválido', 'error');
    }
  };
  modal.classList.remove('hidden');
}
