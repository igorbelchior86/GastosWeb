import { loadBudgets, saveBudgets, reconcileBudgetsWithRemote } from '../services/budgetStorage.js';
import { recomputeBudget } from '../services/budgetCalculations.js';

export function setupBudgetPanorama(ctx = {}) {
  const {
    isPanoramaEnabled = () => true,
    getTransactions = () => (window.__gastos?.getTransactions?.() || []),
    safeFmtCurrency = (v) => String(v),
    todayISO = () => (window.todayISO ? window.todayISO() : new Date().toISOString().slice(0, 10)),
    showBudgetHistory = () => {},
    updateModalOpenState = () => {},
    // Optional: share the same day-expansion logic used by the accordion
    txByDate: txByDateFromCtx = null,
  } = ctx;

  ensureStyles();
  ensureBudgetCardStylesIfNeeded();

  const modal = document.createElement('div');
  modal.id = 'panoramaModal';
  modal.className = 'bottom-modal backdrop-blur hidden sheet-modal';
  modal.innerHTML = `
    <div class="bottom-modal-box">
      <div class="modal-drag"></div>
      <button class="modal-close-btn" aria-label="Fechar">✕</button>
      <header class="sheet-header"><h2>Panorama</h2></header>
      <div class="modal-content panorama-content">
        <section class="widget" role="presentation">
          <div class="widget-header">
            <div class="title-col"><div class="widget-eyebrow"></div><h3 class="widget-title"></h3></div>
            <button class="view-toggle" type="button" aria-label="Alternar período"></button>
          </div>
          <div class="widget-hairline"></div>
          <div class="chart-area">
            <div class="bars chart swap is-visible">
              <div class="col income"><div class="bar-value">0</div><div class="bar-rect"></div><div class="bar-label">Entradas</div></div>
              <div class="col expense"><div class="bar-value">0</div><div class="bar-rect"></div><div class="bar-label">Saídas</div></div>
              <div class="baseline"></div>
            </div>
            <canvas class="yearly-canvas swap is-hidden" width="360" height="180"></canvas>
            <div class="yearly-labels swap is-hidden"></div>
          </div>
          <p class="mode-hint"></p>
        </section>
        <section class="budgets">
          <h4>Orçamentos ativos</h4>
          <div class="budgets__list"></div>
          <p class="empty hidden">Nenhum orçamento ativo.</p>
        </section>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('.modal-close-btn');
  const incomeBar = modal.querySelector('.col.income');
  const expenseBar = modal.querySelector('.col.expense');
  const widgetTitle = modal.querySelector('.widget-title');
  const widgetEyebrow = modal.querySelector('.widget-eyebrow');
  const viewToggleBtn = modal.querySelector('.view-toggle');
  
  const budgetsList = modal.querySelector('.budgets__list');
  const emptyEl = modal.querySelector('.budgets .empty');
  const widget = modal.querySelector('.widget');
  const yearlyCanvas = modal.querySelector('.yearly-canvas');
  const modeHint = modal.querySelector('.mode-hint');
  const barsWrapper = modal.querySelector('.bars');
  const chartArea = modal.querySelector('.chart-area');
  const yearlyLabels = modal.querySelector('.yearly-labels');
  const getTxByDate = () => (txByDateFromCtx || window.__gastos?.txByDate || null);

  let viewMode = 'monthly';
  let renderedMode = null; // controla o estado atual para aplicar animação só quando alternar

  closeBtn.onclick = () => hide();
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hide();
  });
  const toggleView = (origin = 'widget') => {
    viewMode = viewMode === 'monthly' ? 'yearly' : 'monthly';
    try { window.__gastos?.emitTelemetry?.(viewMode === 'yearly' ? 'panorama_toggle_yearly' : 'panorama_toggle_monthly', { origin }); } catch (_) {}
    render();
  };
  if (widget) widget.addEventListener('click', () => toggleView('widget'));
  if (viewToggleBtn) viewToggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleView('pill'); });

  function handleOpen() {
    if (!isPanoramaEnabled()) return false;
    try {
      // Fire-and-forget reconciliation; re-render after completion
      reconcileBudgetsWithRemote()?.then?.(() => { try { render(); } catch (_) {} });
    } catch (_) {}
    render();
    modal.classList.remove('hidden');
    try { updateModalOpenState(); } catch (_) {}
    try { window.__gastos?.emitTelemetry?.('panorama_open', { origin: 'header' }); } catch (_) {}
    return true;
  }

  function refreshIfOpen() {
    // Re-render if the sheet is visible
    if (!modal.classList.contains('hidden')) {
      render();
    }
  }

  function hide() {
    modal.classList.add('hidden');
    try { updateModalOpenState(); } catch (_) {}
    if (viewMode !== 'monthly') {
      viewMode = 'monthly';
      updateHint(false);
    }
  }

  function render() {
    const today = todayISO();
    const [year, month] = today.split('-');
    const txs = getTransactions() || [];

    const summary = computeMonthlySummary(txs, year, month);
    const isYearly = viewMode === 'yearly';
    updateHint(isYearly);
    // Update pill label and eyebrow
    if (viewToggleBtn) viewToggleBtn.textContent = isYearly ? 'Este mês' : 'Últimos 6m';
    if (widgetEyebrow) widgetEyebrow.textContent = isYearly ? 'Período · 6 meses' : 'Mês atual';
    if (isYearly) {
      // prepara dados do canvas antes de mostrar
      const series = computeMultiMonthSeries(txs, year, month, 6);
      // Title as month range, e.g., "Mai — Out"
      try {
        if (widgetTitle) {
          const first = (series[0]?.label || '').replace('.', '');
          const last  = (series[series.length-1]?.label || '').replace('.', '');
          const cap = (s) => s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;
          widgetTitle.textContent = `${cap(first)} — ${cap(last)}`;
        }
      } catch (_) {}
      drawYearlyBars(yearlyCanvas, series);
      // Build clean month labels as HTML grid
      if (yearlyLabels) {
        yearlyLabels.innerHTML = '';
        series.forEach((item) => {
          const cell = document.createElement('div');
          cell.className = 'mcell';
          cell.textContent = String(item.label || '').toUpperCase();
          yearlyLabels.appendChild(cell);
        });
      }
      animateTo('yearly');
    } else {
      // Título com mês atual
      try {
        const date = new Date(Number(year), Number(month) - 1, 1);
        const label = date.toLocaleDateString('pt-BR', { month: 'long' });
        const cap = label.charAt(0).toUpperCase() + label.slice(1);
        if (widgetTitle) widgetTitle.textContent = cap;
      } catch (_) { if (widgetTitle) widgetTitle.textContent = `${year}-${month}`; }
      // Atualiza barras (verticais) e rodapé
      const firstPaint = !widget?.dataset?.chartReady;
      setBar(incomeBar, summary.income, summary.max, { animate: firstPaint, format: fmt });
      setBar(expenseBar, summary.expense, summary.max, { animate: firstPaint, format: fmt });
      // Removed balance footer per UI decision
      try { if (widget) widget.dataset.chartReady = '1'; } catch (_) {}
      animateTo('monthly');
    }

    // Normalize budgets to enforce single active per tag before rendering
    const budgets = saveBudgets(loadBudgets())
      .filter((b) => b && b.status === 'active')
      .map((b) => recomputeBudget({ ...b }, txs) || b)
      .sort((a, b) => String(a.endDate || '').localeCompare(String(b.endDate || '')));

    budgetsList.innerHTML = '';
    if (!budgets.length) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    budgets.forEach((budget) => {
      const { spent, remaining, total } = computeCardTotals(budget, txs);
      const exceeded = Math.max(spent - total, 0);
      const ratio = total > 0 ? Math.min(1, spent / total) : 0;
      const start = formatDayMonthShort((budget.startDate || '').slice(0,10));
      const end = formatDayMonthShort((budget.endDate || '').slice(0,10));

      const card = document.createElement('div');
      card.className = 'budget-card op-line';
      card.dataset.cardType = 'budget';

      const header = document.createElement('div');
      header.className = 'budget-card__header';
      header.style.display = 'flex';
      header.style.flexDirection = 'column';
      header.style.gap = '4px';

      const titleRow = document.createElement('div');
      titleRow.style.display = 'flex';
      titleRow.style.justifyContent = 'space-between';
      titleRow.style.alignItems = 'center';

      const tagPill = document.createElement('span');
      tagPill.className = 'budget-tag-pill';
      tagPill.textContent = formatTagLabel(budget.tag) || 'Orçamento';

      const period = document.createElement('span');
      period.className = 'budget-card__period';
      period.style.fontSize = '0.85em';
      period.style.color = 'var(--text-secondary, #b3b3b3)';
      period.textContent = `${start} - ${end}`;

      titleRow.appendChild(tagPill);
      titleRow.appendChild(period);
      header.appendChild(titleRow);

      const details = document.createElement('div');
      details.className = 'budget-card__details';
      details.style.display = 'flex';
      details.style.justifyContent = 'space-between';
      details.style.marginTop = '8px';
      details.style.fontSize = '0.95em';

      const main = document.createElement('span');
      main.className = 'budget-card__main';
      if (exceeded > 0) {
        main.textContent = `Excedeu ${fmt(exceeded)}`;
        main.dataset.state = 'over';
      } else {
        main.textContent = `Restam ${fmt(remaining)}`;
        main.dataset.state = remaining <= total * 0.2 ? 'warn' : 'ok';
      }
      const totalSpan = document.createElement('span');
      totalSpan.className = 'budget-card__total';
      totalSpan.textContent = `Total ${fmt(total)}`;
      details.appendChild(main);
      details.appendChild(totalSpan);

      const progress = document.createElement('div');
      progress.className = 'budget-card__progress';
      const fill = document.createElement('div');
      fill.className = 'budget-card__progress-fill';
      fill.style.width = `${Math.round(ratio * 100)}%`;
      if (exceeded > 0) fill.dataset.state = 'over';
      else if (ratio >= 0.8) fill.dataset.state = 'warn';
      else fill.dataset.state = 'ok';
      progress.appendChild(fill);

      card.appendChild(header);
      card.appendChild(details);
      card.appendChild(progress);
      card.addEventListener('click', () => {
        try { window.__gastos?.emitTelemetry?.('panorama_budget_card_open', { tag: budget.tag }); } catch (_) {}
        try { showBudgetHistory(budget.tag); } catch (_) {}
      });
      budgetsList.appendChild(card);
      if (!budget.isSynthetic) {
        try {
          import('./budgetActions.js')
            .then((mod) => { if (mod && typeof mod.attachBudgetSwipe === 'function') mod.attachBudgetSwipe(card, budget, { refreshBudgets: () => show() }); })
            .catch(() => {});
        } catch (_) {}
      }
    });
  }

  function computeCardTotals(budget, txs) {
    const trigId = budget && budget.triggerTxId != null ? String(budget.triggerTxId) : null;
    const startIso = (budget.startDate || '').slice(0,10);
    const endIso = (budget.endDate || '').slice(0,10);
    const spent = (txs || []).reduce((sum, tx) => {
      if (!tx || tx.budgetTag !== budget.tag) return sum;
      if (trigId && String(tx.id) === trigId) return sum; // não contar a reserva
      if (tx.planned === true) return sum;
      const iso = (tx.opDate || tx.postDate || '').slice(0,10);
      if (!iso) return sum;
      if (startIso && iso < startIso) return sum;
      if (endIso && iso > endIso) return sum;
      const v = Number(tx.val);
      if (!Number.isFinite(v)) return sum;
      return sum + Math.abs(v);
    }, 0);
    const total = Number(budget.initialValue || 0);
    const remaining = Math.max(total - spent, 0);
    return { spent, remaining, total };
  }

  // Crossfade suave entre modos sem bibliotecas
  function animateTo(targetMode) {
    if (!barsWrapper || !yearlyCanvas || !chartArea) return;
    const showYearly = targetMode === 'yearly';
    const fromEl = showYearly ? barsWrapper : yearlyCanvas;
    const toEl = showYearly ? yearlyCanvas : barsWrapper;
    // Ensure both are in swap mode and absolute
    fromEl.classList.add('swap'); toEl.classList.add('swap');
    // Prepare target
    toEl.classList.remove('is-hidden');
    toEl.classList.add('is-visible');
    if (yearlyLabels) {
      if (showYearly) { yearlyLabels.classList.remove('is-hidden'); yearlyLabels.classList.add('is-visible'); }
      else { yearlyLabels.classList.remove('is-visible'); yearlyLabels.classList.add('is-hidden'); }
    }
    // Hide source
    fromEl.classList.remove('is-visible');
    fromEl.classList.add('is-hidden');
    renderedMode = targetMode;
  }

  function setBar(colEl, value, max, opts = {}) {
    if (!colEl) return;
    const rect = colEl.querySelector('.bar-rect');
    const valEl = colEl.querySelector('.bar-value');
    const labelEl = colEl.querySelector('.bar-label');
    const area = colEl.closest('.chart');
    // Use computed height to avoid transient layout differences
    const chartHeight = (() => {
      try { return parseFloat(getComputedStyle(area).height) || 160; } catch (_) { return (area?.clientHeight || 160); }
    })();
    const bottomPad = 12; // baseline + label area (matches CSS)
    const topPad = 28;    // extra clearance so value label nunca corta
    const val = Math.max(0, Number(value || 0));
    const m = Math.max(1, Number(max || 1));
    const inner = Math.max(8, chartHeight - bottomPad - topPad);
    const h = Math.max(4, Math.round((val / m) * inner));
    if (!rect) return;
    if (opts && opts.animate) {
      // Start collapsed and expand next frame for a smooth first-paint animation
      rect.style.height = '0px';
      requestAnimationFrame(() => { rect.style.height = `${h}px`; });
    } else {
      rect.style.height = `${h}px`;
    }
    // Update numeric label positioned ABOVE the bar top
    if (valEl) {
      try {
        valEl.textContent = (opts && opts.format) ? opts.format(val) : String(val);
      } catch (_) { valEl.textContent = String(val); }
      // Compute offset using computed styles (works even when element is hidden)
      let gap = 12; // harmoniza com CSS e dá mais respiro
      try { const cs = getComputedStyle(colEl); gap = parseFloat(cs.rowGap) || gap; } catch (_) {}
      let labelH = 16, labelMb = 8;
      try {
        const ls = getComputedStyle(labelEl);
        const fs = parseFloat(ls.fontSize) || 16;
        const lh = parseFloat(ls.lineHeight);
        labelH = Number.isFinite(lh) ? lh : Math.round(fs * 1.25);
        labelMb = parseFloat(ls.marginBottom) || 6;
      } catch (_) {}
      const offset = h + gap + labelH + labelMb + 8; // +2px para telas com DP alto
      valEl.style.top = '';
      valEl.style.bottom = `${offset}px`;
      valEl.style.pointerEvents = 'none';
    }
  }

  function computeMonthlySummary(txs, year, month) {
    const monthStart = `${year}-${month}-01`;
    const monthEnd = (() => { try { return new Date(Number(year), Number(month), 0).toISOString().slice(0,10); } catch(_) { return `${year}-${month}-28`; } })();
    const within = (iso, start, end) => (iso && (!start || iso >= start) && (!end || iso <= end));
    const list = (() => {
      const tbd = getTxByDate();
      if (typeof tbd === 'function') {
        // Expand day-by-day using the same logic as the accordion
        const expanded = [];
        const y = Number(year), m = Number(month);
        const last = new Date(y, m, 0).getDate();
        for (let d = 1; d <= last; d++) {
          const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const dayList = tbd(iso) || [];
          expanded.push(...dayList);
        }
        return expanded;
      }
      return Array.isArray(txs) ? txs : [];
    })();
    let income = 0;
    // base expenses outside of budgets
    let outOfBudgetSpent = 0;
    // for overspend computation
    const budgetsActive = (loadBudgets() || [])
      .filter(b => b && b.status === 'active')
      .map(b => recomputeBudget({ ...b }, list) || b)
      .filter(b => within((b.startDate||'').slice(0,10), null, monthEnd) && within((b.endDate||'').slice(0,10), monthStart, null)
        || within(monthStart, (b.startDate||'').slice(0,10), (b.endDate||'').slice(0,10))
        || within(monthEnd, (b.startDate||'').slice(0,10), (b.endDate||'').slice(0,10)));

    // Sum initial values (reservation) for all budgets overlapping this month
    const reservedSum = budgetsActive.reduce((s,b)=> s + (Number(b.initialValue)||0), 0);

    // helper: does a tx belong to an active budget period for its tag?
    const coveredByAnyBudget = (iso, tag) => {
      if (!tag) return false;
      return budgetsActive.some(b => b.tag === tag && within(iso, (b.startDate||'').slice(0,10), (b.endDate||'').slice(0,10)));
    };

    // compute spent per budget tag within month for overspend
    const spentByTag = new Map();
    list.forEach(tx => {
      if (!tx || tx.planned) return;
      const iso = (tx.opDate || '').slice(0,10);
      if (!within(iso, monthStart, monthEnd)) return;
      const val = Number(tx.val) || 0;
      if (val > 0) { income += val; return; }
      // expense path
      const tag = tx.budgetTag || null;
      const trigId = tx.id != null ? String(tx.id) : null;
      if (tag && coveredByAnyBudget(iso, tag)) {
        // exclude reservation trigger if it happens to be in month
        const isTrigger = budgetsActive.some(b => b.tag === tag && String(b.triggerTxId||'') === trigId);
        if (isTrigger) return;
        const cur = spentByTag.get(tag) || 0;
        spentByTag.set(tag, cur + Math.abs(val));
      } else {
        outOfBudgetSpent += Math.abs(val);
      }
    });

    // overspend: sum max(0, spent - reserved) per tag
    const reservedByTag = new Map();
    budgetsActive.forEach(b => {
      reservedByTag.set(b.tag, (reservedByTag.get(b.tag)||0) + (Number(b.initialValue)||0));
    });
    const overspend = Array.from(spentByTag.entries()).reduce((s,[tag,spent]) => {
      const budgeted = reservedByTag.get(tag) || 0;
      return s + Math.max(0, spent - budgeted);
    }, 0);

    const expense = reservedSum + overspend + outOfBudgetSpent;
    const max = Math.max(income, expense, 1);
    return { income, expense, max };
  }

  function formatDayMonthShort(iso) {
    if (!iso) return '';
    try {
      const date = new Date(`${iso}T00:00:00`);
      const day = String(date.getDate()).padStart(2, '0');
      let mon = date.toLocaleDateString('pt-BR', { month: 'short' });
      mon = (mon || '').replace('.', '');
      mon = mon.charAt(0).toUpperCase() + mon.slice(1);
      return `${day} de ${mon}`;
    } catch (_) { return iso; }
  }

  function formatTagLabel(tag) {
    if (!tag) return '';
    const clean = String(tag).replace(/^#+/, '').trim();
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function computeMultiMonthSeries(txs, year, month, monthsCount = 12) {
    const series = [];
    const baseDate = new Date(Number(year), Number(month) - 1, 1);
    for (let i = monthsCount - 1; i >= 0; i--) {
      const date = new Date(baseDate);
      date.setMonth(date.getMonth() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('pt-BR', { month: 'short' });
      series.push({ key, label, income: 0, expense: 0 });
    }
    const buckets = new Map(series.map(item => [item.key, item]));
    const tbd = getTxByDate();
    if (typeof tbd === 'function') {
      // Expand month-by-month using txByDate
      series.forEach(({ key }) => {
        const [yy, mm] = key.split('-').map(Number);
        const last = new Date(yy, mm, 0).getDate();
        for (let d = 1; d <= last; d++) {
          const iso = `${yy}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const dayList = tbd(iso) || [];
          dayList.forEach(tx => {
            if (!tx || tx.planned) return;
            const val = Number(tx.val) || 0;
            const bucket = buckets.get(key);
            if (!bucket) return;
            if (val > 0) bucket.income += val; else bucket.expense += Math.abs(val);
          });
        }
      });
    } else {
      (txs || []).forEach((tx) => {
        if (!tx || tx.planned) return;
        const key = (tx.opDate || '').slice(0, 7);
        const bucket = buckets.get(key);
        if (!bucket) return;
        const val = Number(tx.val) || 0;
        if (val > 0) bucket.income += val;
        else bucket.expense += Math.abs(val);
      });
    }
    return series;
  }

  function drawYearlyBars(canvas, data) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth || canvas.width;
    const displayHeight = canvas.clientHeight || canvas.height;
    if (canvas.width !== displayWidth * ratio || canvas.height !== displayHeight * ratio) {
      canvas.width = displayWidth * ratio;
      canvas.height = displayHeight * ratio;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const width = displayWidth;
    const height = displayHeight - 8; // ultra‑tight bottom gap
    ctx.clearRect(0, 0, width, height);
    // Horizontal padding matches labels padding; vertical paddings are tighter to bring bars closer to labels
    const hPad = 16;
    const topPad = 4;
    const bottomPad = 0;
    const n = data.length;
    const colW = (width - hPad * 2) / n;
    const barWidth = Math.max(8, Math.min(28, colW * 0.35));
    const maxVal = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));
    // Labels are rendered in HTML; keep canvas focused on bars only
    data.forEach((item, index) => {
      const groupLeft = hPad + index * colW;
      const innerStartOffset = (colW - (2 * barWidth)) / 2;
      const groupX = groupLeft + innerStartOffset;
      const usableH = Math.max(1, height - topPad - bottomPad);
      const incomeHeight = (item.income / maxVal) * usableH;
      const expenseHeight = (item.expense / maxVal) * usableH;
      const baseY = height - bottomPad;
      ctx.fillStyle = '#5DD39E';
      ctx.fillRect(groupX, baseY - incomeHeight, barWidth, incomeHeight);
      ctx.fillStyle = '#FF6B6B';
      ctx.fillRect(groupX + barWidth, baseY - expenseHeight, barWidth, expenseHeight);
    });
  }

  function updateHint(isYearly) {
    if (!modeHint) return;
    modeHint.textContent = isYearly
      ? 'Toque para voltar ao mês atual'
      : 'Toque para ver os últimos 12 meses';
  }

  function emitTelemetry(eventName) {
    try {
      window.__gastos?.telemetry?.emit?.(eventName, { origin: 'panorama' });
    } catch (_) {}
  }

  const fmt = (v) => {
    try { return safeFmtCurrency(Number(v) || 0); } catch (_) { return String(v); }
  };

  return { handleOpen, hide, refresh: refreshIfOpen };
}

