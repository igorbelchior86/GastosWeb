import { loadBudgets } from '../services/budgetStorage.js';
import { recomputeBudget, spentNoPeriodo } from '../services/budgetCalculations.js';

export function setupBudgetHistory(ctx = {}) {
  const {
    txModal = document.getElementById('txModal'),
    getTransactions = () => (window.__gastos?.getTransactions?.() || []),
    isBudgetsEnabled = () => (window.__gastos?.isBudgetsFeatureEnabled?.() || false),
    findActiveBudgetByTag = (tag) => window.__gastos?.findActiveBudgetByTag?.(tag) || null,
  } = ctx;
  if (!txModal) return { showHistory: () => {} };

  const sheet = document.createElement('div');
  sheet.className = 'budget-history hidden';
  sheet.innerHTML = `
    <div class="budget-history__content">
      <header>
        <h3 class="title"></h3>
        <button class="close" aria-label="Fechar">×</button>
      </header>
      <section class="summary"></section>
      <ul class="entries"></ul>
      <footer class="empty"></footer>
    </div>
  `;
  txModal.appendChild(sheet);

  ensureStyles();
  const titleEl = sheet.querySelector('.title');
  const closeBtn = sheet.querySelector('.close');
  const summaryEl = sheet.querySelector('.summary');
  const entriesEl = sheet.querySelector('.entries');
  const emptyEl = sheet.querySelector('.empty');

  closeBtn.onclick = () => hide();
  sheet.addEventListener('click', (ev) => {
    if (ev.target === sheet) hide();
  });

  function showHistory(tag) {
    if (!isBudgetsEnabled()) return;
    const budgets = loadBudgets();
    const active = budgets.find(b => b && b.status === 'active' && b.tag === tag) || findActiveBudgetByTag(tag);
    if (!active) {
      renderEmpty(tag);
      reveal();
      return;
    }
    const txs = getTransactions();
    const recalculated = recomputeBudget({ ...active }, txs) || active;
    const start = (recalculated.startDate || '').slice(0, 10);
    const end = (recalculated.endDate || '').slice(0, 10);
    const entries = (txs || [])
      .filter(tx => tx && tx.budgetTag === tag)
      .filter(tx => {
        const iso = (tx.opDate || '').slice(0, 10);
        if (!iso) return false;
        if (start && iso < start) return false;
        if (end && iso > end) return false;
        return true;
      })
      .sort((a, b) => (a.opDate || '').localeCompare(b.opDate || '')); // chronological

    renderHistory(tag, recalculated, entries);
    reveal();
  }

  function renderHistory(tag, budget, entries) {
    titleEl.textContent = `${tag} · ${formatPeriod(budget.startDate, budget.endDate)}`;
    const spent = Number(budget.spentValue || 0);
    const total = Number(budget.initialValue || 0);
    const remaining = Math.max(total - spent, 0);
    summaryEl.innerHTML = `
      <div class="summary__values">
        <div><span class="label">Inicial</span><strong>${fmt(total)}</strong></div>
        <div><span class="label">Gasto</span><strong>${fmt(spent)}</strong></div>
        <div><span class="label">Restante</span><strong>${fmt(remaining)}</strong></div>
      </div>
    `;
    entriesEl.innerHTML = '';
    if (!entries.length) {
      emptyEl.textContent = 'Nenhum lançamento neste ciclo.';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    entries.forEach(tx => {
      const li = document.createElement('li');
      const iso = (tx.opDate || '').slice(0, 10);
      const date = formatDate(iso);
      const planned = tx.planned ? '<span class="chip planned">Planejado</span>' : '';
      li.innerHTML = `
        <div class="line">
          <div class="info">
            <strong>${tx.desc || 'Lançamento'}</strong>
            <small>${date} · ${tx.method || 'Dinheiro'} ${planned}</small>
          </div>
          <span class="amount">${fmt(tx.val)}</span>
        </div>
      `;
      entriesEl.appendChild(li);
    });
  }

  function renderEmpty(tag) {
    titleEl.textContent = tag;
    summaryEl.innerHTML = '';
    entriesEl.innerHTML = '';
    emptyEl.textContent = 'Nenhum orçamento ativo para esta tag.';
    emptyEl.classList.remove('hidden');
  }

  function reveal() {
    sheet.classList.remove('hidden');
  }
  function hide() {
    sheet.classList.add('hidden');
  }

  function formatPeriod(start, end) {
    const a = formatDate(start);
    const b = formatDate(end);
    return `${a} – ${b}`;
  }
  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(`${iso}T00:00:00`);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch (_) {
      return iso;
    }
  }
  const fmt = (v) => {
    try { return (window.__gastos?.safeFmtCurrency || ((n)=>String(n)))(Number(v)||0); } catch (_) { return String(v); }
  };

  ensureStyles();

  function ensureStyles() {
    if (document.getElementById('budget-history-styles')) return;
    const st = document.createElement('style');
    st.id = 'budget-history-styles';
    st.textContent = `
      .budget-history{position:absolute;inset:0;z-index:99999;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:flex-end;padding:12px;}
      .budget-history.hidden{display:none;}
      .budget-history__content{background:#252527;width:100%;max-height:75vh;border-radius:16px 16px 0 0;padding:16px 18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 -12px 30px rgba(0,0,0,0.35);}
      .budget-history header{display:flex;justify-content:space-between;align-items:center;}
      .budget-history header h3{margin:0;font-size:16px;color:#fff;font-weight:600;}
      .budget-history header .close{background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;}
      .budget-history .summary__values{display:flex;gap:16px;color:#B3B3B3;font-size:12px;}
      .budget-history .summary__values strong{display:block;color:#fff;font-size:14px;margin-top:2px;}
      .budget-history ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;overflow-y:auto;}
      .budget-history li{padding:10px 12px;border-radius:8px;background:#2f2f31;color:#fff;display:flex;flex-direction:column;gap:4px;}
      .budget-history li .line{display:flex;justify-content:space-between;align-items:center;gap:12px;}
      .budget-history li .info strong{font-size:14px;}
      .budget-history li .info small{font-size:12px;color:#B3B3B3;display:block;}
      .budget-history li .chip{display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:6px;}
      .budget-history li .chip.planned{background:#3a3a3d;color:#b3b3b3;}
      .budget-history li .amount{font-weight:600;}
      .budget-history .empty{font-size:13px;color:#B3B3B3;text-align:center;}
      .budget-history .empty.hidden{display:none;}
    `;
    document.head.appendChild(st);
  }

  return { showHistory };
}