function ensureStyles() {
  if (document.getElementById('panorama-styles')) return;
  const st = document.createElement('style');
  st.id = 'panorama-styles';
  st.textContent = `
    /* Prevent horizontal scroll in iOS PWA */
    #panoramaModal, #panoramaModal .bottom-modal-box, #panoramaModal .modal-content { overflow-x: hidden; }
    .panorama-content{ color: var(--txt-main, #EDEDEF); overflow-x: hidden; }
    .panorama-content .widget{border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;cursor:pointer}
    .panorama-content .sheet-header{ margin-bottom: 6px; }
    .panorama-content .widget:active{opacity:.96}
    .panorama-content .widget .widget-header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:6px}
    .panorama-content .widget .title-col{display:flex;flex-direction:column;gap:4px}
    .panorama-content .widget .widget-eyebrow{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,0.65)}
    .panorama-content .widget .widget-title{margin:0;font-size:20px;font-weight:700;letter-spacing:.02em;color:rgba(255,255,255,0.92)}
    .panorama-content .widget .view-toggle{margin-left:auto;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.06);color:#EDEDEF;cursor:pointer}
    .panorama-content .widget .view-toggle:active{transform:scale(0.98)}
    .panorama-content .widget .widget-hairline{height:1px;background:rgba(255,255,255,0.08);border-radius:1px;margin:4px 0 4px}
    .panorama-content .widget .chart-area{position:relative;height:180px; overflow:hidden}
    .panorama-content .widget .bars.chart{position:absolute;inset:0;display:flex;justify-content:space-around;align-items:flex-end;padding:16px 10px 14px;gap:24px}
    /* Yearly view overlays in the same fixed area without any box styling */
    .panorama-content .widget .yearly-canvas{position:absolute;left:0;right:0;top:0;bottom:6px;background:transparent !important;padding:0 !important;border-radius:0 !important}
    .panorama-content .widget .yearly-labels{position:absolute;left:0;right:0;bottom:0;height:10px;display:grid;grid-template-columns:repeat(6,1fr);align-items:center;font-size:10px;color:rgba(255,255,255,0.80);text-align:center;letter-spacing:.02em;padding:0 8px;box-sizing:border-box}
    .panorama-content .widget .yearly-labels .mcell{white-space:nowrap}
    .panorama-content .widget .swap{transition:opacity .24s ease, transform .24s ease; will-change:opacity,transform}
    .panorama-content .widget .is-hidden{opacity:0; pointer-events:none; transform:translateY(6px) scale(.995)}
    .panorama-content .widget .is-visible{opacity:1; transform:translateY(0) scale(1)}
    .panorama-content .widget .chart .col{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:104px}
    .panorama-content .widget .chart .bar-value{position:absolute;left:50%;transform:translateX(-50%);font-size:12px;color:rgba(255,255,255,0.9);text-shadow:0 1px 2px rgba(0,0,0,0.35);pointer-events:none}
    .panorama-content .widget .chart .bar-rect{width:68px;border-radius:10px 10px 0 0;height:8px;transition:height .5s cubic-bezier(.2,.8,.2,1);box-shadow:0 6px 16px rgba(93,211,158,0.25);will-change:height;
      background: linear-gradient(180deg, #73e6b6 0%, #5DD39E 60%, #3cbc82 100%);
    }
    .panorama-content .widget .chart .col.expense .bar-rect{
      background: linear-gradient(180deg, #ff9a9a 0%, #FF6B6B 60%, #e55656 100%);
      box-shadow:0 6px 16px rgba(255,107,107,0.25);
    }
    .panorama-content .widget .chart .bar-label{font-size:16px;font-weight:700;margin-bottom:6px}
    .panorama-content .widget .chart .baseline{position:absolute;left:12px;right:12px;bottom:12px;height:2px;background:rgba(255,255,255,0.26);border-radius:2px}
    
    /* Legacy yearly styles kept for other contexts; chart-area override above ensures transparency here */
    .panorama-content .widget .yearly-canvas{width:100%;max-width:100%;height:auto;display:block;box-sizing:border-box;transition:opacity .24s ease, transform .24s ease; will-change:opacity,transform}
    .panorama-content .widget .yearly-canvas.hidden{display:none}
    .panorama-content .widget .mode-hint{display:none}
    .panorama-content .budgets h4{margin:0;font-size:14px;opacity:.8;font-weight:500;text-transform:uppercase;letter-spacing:.06em}
    /* Unify scrolling: list should not have its own scroll */
    .panorama-content .budgets__list{display:flex;flex-direction:column;gap:8px}
    /* Slightly tighter spacing only inside the Panorama modal */
    .panorama-content .op-line.budget-card{ margin:6px 0 6px; }
    .panorama-content .budgets .empty{font-size:13px;text-align:center;margin-top:12px;opacity:.8}
    .panorama-content .budgets .empty.hidden{display:none}

    /* Light theme tweaks */
    html[data-theme="light"] .panorama-content{ color:#111; }
    html[data-theme="light"] .panorama-content .widget .widget-eyebrow{ color: rgba(0,0,0,0.55); }
    html[data-theme="light"] .panorama-content .widget .widget-title{ color: rgba(0,0,0,0.92); }
    html[data-theme="light"] .panorama-content .widget .view-toggle{
      border:1px solid rgba(0,0,0,0.18);
      background: rgba(0,0,0,0.06);
      color:#111;
    }
    html[data-theme="light"] .panorama-content .widget .widget-hairline{ background: rgba(0,0,0,0.08); }
    html[data-theme="light"] .panorama-content .widget .yearly-labels{ color: rgba(0,0,0,0.7); }
    html[data-theme="light"] .panorama-content .widget .chart .bar-value{
      color: rgba(0,0,0,0.75);
      text-shadow: none;
    }
    html[data-theme="light"] .panorama-content .widget .chart .baseline{ background: rgba(0,0,0,0.18); }
    html[data-theme="light"] .panorama-content .widget .chart .bar-rect{ box-shadow: 0 4px 10px rgba(0,0,0,0.08); }
    html[data-theme="light"] .panorama-content .widget .chart .col.expense .bar-rect{ box-shadow: 0 4px 10px rgba(0,0,0,0.08); }
    /* Cards in Panorama now reuse accordion card styles (budget-card-styles) */
  `;
  document.head.appendChild(st);
}

// Ensure the accordion budget card styles are available in this view too
function ensureBudgetCardStylesIfNeeded() {
  if (document.getElementById('budget-card-styles')) return;
  try {
    const st = document.createElement('style');
    st.id = 'budget-card-styles';
    st.textContent = `
      .op-line.budget-card{position:relative;margin:10px 0 8px;width:100%;box-sizing:border-box;padding:12px 14px;border-radius:14px;background:linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.08);box-shadow:0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:transform .15s ease, box-shadow .2s ease;color: var(--txt-main, #EDEDEF);}
      .op-line.budget-card:active{ transform: scale(0.995); }
      .op-line.budget-card .budget-card__header{ display:flex; gap:6px; }
      .op-line.budget-card .budget-tag-pill{ display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; color:#2B8B66; background:rgba(93,211,158,0.16); border:1px solid #5DD39E; }
      .op-line.budget-card .budget-card__period{ color: rgba(255,255,255,0.75); font-size:12px; }
      .op-line.budget-card .budget-card__details{ display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:13px; color: var(--txt-main, #EDEDEF); }
      .op-line.budget-card .budget-card__main{ font-weight:700; font-size:15px; }
      .op-line.budget-card .budget-card__main[data-state="warn"]{ color:#FFC65A; }
      .op-line.budget-card .budget-card__main[data-state="over"]{ color:#FF6B6B; }
      .op-line.budget-card .budget-card__total{ opacity:.8; font-size:12px; }
      .op-line.budget-card .budget-card__progress{ height:6px; background: rgba(255,255,255,0.22); border-radius: 6px; overflow:hidden; margin-top:10px; position:relative; }
      .op-line.budget-card .budget-card__progress::before{ content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0)); }
      .op-line.budget-card .budget-card__progress-fill{ height:100%; border-radius:6px; transition: width .35s ease, background .2s ease; background: linear-gradient(90deg, #5DD39E, #3ecf8e); }
      .op-line.budget-card .budget-card__progress-fill[data-state="warn"]{ background: linear-gradient(90deg, #FFB703, #FFA23A); }
      .op-line.budget-card .budget-card__progress-fill[data-state="over"]{ background: linear-gradient(90deg, #FF6B6B, #F05050); }
      html[data-theme="light"] .op-line.budget-card{ background:#ffffffec; border:1px solid rgba(0,0,0,0.10); box-shadow:0 6px 14px rgba(0,0,0,0.08); color:#111; }
      html[data-theme="light"] .op-line.budget-card .budget-card__period{ color: rgba(0,0,0,0.6); }
      html[data-theme="light"] .op-line.budget-card .budget-tag-pill{ color:#1f6b53; background:rgba(46,191,140,0.12); border-color:#2B8B66; }
      html[data-theme="light"] .op-line.budget-card .budget-card__details{ color:#111; }
      html[data-theme="light"] .op-line.budget-card .budget-card__main[data-state="warn"]{ color:#B26A00; }
      html[data-theme="light"] .op-line.budget-card .budget-card__main[data-state="over"]{ color:#C53030; }
      html[data-theme="light"] .op-line.budget-card .budget-card__progress{ background: rgba(0,0,0,0.12); }
    `;
    document.head.appendChild(st);
  } catch (_) {}
}
